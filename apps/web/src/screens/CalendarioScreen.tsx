import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPartidos, fetchEquipos, fetchMisPronosticos, fetchMisDesgloses } from '../lib/queries.js';
import { supabase } from '../lib/supabase.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { SelectorBuscador, type OpcionSelector } from '../components/SelectorBuscador.js';
import { NOMBRE_FASE, MULTIPLICADOR_FASE, fmtFechaHora, TZ_POLLA } from '../lib/fases.js';
import { useCountdown, useRelojColombia } from '../lib/hooks.js';
import { AccountMenu } from '../components/AccountMenu.js';
import { MARGEN_CIERRE_MS } from '@polla/core';
import type { PartidoRow } from '@polla/data';

type Vista = 'tarjetas' | 'tabla';
const VISTA_KEY = 'polla:vista-partidos';

function leerVista(): Vista {
  try {
    return localStorage.getItem(VISTA_KEY) === 'tabla' ? 'tabla' : 'tarjetas';
  } catch {
    return 'tarjetas';
  }
}

export function CalendarioScreen() {
  const qc = useQueryClient();
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const mios = useQuery({ queryKey: ['misPronosticos'], queryFn: fetchMisPronosticos });
  const desgloses = useQuery({ queryKey: ['misDesgloses'], queryFn: fetchMisDesgloses });

  const [vista, setVista] = useState<Vista>(leerVista);
  const [grupo, setGrupo] = useState('');
  const [equipo, setEquipo] = useState('');

  // Guarda la preferencia de vista (se respeta al volver a entrar).
  useEffect(() => {
    try {
      localStorage.setItem(VISTA_KEY, vista);
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  }, [vista]);

  // Realtime: cualquier cambio en partidos refresca la lista (marcadores en vivo).
  useEffect(() => {
    const ch = supabase
      .channel('partidos-cal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, () => {
        qc.invalidateQueries({ queryKey: ['partidos'] });
        qc.invalidateQueries({ queryKey: ['misDesgloses'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const lista = useMemo(() => partidos.data ?? [], [partidos.data]);

  // Grupos disponibles (de los partidos de fase de grupos).
  const grupos = useMemo(
    () => [...new Set(lista.map((p) => p.grupo).filter((g): g is string => !!g))].sort(),
    [lista],
  );

  // Equipos que aparecen en el fixture, como opciones del buscador (con bandera).
  const opcionesEquipo = useMemo<OpcionSelector[]>(() => {
    const ids = new Set<string>();
    for (const p of lista) {
      if (p.equipo_a) ids.add(p.equipo_a);
      if (p.equipo_b) ids.add(p.equipo_b);
    }
    return [...ids]
      .map((id) => {
        const e = equipos.data?.get(id);
        return { value: id, label: e?.nombre ?? id, img: e?.crest_url ?? null, badge: id };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [lista, equipos.data]);

  const filtrada = useMemo(
    () =>
      lista.filter(
        (p) =>
          (!grupo || p.grupo === grupo) &&
          (!equipo || p.equipo_a === equipo || p.equipo_b === equipo),
      ),
    [lista, grupo, equipo],
  );

  if (partidos.isLoading) return <Cargando />;
  if (partidos.error) return <ErrorMsg />;

  const hayFiltro = !!grupo || !!equipo;
  const limpiar = () => {
    setGrupo('');
    setEquipo('');
  };
  const seg = (activo: boolean) =>
    `px-2.5 py-1 rounded-md transition ${activo ? 'bg-brand text-white' : 'text-slate-300'}`;

  return (
    <div>
      <Header titulo="Partidos" accion={<div className="flex items-center gap-2"><RelojColombia /><AccountMenu /></div>} />

      {/* Controles: conteo + toggle de vista, filtro por equipo y por grupo */}
      <div className="px-3 pt-1 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">
            {filtrada.length} partido{filtrada.length === 1 ? '' : 's'}
            {hayFiltro && (
              <button onClick={limpiar} className="ml-2 text-brand">Limpiar filtros</button>
            )}
          </span>
          <div className="inline-flex rounded-lg bg-slate-800 ring-1 ring-white/10 p-0.5 text-xs">
            <button onClick={() => setVista('tarjetas')} className={seg(vista === 'tarjetas')}>Tarjetas</button>
            <button onClick={() => setVista('tabla')} className={seg(vista === 'tabla')}>Tabla</button>
          </div>
        </div>

        <SelectorBuscador
          opciones={opcionesEquipo}
          value={equipo}
          onChange={setEquipo}
          placeholder="Buscar equipo…"
          vacioLabel="Todos los equipos"
        />

        {grupos.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <Pill activo={grupo === ''} onClick={() => setGrupo('')}>Todos</Pill>
            {grupos.map((g) => (
              <Pill key={g} activo={grupo === g} onClick={() => setGrupo(g)}>
                Grupo {g}
              </Pill>
            ))}
          </div>
        )}
      </div>

      <div className={`px-3 ${vista === 'tabla' ? 'space-y-1.5' : 'space-y-2'}`}>
        {filtrada.map((p) => {
          const mio = mios.data?.find((m) => m.partido_id === p.id);
          const desglose = desgloses.data?.find((d) => d.partido_id === p.id);
          return vista === 'tabla' ? (
            <PartidoFila key={p.id} p={p} equipos={equipos.data} mio={mio} desglose={desglose} />
          ) : (
            <PartidoCard key={p.id} p={p} equipos={equipos.data} mio={mio} desglose={desglose} />
          );
        })}

        {filtrada.length === 0 && lista.length > 0 && (
          <p className="text-center text-slate-400 py-10">
            No hay partidos con esos filtros.{' '}
            <button onClick={limpiar} className="text-brand">Limpiar</button>
          </p>
        )}
        {lista.length === 0 && (
          <p className="text-center text-slate-400 py-10">
            Aún no hay partidos cargados. Se actualizarán automáticamente.
          </p>
        )}
      </div>
    </div>
  );
}

function Pill({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs ring-1 transition ${
        activo ? 'bg-brand text-white ring-brand' : 'bg-slate-800 text-slate-300 ring-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function PartidoCard({
  p,
  equipos,
  mio,
  desglose,
}: {
  p: PartidoRow;
  equipos: Map<string, { id: string; nombre: string; crest_url: string | null }> | undefined;
  mio: import('@polla/data').PronosticoRow | undefined;
  desglose: import('@polla/data').DesgloseRow | undefined;
}) {
  const { cerrado, etiqueta } = useCountdown(p.kickoff_utc, MARGEN_CIERRE_MS);
  const enVivo = p.estado === 'IN_PLAY' || p.estado === 'PAUSED';
  const finalizado = p.estado === 'FINISHED';
  const yaInicio = enVivo || finalizado || cerrado;

  return (
    <Link
      to={yaInicio ? `/partido/${p.id}/global` : `/partido/${p.id}`}
      className="card p-3 flex items-center gap-3 active:scale-[0.99] transition block"
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {NOMBRE_FASE[p.fase]}
            {MULTIPLICADOR_FASE[p.fase] > 1 && (
              <span className="ml-1 text-brand">×{MULTIPLICADOR_FASE[p.fase]}</span>
            )}
            {p.grupo && <span className="ml-1">· Grupo {p.grupo}</span>}
          </span>
          {enVivo ? (
            <span className="text-red-400 font-semibold animate-pulse">● EN VIVO</span>
          ) : finalizado ? (
            <span>Final</span>
          ) : (
            <span>{fmtFechaHora(p.kickoff_utc)}</span>
          )}
        </div>

        <Equipo equipos={equipos} id={p.equipo_a} goles={mostrarGoles(p, 'a')} />
        <Equipo equipos={equipos} id={p.equipo_b} goles={mostrarGoles(p, 'b')} />

        {mio ? (
          <div className="text-[10px] flex items-center gap-1.5 pt-0.5">
            <span className="text-brand">✓ Pronosticaste {mio.marcador_a_90}-{mio.marcador_b_90}</span>
            {desglose && (finalizado || enVivo) && (
              <span className={desglose.puntos > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                · {desglose.provisional ? '~' : '+'}{desglose.puntos} pts
              </span>
            )}
          </div>
        ) : !yaInicio ? (
          <div className="text-[10px] text-amber-300/80 pt-0.5">Sin pronóstico aún</div>
        ) : null}
      </div>

      <div className="text-right shrink-0 w-20">
        {yaInicio ? (
          <span className="text-[11px] text-slate-400">Ver pronósticos →</span>
        ) : (
          <>
            <div className="text-[10px] text-slate-500">cierra en</div>
            <div className="text-sm font-bold text-brand tabular-nums">{etiqueta}</div>
          </>
        )}
      </div>
    </Link>
  );
}

/** Fila compacta (vista "Tabla"): una línea por partido, denso pero legible. */
function PartidoFila({
  p,
  equipos,
  mio,
  desglose,
}: {
  p: PartidoRow;
  equipos: Map<string, { id: string; nombre: string; crest_url: string | null }> | undefined;
  mio: import('@polla/data').PronosticoRow | undefined;
  desglose: import('@polla/data').DesgloseRow | undefined;
}) {
  const { cerrado, etiqueta } = useCountdown(p.kickoff_utc, MARGEN_CIERRE_MS);
  const enVivo = p.estado === 'IN_PLAY' || p.estado === 'PAUSED';
  const finalizado = p.estado === 'FINISHED';
  const yaInicio = enVivo || finalizado || cerrado;
  const golesA = mostrarGoles(p, 'a');
  const golesB = mostrarGoles(p, 'b');
  const { dia, hora } = fechaCompacta(p.kickoff_utc);

  return (
    <Link
      to={yaInicio ? `/partido/${p.id}/global` : `/partido/${p.id}`}
      className="card px-2.5 py-2 flex items-center gap-2 active:scale-[0.99] transition"
    >
      {/* Fecha / estado */}
      <div className="w-12 shrink-0 text-[10px] leading-tight text-slate-400">
        {enVivo ? (
          <span className="text-red-400 font-semibold animate-pulse">EN VIVO</span>
        ) : finalizado ? (
          <span>Final</span>
        ) : (
          <>
            <div>{dia}</div>
            <div className="tabular-nums">{hora}</div>
          </>
        )}
      </div>

      {/* Equipos (crest + sigla) + marcador */}
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <span className="text-xs font-medium truncate">{equipos?.get(p.equipo_a ?? '')?.id ?? '—'}</span>
          <MiniCrest equipo={p.equipo_a ? equipos?.get(p.equipo_a) : undefined} />
        </div>
        <span className="text-sm font-bold tabular-nums shrink-0 px-1">
          {golesA != null && golesB != null ? `${golesA}-${golesB}` : 'vs'}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          <MiniCrest equipo={p.equipo_b ? equipos?.get(p.equipo_b) : undefined} />
          <span className="text-xs font-medium truncate">{equipos?.get(p.equipo_b ?? '')?.id ?? '—'}</span>
        </div>
      </div>

      {/* Indicador de mi pronóstico / cierre */}
      <div className="w-12 shrink-0 text-right text-[10px] leading-tight">
        {mio ? (
          <span className="text-brand">
            ✓{desglose && (finalizado || enVivo) ? (
              <span className={desglose.puntos > 0 ? ' text-emerald-400' : ' text-slate-500'}>
                {' '}{desglose.provisional ? '~' : '+'}{desglose.puntos}
              </span>
            ) : null}
          </span>
        ) : yaInicio ? (
          <span className="text-slate-500">→</span>
        ) : (
          <span className="text-brand font-semibold tabular-nums">{etiqueta}</span>
        )}
      </div>
    </Link>
  );
}

/** Escudo pequeño (sin nombre) para la fila compacta. Cae a la sigla si no hay. */
function MiniCrest({ equipo }: { equipo: { id: string; crest_url: string | null } | undefined }) {
  if (equipo?.crest_url) {
    return (
      <img
        src={equipo.crest_url}
        alt=""
        loading="lazy"
        className="rounded-sm object-contain shrink-0"
        style={{ width: 18, height: 18 }}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-sm bg-slate-700 text-[8px] shrink-0"
      style={{ width: 18, height: 18 }}
    >
      {equipo?.id ?? '?'}
    </span>
  );
}

/** Fecha compacta (hora Colombia) en dos líneas: "12 jun" / "19:00". */
function fechaCompacta(iso: string): { dia: string; hora: string } {
  const d = new Date(iso);
  return {
    dia: d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: TZ_POLLA }),
    hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: TZ_POLLA }),
  };
}

function Equipo({
  equipos,
  id,
  goles,
}: {
  equipos: Map<string, { id: string; nombre: string; crest_url: string | null }> | undefined;
  id: string | null;
  goles: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <TeamBadge equipo={id ? equipos?.get(id) : undefined} wrap />
      {goles != null && <span className="text-lg font-bold tabular-nums shrink-0">{goles}</span>}
    </div>
  );
}

function mostrarGoles(p: PartidoRow, lado: 'a' | 'b'): number | null {
  if (p.estado === 'SCHEDULED' || p.estado === 'TIMED') return null;
  return lado === 'a' ? p.goles_a_90 : p.goles_b_90;
}

/** Reloj en vivo (hora Colombia) aislado, para no re-renderizar la lista. */
export function RelojColombia() {
  const hora = useRelojColombia();
  return <span className="text-[11px] text-slate-400 tabular-nums" title="Hora de Colombia">🕐 {hora}</span>;
}

export function Header({ titulo, accion }: { titulo: string; accion?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur px-4 py-3 flex items-center justify-between">
      <h1 className="text-lg font-bold">{titulo}</h1>
      {accion}
    </header>
  );
}

export function Cargando() {
  return <div className="grid place-items-center py-20 text-slate-400">Cargando…</div>;
}
export function ErrorMsg() {
  return <div className="grid place-items-center py-20 text-red-400">Error al cargar.</div>;
}
