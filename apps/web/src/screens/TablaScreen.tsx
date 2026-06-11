import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTabla, fetchPronosticosDeUsuario, fetchPartidos, fetchEquipos } from '../lib/queries.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.js';
import { Header, Cargando } from './CalendarioScreen.js';
import type { TablaPosicionRow } from '@polla/data';

export function TablaScreen() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const tabla = useQuery({ queryKey: ['tabla'], queryFn: fetchTabla });
  const [expandida, setExpandida] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    const ch = supabase
      .channel('tabla-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabla_posiciones' }, () => {
        qc.invalidateQueries({ queryKey: ['tabla'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  if (tabla.isLoading) return <Cargando />;
  const t = busca.trim().toLowerCase();
  const filas = (tabla.data ?? []).filter((f) => (t ? f.display_name.toLowerCase().includes(t) : true));

  return (
    <div>
      <Header titulo="Tabla en vivo" />
      <div className="px-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar jugador…"
          className="w-full rounded-xl bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm mb-2"
        />
        <div className="flex items-center gap-3 text-[11px] text-slate-400 px-2 mb-2">
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Confirmados</span>
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Parciales (en juego + bonos)</span>
        </div>
        <ul className="space-y-1.5">
          {filas.map((f) => (
            <FilaTabla
              key={f.user_id}
              f={f}
              esYo={f.user_id === userId}
              abierta={expandida === f.user_id}
              onToggle={() => setExpandida(expandida === f.user_id ? null : f.user_id)}
            />
          ))}
          {filas.length === 0 && (
            <p className="text-center text-slate-400 py-10">
              {t ? 'Sin resultados para tu búsqueda.' : 'Aún no hay puntos. ¡Que empiece el Mundial!'}
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}

function FilaTabla({
  f,
  esYo,
  abierta,
  onToggle,
}: {
  f: TablaPosicionRow;
  esYo: boolean;
  abierta: boolean;
  onToggle: () => void;
}) {
  const pos = f.posicion ?? 0;
  const podio = pos >= 1 && pos <= 3;
  const anillo = esYo
    ? 'ring-2 ring-brand'
    : pos === 1
      ? 'ring-1 ring-amber-400/60'
      : pos === 2
        ? 'ring-1 ring-slate-300/40'
        : pos === 3
          ? 'ring-1 ring-orange-500/40'
          : '';
  return (
    <li>
      <button
        onClick={onToggle}
        className={`card w-full p-3 flex items-center gap-3 text-left ${anillo}`}
      >
        <span className="w-7 text-center shrink-0">
          {podio ? (
            <span className="text-lg leading-none" aria-label={`Puesto ${pos}`}>
              {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'}
            </span>
          ) : (
            <span className="font-bold text-slate-300 tabular-nums">{f.posicion ?? '-'}</span>
          )}
        </span>
        <Movimiento v={f.movimiento} />
        <span className="flex-1 min-w-0 truncate font-medium">
          {f.display_name} {esYo && <span className="text-brand text-xs">(tú)</span>}
        </span>
        <span className="text-right">
          <span className="font-bold tabular-nums">{f.puntos_totales}</span>
          {f.puntos_provisionales > 0 && (
            <span className="text-amber-400 text-xs tabular-nums"> (+{f.puntos_provisionales})</span>
          )}
        </span>
      </button>
      {abierta && (
        <div className="px-4 py-2 space-y-2">
          <div className="text-xs text-slate-400 grid grid-cols-2 gap-1">
            <span>Firmes: <b className="text-emerald-400">{f.puntos_confirmados}</b></span>
            <span>Parciales: <b className="text-amber-400">{f.puntos_provisionales}</b></span>
            <span>Marcadores exactos: <b className="text-slate-200">{f.marcadores_exactos}</b></span>
            <span>Acertó ganador/empate: <b className="text-slate-200">{f.resultados_1x2}</b></span>
          </div>
          {f.puntos_provisionales > 0 && <DesglosePartial f={f} />}
          <MarcadoresUsuario userId={f.user_id} />
        </div>
      )}
    </li>
  );
}

/** Desglose claro de los puntos PARCIALES: en juego (partidos) + bonos por ronda. */
function DesglosePartial({ f }: { f: TablaPosicionRow }) {
  const bonos = f.bonos_parciales;
  // `bonos_parciales` puede no existir todavía (columna sin migrar). En ese caso
  // NO inventamos el desglose (no decir "en juego" si en realidad son bonos):
  // mostramos el total parcial con una nota genérica.
  if (!bonos) {
    return (
      <p className="text-[11px] text-amber-300/80">
        <b>+{f.puntos_provisionales} parciales</b> (en juego y/o bonos en curso). Pueden cambiar; se
        confirman al avanzar/terminar el Mundial.
      </p>
    );
  }
  const sumaBonos = Object.values(bonos).reduce((s, v) => s + (v || 0), 0);
  const enJuego = f.puntos_provisionales - sumaBonos;
  const lineasBonos = Object.entries(bonos).filter(([, v]) => v > 0);
  return (
    <div className="text-[11px] text-amber-300/90 space-y-0.5">
      <div className="text-slate-400">Tus parciales (pueden cambiar):</div>
      {enJuego > 0 && <div>• En juego (partidos): <b>+{enJuego}</b></div>}
      {lineasBonos.map(([k, v]) => (
        <div key={k}>• {k === 'Goleador' ? 'Goleador' : `Clasificados a ${k}`}: <b>+{v}</b></div>
      ))}
      {enJuego <= 0 && lineasBonos.length === 0 && <div>• Sin desglose disponible aún.</div>}
      <div className="text-slate-500 pt-0.5">
        Los marcadores en juego y los bonos parciales se confirman al avanzar/terminar el Mundial.
      </div>
    </div>
  );
}

/**
 * Marcadores (pronósticos) de un usuario. RLS solo deja ver los ajenos cuando el
 * partido ya INICIÓ (el registro cerró 5 min antes del kickoff, así que no hay
 * riesgo de copiar). Por eso aquí solo aparecen los de partidos ya iniciados.
 */
function MarcadoresUsuario({ userId }: { userId: string }) {
  const pron = useQuery({ queryKey: ['pronosticosDe', userId], queryFn: () => fetchPronosticosDeUsuario(userId) });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });

  if (pron.isLoading) return <p className="text-xs text-slate-500">Cargando marcadores…</p>;
  const lista = pron.data ?? [];
  const pMap = new Map((partidos.data ?? []).map((p) => [p.id, p]));

  // Solo partidos que YA INICIARON (kickoff alcanzado o en juego/finalizado). Para
  // los pronósticos PROPIOS la RLS devuelve también los de partidos sin empezar,
  // así que hay que filtrarlos aquí para no mostrar (ni etiquetar "en juego") un
  // marcador de un partido que aún no arranca.
  const ahora = Date.now();
  const iniciado = (p: import('@polla/data').PartidoRow): boolean =>
    ['IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED'].includes(p.estado) ||
    Date.parse(p.kickoff_utc) <= ahora;

  const visibles = lista
    .map((x) => ({ x, p: pMap.get(x.partido_id) }))
    .filter((r) => r.p && iniciado(r.p))
    .sort((a, b) => a.p!.kickoff_utc.localeCompare(b.p!.kickoff_utc));

  if (visibles.length === 0) {
    return <p className="text-xs text-slate-500">Sus marcadores se verán cuando inicien los partidos.</p>;
  }

  const flag = (id: string | null) => equipos.data?.get(id ?? '')?.crest_url ?? null;

  return (
    <ul className="space-y-1">
      <li className="text-[11px] text-slate-400 font-medium">Marcadores (visibles cuando inicia el partido):</li>
      {visibles.map(({ x, p }) => {
        const fin = p!.estado === 'FINISHED' && p!.goles_a_90 != null;
        const hayReal = p!.goles_a_90 != null && p!.goles_b_90 != null;
        const exacto = fin && x.marcador_a_90 === p!.goles_a_90 && x.marcador_b_90 === p!.goles_b_90;
        return (
          <li key={x.partido_id} className="flex items-center justify-between text-xs gap-2">
            <span className="flex items-center gap-1 min-w-0 text-slate-300">
              {flag(p!.equipo_a) ? <img src={flag(p!.equipo_a)!} alt="" className="w-4 h-4 rounded-sm object-contain" /> : null}
              <span className="text-[10px] text-slate-500">{equipos.data?.get(p!.equipo_a ?? '')?.id ?? '?'}</span>
              <b className="tabular-nums">{x.marcador_a_90}-{x.marcador_b_90}</b>
              <span className="text-[10px] text-slate-500">{equipos.data?.get(p!.equipo_b ?? '')?.id ?? '?'}</span>
              {flag(p!.equipo_b) ? <img src={flag(p!.equipo_b)!} alt="" className="w-4 h-4 rounded-sm object-contain" /> : null}
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {hayReal ? `${fin ? 'real' : 'va'} ${p!.goles_a_90}-${p!.goles_b_90}` : 'en juego'}
              {exacto ? ' ✓' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Indicador de cambio de posición desde el último recálculo: subió, bajó o se mantuvo. */
function Movimiento({ v }: { v: number }) {
  const base = 'shrink-0 w-8 text-center text-[11px] font-semibold tabular-nums rounded-md py-0.5';
  if (v > 0)
    return (
      <span className={`${base} text-emerald-400 bg-emerald-400/10`} title={`Subió ${v} puesto(s)`}>▲{v}</span>
    );
  if (v < 0)
    return (
      <span className={`${base} text-red-400 bg-red-400/10`} title={`Bajó ${-v} puesto(s)`}>▼{-v}</span>
    );
  return <span className={`${base} text-slate-600`} title="Sin cambios">–</span>;
}
