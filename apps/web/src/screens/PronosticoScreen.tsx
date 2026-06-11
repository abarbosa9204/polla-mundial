import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { esEliminatoria, calcularPuntos, MARGEN_CIERRE_MS } from '@polla/core';
import type { ConfigPuntos, Fase, DesglosePartido, PronosticoPartidoInput } from '@polla/core';
import type { PronosticoRow } from '@polla/data';
import { describirDesglose } from '../lib/desglose.js';
import { fetchPartidos, fetchEquipos, fetchMisPronosticos, fetchConfigPuntos, fetchMisDesgloses } from '../lib/queries.js';
import { guardarPronostico, ApiError } from '../lib/api.js';
import { encolar } from '../lib/colaPronosticos.js';
import { useAuth } from '../auth/AuthProvider.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { Header, Cargando, RelojColombia } from './CalendarioScreen.js';
import { NOMBRE_FASE, MULTIPLICADOR_FASE, fmtFechaHora, fmtFechaHoraLarga } from '../lib/fases.js';
import { useCountdown, useOnline } from '../lib/hooks.js';

export function PronosticoScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const online = useOnline();
  const qc = useQueryClient();
  const { userId } = useAuth();

  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const mios = useQuery({ queryKey: ['misPronosticos'], queryFn: fetchMisPronosticos });
  const config = useQuery({ queryKey: ['configPuntos'], queryFn: fetchConfigPuntos });
  const desgloses = useQuery({ queryKey: ['misDesgloses'], queryFn: fetchMisDesgloses });

  const partido = partidos.data?.find((p) => p.id === id);
  const mio = mios.data?.find((p) => p.partido_id === id);
  const miDesglose = desgloses.data?.find((d) => d.partido_id === id);

  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [ea, setEa] = useState('');
  const [eb, setEb] = useState('');
  const [ganador, setGanador] = useState<'A' | 'B' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Precargar mi pronóstico existente.
  useEffect(() => {
    if (mio) {
      setA(String(mio.marcador_a_90));
      setB(String(mio.marcador_b_90));
      setEa(mio.extra_a != null ? String(mio.extra_a) : '');
      setEb(mio.extra_b != null ? String(mio.extra_b) : '');
      setGanador(mio.ganador_final);
    }
  }, [mio]);

  const { cerrado, etiqueta } = useCountdown(partido?.kickoff_utc ?? null, MARGEN_CIERRE_MS);

  if (partidos.isLoading || !partido) return <Cargando />;

  const elim = esEliminatoria(partido.fase);
  const apiIniciado = ['IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED'].includes(partido.estado);
  const cerradoEdicion = cerrado || apiIniciado;

  // Al cambiar el marcador de los 90', se resetea la sección de eliminatoria
  // (el tiempo extra/penales solo aplica si el marcador queda empatado).
  const cambiarMarcador = (lado: 'a' | 'b', valor: string) => {
    const limpio = valor.replace(/\D/g, '').slice(0, 2);
    if (lado === 'a') setA(limpio);
    else setB(limpio);
    setEa('');
    setEb('');
    setGanador(null);
  };
  // Al cambiar el marcador del tiempo extra, se re-evalúa si hay penales ⇒ se
  // resetea "quién avanza" (solo se elige si el extra también queda empatado).
  const cambiarExtra = (lado: 'a' | 'b', valor: string) => {
    const limpio = valor.replace(/\D/g, '').slice(0, 2);
    if (lado === 'a') setEa(limpio);
    else setEb(limpio);
    setGanador(null);
  };

  async function onSubmit() {
    if (!id) return;
    setMsg(null);
    const golesA = parseInt(a, 10);
    const golesB = parseInt(b, 10);
    if (Number.isNaN(golesA) || Number.isNaN(golesB)) {
      setMsg({ tipo: 'err', texto: 'Ingresa el marcador de ambos equipos.' });
      return;
    }
    // --- Definición de eliminatoria (depende del marcador) ---
    let elimFields: Record<string, unknown> = {};
    if (elim) {
      if (golesA !== golesB) {
        // Hay ganador en los 90': avanza ese equipo, sin tiempo extra.
        elimFields = { habraExtra: false, marcadorExtra: null, ganadorFinal: (golesA > golesB ? 'A' : 'B') as 'A' | 'B' };
      } else {
        // Empate en los 90' ⇒ tiempo extra. El marcador del extra es OBLIGATORIO.
        const gea = parseInt(ea, 10);
        const geb = parseInt(eb, 10);
        if (ea === '' || eb === '' || Number.isNaN(gea) || Number.isNaN(geb)) {
          setMsg({ tipo: 'err', texto: 'Empate en los 90′: ingresa el marcador del tiempo extra.' });
          return;
        }
        let gFinal: 'A' | 'B';
        if (gea !== geb) {
          // Gana en el tiempo extra: avanza ese equipo (no hay penales).
          gFinal = gea > geb ? 'A' : 'B';
        } else {
          // Empate también en el extra ⇒ penales: elegir quién avanza es OBLIGATORIO.
          if (ganador == null) {
            setMsg({ tipo: 'err', texto: 'Empate también en el extra: elige quién avanza por penales.' });
            return;
          }
          gFinal = ganador;
        }
        elimFields = { habraExtra: true, marcadorExtra: { golesA: gea, golesB: geb }, ganadorFinal: gFinal };
      }
    }
    const payload = { marcador90: { golesA, golesB }, ...elimFields };

    // --- Actualización OPTIMISTA: la tarjeta "Tu pronóstico" cambia al instante.
    // Guardamos una foto del estado previo para revertir si el servidor rechaza.
    const previo = qc.getQueryData<PronosticoRow[]>(['misPronosticos']);
    qc.setQueryData<PronosticoRow[]>(['misPronosticos'], (old) =>
      aplicarOptimista(old ?? [], id, payload, mio, userId),
    );

    // Sin conexión: se guarda en la cola local con su hora y se sincroniza luego.
    // (La fila optimista queda visible; la cola la confirmará al volver internet.)
    if (!navigator.onLine) {
      encolar(id, payload);
      setMsg({ tipo: 'ok', texto: 'Guardado sin conexión ✓ Se registrará solo cuando vuelva internet.' });
      return;
    }

    setGuardando(true);
    try {
      const r = await guardarPronostico(id, payload);
      setMsg({ tipo: 'ok', texto: `Guardado ✓ (registrado ${fmtFechaHoraLarga(r.registradoEn)})` });
      // Reconciliar con el servidor (id/versión/hora reales).
      mios.refetch();
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'OFFLINE' || err.code === 'NETWORK')) {
        // Se cayó la red en pleno envío: encolar y conservar la fila optimista.
        encolar(id, payload);
        setMsg({ tipo: 'ok', texto: 'Sin conexión: guardado localmente, se sincronizará automáticamente.' });
      } else {
        // Rechazo real (p. ej. partido cerrado): revertir al estado previo.
        qc.setQueryData<PronosticoRow[]>(['misPronosticos'], previo ?? []);
        const texto =
          err instanceof ApiError
            ? err.code === 'LOCKED'
              ? 'El partido ya cerró: no se puede guardar.'
              : err.message
            : 'No se pudo guardar.';
        setMsg({ tipo: 'err', texto });
      }
    } finally {
      setGuardando(false);
    }
  }

  const bloqueado = cerradoEdicion;
  // Derivados del marcador de los 90' para la lógica de eliminatoria.
  const gA90 = parseInt(a, 10);
  const gB90 = parseInt(b, 10);
  const ambosLlenos = a !== '' && b !== '' && !Number.isNaN(gA90) && !Number.isNaN(gB90);
  const empate90 = ambosLlenos && gA90 === gB90;
  const ganaA90 = ambosLlenos && gA90 > gB90;
  const nombreA = equipos.data?.get(partido.equipo_a ?? '')?.nombre ?? 'Equipo A';
  const nombreB = equipos.data?.get(partido.equipo_b ?? '')?.nombre ?? 'Equipo B';
  // Derivados del tiempo extra (solo relevantes si empate90).
  const gEA = parseInt(ea, 10);
  const gEB = parseInt(eb, 10);
  const extraLleno = ea !== '' && eb !== '' && !Number.isNaN(gEA) && !Number.isNaN(gEB);
  const empateExtra = extraLleno && gEA === gEB;
  const ganaExtraA = extraLleno && gEA > gEB;

  return (
    <div>
      <Header titulo="Mi pronóstico" accion={<div className="flex items-center gap-3"><RelojColombia /><button onClick={() => nav(-1)} className="text-slate-400 text-sm">Volver</button></div>} />
      <div className="px-4 space-y-4">
        <div className="card p-4">
          <div className="text-[11px] text-slate-400 flex justify-between">
            <span>
              {NOMBRE_FASE[partido.fase]}
              {MULTIPLICADOR_FASE[partido.fase] > 1 && (
                <span className="ml-1 text-brand">×{MULTIPLICADOR_FASE[partido.fase]}</span>
              )}
            </span>
            <span>{fmtFechaHora(partido.kickoff_utc)}</span>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 flex justify-end"><TeamBadge equipo={partido.equipo_a ? equipos.data?.get(partido.equipo_a) : undefined} /></div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input inputMode="numeric" className="input-score" value={a} disabled={bloqueado}
                onChange={(e) => cambiarMarcador('a', e.target.value)} />
              <span className="text-slate-500">-</span>
              <input inputMode="numeric" className="input-score" value={b} disabled={bloqueado}
                onChange={(e) => cambiarMarcador('b', e.target.value)} />
            </div>
            <div className="min-w-0"><TeamBadge equipo={partido.equipo_b ? equipos.data?.get(partido.equipo_b) : undefined} /></div>
          </div>

          <div className="mt-3 text-center">
            {apiIniciado ? (
              <span className="text-red-400 text-sm font-semibold">🔒 El partido ya inició — pronóstico cerrado</span>
            ) : cerrado ? (
              <span className="text-red-400 text-sm font-semibold">🔒 Cerrado — faltan menos de 5 min para el inicio</span>
            ) : (
              <span className="text-sm text-slate-400">
                Cierra en <b className="text-brand tabular-nums">{etiqueta}</b>
                <span className="block text-[10px] text-slate-500">(5 min antes del inicio)</span>
              </span>
            )}
          </div>
        </div>

        <ResumenPronostico mio={mio} partido={partido} desglose={miDesglose} cerrado={cerradoEdicion} etiqueta={etiqueta} />

        {elim && (
          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-200">Definición (eliminatoria)</p>

            {!ambosLlenos ? (
              <p className="text-xs text-slate-400">Primero ingresa arriba el marcador de los 90′.</p>
            ) : !empate90 ? (
              <p className="text-sm text-slate-300">
                Con tu marcador, <b className="text-brand">avanza {ganaA90 ? nombreA : nombreB}</b> (gana en los
                90′). No hay tiempo extra.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-400">
                  Empate en los 90′: el partido se define en <b>tiempo extra</b> y, si sigue empatado, en
                  <b> penales</b>.
                </p>
                {/* Marcador al final del tiempo extra (OBLIGATORIO si hay empate en los 90') */}
                <div>
                  <p className="text-xs text-slate-400 mb-1 text-center">
                    Marcador al final del tiempo extra <span className="text-brand">(obligatorio)</span>:
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <input inputMode="numeric" className="input-score !w-12 !h-12 !text-lg" value={ea} disabled={bloqueado}
                      onChange={(e) => cambiarExtra('a', e.target.value)} />
                    <span>-</span>
                    <input inputMode="numeric" className="input-score !w-12 !h-12 !text-lg" value={eb} disabled={bloqueado}
                      onChange={(e) => cambiarExtra('b', e.target.value)} />
                  </div>
                </div>

                {/* Definición tras el tiempo extra: gana uno → avanza solo; empata → penales. */}
                {!extraLleno ? (
                  <p className="text-xs text-slate-400">Ingresa el marcador del tiempo extra para definir quién avanza.</p>
                ) : !empateExtra ? (
                  <p className="text-sm text-slate-300">
                    Con tu marcador del extra, <b className="text-brand">avanza {ganaExtraA ? nombreA : nombreB}</b> (gana
                    en el tiempo extra). No hay penales.
                  </p>
                ) : (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">
                      Empate también en el extra → <b>penales</b>. ¿Quién avanza? <span className="text-brand">(obligatorio · suma puntos)</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button disabled={bloqueado} onClick={() => setGanador('A')}
                        className={`btn min-w-0 ${ganador === 'A' ? 'bg-brand text-white' : 'bg-white/5'}`}>
                        <span className="truncate">{nombreA}</span>
                      </button>
                      <button disabled={bloqueado} onClick={() => setGanador('B')}
                        className={`btn min-w-0 ${ganador === 'B' ? 'bg-brand text-white' : 'bg-white/5'}`}>
                        <span className="truncate">{nombreB}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {config.data && (
          <PuntosPosibles
            config={config.data}
            fase={partido.fase}
            elim={elim}
            a={a}
            b={b}
            ea={ea}
            eb={eb}
            ganador={ganador}
          />
        )}

        {msg && (
          <p className={`text-sm text-center ${msg.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.texto}
          </p>
        )}

        {!online && !cerradoEdicion && (
          <p className="text-amber-400 text-sm text-center">Sin conexión: tu marcador se guardará y se sincronizará al volver internet.</p>
        )}

        <button onClick={onSubmit} disabled={bloqueado || guardando} className="btn-primary w-full">
          {guardando
            ? 'Guardando…'
            : cerradoEdicion
              ? 'Pronóstico cerrado'
              : !online
                ? mio ? 'Actualizar sin conexión' : 'Guardar sin conexión'
                : mio ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
        </button>
      </div>
    </div>
  );
}

function ResumenPronostico({
  mio,
  partido,
  desglose,
  cerrado,
  etiqueta,
}: {
  mio: import('@polla/data').PronosticoRow | undefined;
  partido: import('@polla/data').PartidoRow;
  desglose: import('@polla/data').DesgloseRow | undefined;
  cerrado: boolean;
  etiqueta: string;
}) {
  const finalizado = partido.estado === 'FINISHED';
  const enVivo = partido.estado === 'IN_PLAY' || partido.estado === 'PAUSED';
  const conResultado = (finalizado || enVivo) && partido.goles_a_90 != null && partido.goles_b_90 != null;
  const d = desglose?.desglose as DesglosePartido | undefined;

  return (
    <div className="card p-4 space-y-2">
      {/* Editable / cerrado */}
      <div className={`text-sm font-semibold ${cerrado ? 'text-red-400' : 'text-emerald-400'}`}>
        {cerrado
          ? '🔒 Cerrado — ya no se puede editar'
          : `✏️ Editable · cierra en ${etiqueta} (5 min antes del inicio)`}
      </div>

      {/* Tu pronóstico */}
      {mio ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Tu pronóstico</span>
          <span className="text-lg font-bold tabular-nums">{mio.marcador_a_90} - {mio.marcador_b_90}</span>
        </div>
      ) : (
        <p className="text-sm text-amber-300">
          Aún no has pronosticado. Si no registras tu marcador antes del cierre, sumas <b>0 puntos</b> en este partido.
        </p>
      )}
      {mio && (
        <p className="text-[11px] text-slate-500">
          Registrado: {fmtFechaHoraLarga(mio.updated_at_server ?? mio.created_at_server)} (v{mio.version})
        </p>
      )}

      {/* Resultado + si atinó + puntos */}
      {conResultado && (
        <div className="border-t border-white/5 pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">{finalizado ? 'Resultado final' : 'Marcador (en vivo)'}</span>
            <span className="text-lg font-bold tabular-nums">{partido.goles_a_90} - {partido.goles_b_90}</span>
          </div>
          {mio && desglose && d && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{describirDesglose(d)}</span>
              <span className={`text-sm font-bold tabular-nums shrink-0 ${desglose.puntos > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {desglose.provisional ? 'En juego' : 'Ganaste'} {desglose.puntos} pts
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PuntosPosibles({
  config,
  fase,
  elim,
  a,
  b,
  ea,
  eb,
  ganador,
}: {
  config: ConfigPuntos;
  fase: Fase;
  elim: boolean;
  a: string;
  b: string;
  ea: string;
  eb: string;
  ganador: 'A' | 'B' | null;
}) {
  const mult = config.multiplicadores[fase];
  const golesA = parseInt(a, 10);
  const golesB = parseInt(b, 10);
  const tieneMarcador = !Number.isNaN(golesA) && !Number.isNaN(golesB);
  const empate90 = tieneMarcador && golesA === golesB;

  // Máximo real con ESTE pronóstico = puntuarlo como si el resultado fuera idéntico.
  // En eliminatoria, el tiempo extra solo aplica si el marcador de los 90' empata.
  let maximo = 0;
  if (tieneMarcador) {
    const gEA = parseInt(ea, 10);
    const gEB = parseInt(eb, 10);
    const extra = elim && empate90 && ea !== '' && eb !== '' && !Number.isNaN(gEA) && !Number.isNaN(gEB)
      ? { golesA: gEA, golesB: gEB }
      : null;
    const gana90: 'A' | 'B' = golesA > golesB ? 'A' : 'B';
    // En empate de los 90': si el extra tiene ganador, avanza ese equipo; si el extra empata, vale el pick manual (penales).
    const ganadorElim: 'A' | 'B' | null = empate90
      ? extra
        ? extra.golesA !== extra.golesB
          ? (extra.golesA > extra.golesB ? 'A' : 'B')
          : ganador
        : null
      : gana90;
    const elimFields = elim
      ? empate90
        ? { habraExtra: true, marcadorExtra: extra, ganadorFinal: ganadorElim }
        : { habraExtra: false, marcadorExtra: null, ganadorFinal: gana90 }
      : {};
    const pred = { marcador90: { golesA, golesB }, ...elimFields };
    const result = {
      marcador90: { golesA, golesB },
      ...(elim ? { huboExtra: empate90, marcadorExtra: extra, ganadorFinal: empate90 ? ganadorElim : gana90 } : {}),
    };
    maximo = calcularPuntos(pred, result, fase, config).total;
  }

  const fmt = (v: number) => `${v} × ${mult} = ${v * mult}`;

  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Puntos en juego</h3>
        {mult > 1 && <span className="text-[11px] text-brand">Fase ×{mult}</span>}
      </div>

      {tieneMarcador && (
        <div className="rounded-xl bg-brand/10 ring-1 ring-brand/30 p-3 text-center mb-2">
          <p className="text-xs text-slate-300">Máximo si tu pronóstico es exacto</p>
          <p className="text-3xl font-bold text-brand tabular-nums">{maximo}</p>
          <p className="text-[11px] text-slate-400">puntos</p>
        </div>
      )}

      <Razon texto="🎯 Marcador exacto (90′)" detalle={fmt(config.base.marcadorExacto)} />
      <Razon texto="✓ Acertar quién gana o si empatan" detalle={fmt(config.base.resultado1X2)} />
      <Razon texto="✓ Acertar total de goles" detalle={fmt(config.base.totalGoles)} />

      {elim && tieneMarcador && (empate90 ? (
        <>
          <Razon texto="⏱️ Acertar que se define en extra/penales" detalle={fmt(config.extras.acertarHuboExtra)} />
          <Razon texto="🎯 Marcador exacto del tiempo extra" detalle={fmt(config.extras.marcadorExtraExacto)} activo={ea !== '' && eb !== ''} />
          <Razon texto="🏅 Acertar quién avanza" detalle={fmt(config.extras.ganadorFinal)} activo={ganador !== null} />
        </>
      ) : (
        <>
          <Razon texto="⏱️ Acertar que no hay tiempo extra" detalle={fmt(config.extras.acertarHuboExtra)} />
          <Razon texto="🏅 Acertar quién avanza (gana en los 90′)" detalle={fmt(config.extras.ganadorFinal)} />
        </>
      ))}

      <p className="text-[11px] text-slate-500 pt-1">
        El marcador exacto ya incluye el resultado y el total (no se suman). Todo se multiplica por la fase.
      </p>
    </div>
  );
}

/**
 * Construye la fila optimista del pronóstico recién enviado y la mezcla en el
 * arreglo de `misPronosticos` (reemplaza la del mismo partido o la agrega). Los
 * campos id/versión/hora son provisionales: el `refetch` posterior los corrige
 * con los reales del servidor. Sirve solo para que la UI responda al instante.
 */
function aplicarOptimista(
  old: PronosticoRow[],
  partidoId: string,
  payload: PronosticoPartidoInput,
  mio: PronosticoRow | undefined,
  userId: string | null,
): PronosticoRow[] {
  const ahora = new Date().toISOString();
  const extra = payload.marcadorExtra ?? null;
  const fila: PronosticoRow = {
    id: mio?.id ?? `optimista:${partidoId}`,
    user_id: mio?.user_id ?? userId ?? '',
    partido_id: partidoId,
    marcador_a_90: payload.marcador90.golesA,
    marcador_b_90: payload.marcador90.golesB,
    habra_extra: payload.habraExtra ?? null,
    extra_a: extra ? extra.golesA : null,
    extra_b: extra ? extra.golesB : null,
    ganador_final: payload.ganadorFinal ?? null,
    created_at_server: mio?.created_at_server ?? ahora,
    updated_at_server: ahora,
    version: (mio?.version ?? 0) + 1,
  };
  return [...old.filter((p) => p.partido_id !== partidoId), fila];
}

function Razon({ texto, detalle, activo = true }: { texto: string; detalle: string; activo?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 border-t border-white/5 ${activo ? '' : 'opacity-40'}`}>
      <span className="text-sm text-slate-300">{texto}</span>
      <span className="text-sm font-semibold text-slate-200 tabular-nums shrink-0 ml-3">{detalle}</span>
    </div>
  );
}

