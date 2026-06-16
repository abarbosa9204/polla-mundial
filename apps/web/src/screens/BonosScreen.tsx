import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEquipos, fetchJugadores, fetchMisBonos, fetchPartidos, fetchMisPronosticos, type EquipoView } from '../lib/queries.js';
import { guardarBonos, ApiError } from '../lib/api.js';
import { Header, Cargando } from './CalendarioScreen.js';
import { SelectorBuscador, type OpcionSelector } from '../components/SelectorBuscador.js';
import { proyectarClasificados } from '../lib/clasificacion.js';
import { fmtFechaHoraLarga } from '../lib/fases.js';
import { calcularCierresBonos, bonoEditable, type RondaClasif } from '../lib/bonosCierres.js';
import { useOnline } from '../lib/hooks.js';
import { CLASIFICADOS_POR_RONDA } from '@polla/core';

/** Línea de cierre por sección: "Cierra: <fecha>" o "🔒 Cerrado". */
function Cierre({ cierreMs, ahora }: { cierreMs: number | null; ahora: number }) {
  if (cierreMs === null) {
    return <p className="text-[11px] text-slate-500 mb-2">Cierre: cuando se defina el calendario.</p>;
  }
  const abierto = ahora < cierreMs;
  const fecha = fmtFechaHoraLarga(new Date(cierreMs).toISOString());
  return (
    <p className={`text-[11px] mb-2 ${abierto ? 'text-slate-400' : 'text-red-400 font-semibold'}`}>
      {abierto ? `Cierra: ${fecha} (Col)` : `🔒 Cerrado (${fecha})`}
    </p>
  );
}

function Bandera({ equipo }: { equipo?: EquipoView }) {
  if (!equipo) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-slate-800/60 rounded px-1.5 py-0.5" title={equipo.nombre}>
      {equipo.crest_url && <img src={equipo.crest_url} alt="" className="w-4 h-4 rounded-sm object-contain" />}
      <span className="text-slate-200">{equipo.id}</span>
    </span>
  );
}

const RONDAS = [
  { key: 'R32', label: 'Clasificados a 16avos', cantidad: CLASIFICADOS_POR_RONDA.R32, pts: 1 },
  { key: 'R16', label: 'Clasificados a octavos', cantidad: CLASIFICADOS_POR_RONDA.R16, pts: 2 },
  { key: 'CUARTOS', label: 'Clasificados a cuartos', cantidad: CLASIFICADOS_POR_RONDA.CUARTOS, pts: 3 },
  { key: 'SEMIS', label: 'Clasificados a semifinales', cantidad: CLASIFICADOS_POR_RONDA.SEMIS, pts: 5 },
  { key: 'FINAL', label: 'Clasificados a la final', cantidad: CLASIFICADOS_POR_RONDA.FINAL, pts: 8 },
] as const;

