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
          <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Provisionales (en juego)</span>
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
  return (
    <li>
      <button
        onClick={onToggle}
        className={`card w-full p-3 flex items-center gap-3 text-left ${esYo ? 'ring-2 ring-brand' : ''}`}
      >
        <span className="w-6 text-center font-bold text-slate-300">{f.posicion ?? '-'}</span>
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
            <span>Confirmados: <b className="text-emerald-400">{f.puntos_confirmados}</b></span>
            <span>Provisionales: <b className="text-amber-400">{f.puntos_provisionales}</b></span>
            <span>Marcadores exactos: <b className="text-slate-200">{f.marcadores_exactos}</b></span>
            <span>Acertó ganador/empate: <b className="text-slate-200">{f.resultados_1x2}</b></span>
          </div>
          <MarcadoresUsuario userId={f.user_id} />
        </div>
      )}
    </li>
  );
}

/**
 * Marcadores (pronósticos) de un usuario. RLS solo deja ver los ajenos cuando el
 * partido ha FINALIZADO. Por eso aquí solo aparecen los marcadores de partidos ya
 * terminados — transparencia sin riesgo de copiar.
 */
function MarcadoresUsuario({ userId }: { userId: string }) {
  const pron = useQuery({ queryKey: ['pronosticosDe', userId], queryFn: () => fetchPronosticosDeUsuario(userId) });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });

  if (pron.isLoading) return <p className="text-xs text-slate-500">Cargando marcadores…</p>;
  const lista = pron.data ?? [];
  const pMap = new Map((partidos.data ?? []).map((p) => [p.id, p]));

  const visibles = lista
    .map((x) => ({ x, p: pMap.get(x.partido_id) }))
    .filter((r) => r.p)
    .sort((a, b) => a.p!.kickoff_utc.localeCompare(b.p!.kickoff_utc));

  if (visibles.length === 0) {
    return <p className="text-xs text-slate-500">Sus marcadores se verán cuando los partidos finalicen.</p>;
  }

  const flag = (id: string | null) => equipos.data?.get(id ?? '')?.crest_url ?? null;

  return (
    <ul className="space-y-1">
      <li className="text-[11px] text-slate-400 font-medium">Marcadores (visibles cuando finaliza el partido):</li>
      {visibles.map(({ x, p }) => {
        const fin = p!.estado === 'FINISHED' && p!.goles_a_90 != null;
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
              real {p!.goles_a_90}-{p!.goles_b_90}{exacto ? ' ✓' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Movimiento({ v }: { v: number }) {
  if (v > 0) return <span className="text-emerald-400 text-xs w-4">▲{v}</span>;
  if (v < 0) return <span className="text-red-400 text-xs w-4">▼{-v}</span>;
  return <span className="text-slate-600 text-xs w-4">–</span>;
}