export function BonosScreen() {
  const online = useOnline();
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const jugadores = useQuery({ queryKey: ['jugadores'], queryFn: fetchJugadores });
  const mis = useQuery({ queryKey: ['misBonos'], queryFn: fetchMisBonos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const misPron = useQuery({ queryKey: ['misPronosticos'], queryFn: fetchMisPronosticos });

  const [campeon, setCampeon] = useState<string>('');
  const [goleador, setGoleador] = useState<string>('');
  const [clasificados, setClasificados] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (mis.data) {
      setCampeon(mis.data.campeon_equipo ?? '');
      setGoleador(mis.data.goleador_jugador ?? '');
      setClasificados(mis.data.clasificados ?? {});
    }
  }, [mis.data]);

  const equiposArr = useMemo(
    () => [...(equipos.data?.values() ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [equipos.data],
  );

  // Opciones para los selectores con buscador.
  const opcEquipos: OpcionSelector[] = useMemo(
    () => equiposArr.map((e) => ({ value: e.id, label: e.nombre, badge: e.id, img: e.crest_url })),
    [equiposArr],
  );
  const opcJugadores: OpcionSelector[] = useMemo(
    () =>
      (jugadores.data ?? []).map((j) => ({
        value: j.id,
        label: j.nombre,
        sub: j.equipo_id ? equipos.data?.get(j.equipo_id)?.nombre ?? undefined : undefined,
        // Sin foto del jugador (la fuente no la trae) ⇒ usamos la bandera de su selección.
        img: j.foto_url ?? (j.equipo_id ? equipos.data?.get(j.equipo_id)?.crest_url ?? null : null),
      })),
    [jugadores.data, equipos.data],
  );

  // Cierres POR RONDA (espejo de bonosLock). `ahora` fija el estado al render.
  const cierres = useMemo(() => calcularCierresBonos(partidos.data ?? []), [partidos.data]);
  const ahora = Date.now();
  const campeonEditable = bonoEditable(cierres.primerKickoffMs, ahora);

  // Proyección de clasificados a 16avos según los marcadores que el usuario pronosticó.
  const proy = useMemo(
    () => proyectarClasificados(partidos.data ?? [], misPron.data ?? [], equipos.data),
    [partidos.data, misPron.data, equipos.data],
  );
  const proyR32 = useMemo(() => {
    const ids: string[] = [];
    for (const g of proy.grupos) {
      if (g.filas[0]) ids.push(g.filas[0].equipoId);
      if (g.filas[1]) ids.push(g.filas[1].equipoId);
    }
    proy.mejoresTerceros.forEach((id) => ids.push(id));
    return ids;
  }, [proy]);

  if (equipos.isLoading) return <Cargando />;

  function toggleClasif(ronda: string, equipoId: string) {
    const max = CLASIFICADOS_POR_RONDA[ronda as keyof typeof CLASIFICADOS_POR_RONDA];
    const actual = clasificados[ronda] ?? [];
    const yaMarcado = actual.includes(equipoId);
    // Tope por ronda (regla 6.4): no se puede marcar más de las que avanzan.
    if (!yaMarcado && max != null && actual.length >= max) {
      setMsg({ tipo: 'err', texto: `Ya marcaste el máximo de ${max} en esta ronda. Quita una para cambiar.` });
      return;
    }
    setMsg(null);
    setClasificados((prev) => {
      const a = prev[ronda] ?? [];
      const nuevo = a.includes(equipoId) ? a.filter((x) => x !== equipoId) : [...a, equipoId];
      return { ...prev, [ronda]: nuevo };
    });
  }

  async function onSave() {
    setMsg(null);
    setGuardando(true);
    try {
      const r = await guardarBonos({ campeon: campeon || null, goleador: goleador || null, clasificados });
      const txt =
        r.rechazados.length > 0
          ? `Guardado. Cerrados (no aplicados): ${r.rechazados.join(', ')}`
          : 'Bonos guardados ✓';
      setMsg({ tipo: r.rechazados.length ? 'err' : 'ok', texto: txt });
      mis.refetch();
    } catch (err) {
      setMsg({ tipo: 'err', texto: err instanceof ApiError ? err.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <Header titulo="Bonos de torneo" />
      <div className="px-3 space-y-4">
        <section className="card p-4 space-y-2">
          <p className="text-sm text-slate-300">
            Aquí pronosticas el campeón, el goleador y qué selecciones clasifican a cada ronda.
            <b> Todo es opcional</b>, pero ten en cuenta: <b>solo ganas puntos por lo que elijas y aciertes</b>.
            Lo que dejes sin seleccionar, simplemente no suma.
          </p>
          <p className="text-sm rounded-lg bg-brand/10 ring-1 ring-brand/30 px-3 py-2 text-brand">
            ⏰ Cada pronóstico cierra en su <b>propia fecha</b> (se indica en cada sección). El <b>campeón</b>,
            el <b>goleador</b> y los <b>clasificados a 16avos</b> cierran con el primer partido
            {cierres.primerKickoffMs ? (
              <>: <b>{fmtFechaHoraLarga(new Date(cierres.primerKickoffMs).toISOString())}</b></>
            ) : null}{' '}
            (hora de Colombia). Las rondas siguientes cierran más adelante (cada una al iniciar su ronda previa).
          </p>
        </section>

        {/* Proyección de clasificados según los marcadores del usuario */}
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold text-sm">Según tus marcadores, clasificarían</h2>
          {!proy.hayPredicciones ? (
            <p className="text-xs text-slate-400">
              Pronostica los partidos de la fase de grupos y aquí verás, automáticamente, qué selecciones
              clasificarían a 16avos (los 2 primeros de cada grupo + los 8 mejores terceros).
            </p>
          ) : (
            <>
              <div className="space-y-1">
                {proy.grupos.map((g) => (
                  <div key={g.grupo} className="text-xs flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 w-16 shrink-0">Grupo {g.grupo}</span>
                    {[g.filas[0], g.filas[1]].filter(Boolean).map((f) => (
                      <Bandera key={f!.equipoId} equipo={equipos.data?.get(f!.equipoId)} />
                    ))}
                  </div>
                ))}
              </div>
              {proy.mejoresTerceros.size > 0 && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="shrink-0">Mejores terceros:</span>
                  {[...proy.mejoresTerceros].map((id) => (
                    <Bandera key={id} equipo={equipos.data?.get(id)} />
                  ))}
                </div>
              )}
              <button
                disabled={!bonoEditable(cierres.clasificados.R32, ahora)}
                onClick={() => setClasificados((c) => ({ ...c, R32: proyR32.slice(0, CLASIFICADOS_POR_RONDA.R32) }))}
                className="btn-ghost w-full text-xs disabled:opacity-50"
              >
                Usar esta proyección como mis clasificados a 16avos ({proyR32.length})
              </button>
            </>
          )}
        </section>

        {/* Campeón */}
        <section className="card p-4">
          <h2 className="font-semibold mb-1">🏆 Campeón del Mundial <span className="text-brand text-sm">+20</span></h2>
          <p className="text-xs text-slate-400 mb-1">Elige 1 selección. Si no eliges, no ganas estos 20 puntos.</p>
          <Cierre cierreMs={cierres.primerKickoffMs} ahora={ahora} />
          <SelectorBuscador
            opciones={opcEquipos}
            value={campeon}
            onChange={setCampeon}
            placeholder="Buscar selección…"
            vacioLabel="— Elegir campeón —"
            disabled={!campeonEditable}
          />
        </section>

        {/* Goleador */}
        <section className="card p-4">
          <h2 className="font-semibold mb-1">⚽ Goleador del Mundial <span className="text-brand text-sm">+15</span></h2>
          <p className="text-xs text-slate-400 mb-1">Elige 1 jugador. Si no eliges, no ganas estos 15 puntos.</p>
          <Cierre cierreMs={cierres.primerKickoffMs} ahora={ahora} />
          <SelectorBuscador
            opciones={opcJugadores}
            value={goleador}
            onChange={setGoleador}
            placeholder="Buscar jugador…"
            vacioLabel="— Elegir goleador —"
            disabled={!campeonEditable}
          />
          {opcJugadores.length === 0 && (
            <p className="text-xs text-slate-500 mt-2">Lista de jugadores aún no cargada.</p>
          )}
        </section>

        {/* Clasificados por ronda — chips con bandera + sigla */}
        {RONDAS.map((r) => {
          const sel = clasificados[r.key]?.length ?? 0;
          const completo = sel === r.cantidad;
          const cierreMs = cierres.clasificados[r.key as RondaClasif];
          const editable = bonoEditable(cierreMs, ahora);
          return (
          <section key={r.key} className="card p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-sm">{r.label} <span className="text-brand">+{r.pts} c/u</span></h2>
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${completo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>
                {sel}/{r.cantidad}
              </span>
            </div>
            <Cierre cierreMs={cierreMs} ahora={ahora} />
            <p className="text-[11px] text-slate-400 mb-2">
              Selecciona <b>{r.cantidad}</b> selecciones. Puedes marcar menos: solo ganas {r.pts} punto(s)
              por cada acierto; las que no marques no suman.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {equiposArr.map((e) => {
                const sel = (clasificados[r.key] ?? []).includes(e.id);
                // Al llegar al tope, los NO marcados se bloquean; los marcados
                // siguen activos para poder deseleccionar y cambiar.
                const bloqueado = !editable || (!sel && completo);
                return (
                  <button
                    key={e.id}
                    title={e.nombre}
                    disabled={bloqueado}
                    onClick={() => !bloqueado && toggleClasif(r.key, e.id)}
                    className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${
                      sel ? 'bg-brand text-white' : 'bg-white/5 text-slate-300'
                    } ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {e.crest_url && <img src={e.crest_url} alt="" className="w-4 h-4 rounded-sm object-contain" />}
                    {e.id}
                  </button>
                );
              })}
            </div>
            {/* Resumen con nombres de lo seleccionado */}
            {sel > 0 && (
              <p className="text-[11px] text-slate-400 mt-2">
                {(clasificados[r.key] ?? [])
                  .map((id) => equipos.data?.get(id)?.nombre ?? id)
                  .join(', ')}
              </p>
            )}
          </section>
          );
        })}

        {msg && <p className={`text-sm text-center ${msg.tipo === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`}>{msg.texto}</p>}
        {!online && <p className="text-amber-400 text-sm text-center">Sin conexión: no puedes guardar.</p>}
        <button onClick={onSave} disabled={!online || guardando} className="btn-primary w-full">
          {guardando ? 'Guardando…' : 'Guardar bonos'}
        </button>
      </div>
    </div>
  );
}
