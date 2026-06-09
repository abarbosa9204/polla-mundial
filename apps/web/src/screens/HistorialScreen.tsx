import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPartidos, fetchEquipos } from '../lib/queries.js';
import { Header, Cargando } from './CalendarioScreen.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { NOMBRE_FASE, fmtFechaHora } from '../lib/fases.js';
import type { Fase } from '@polla/core';

export function HistorialScreen() {
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const [fase, setFase] = useState<Fase | 'TODAS'>('TODAS');

  const finalizados = useMemo(
    () =>
      (partidos.data ?? [])
        .filter((p) => p.estado === 'FINISHED')
        .filter((p) => fase === 'TODAS' || p.fase === fase)
        .sort((a, b) => b.kickoff_utc.localeCompare(a.kickoff_utc)),
    [partidos.data, fase],
  );

  if (partidos.isLoading) return <Cargando />;

  return (
    <div>
      <Header titulo="Historial de marcadores" />
      <div className="px-3">
        <div className="flex gap-1.5 overflow-x-auto pb-2 text-xs">
          {(['TODAS', 'GRUPOS', 'R32', 'R16', 'CUARTOS', 'SEMIS', 'TERCER_PUESTO', 'FINAL'] as const).map((f) => (
            <button key={f} onClick={() => setFase(f)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap ${fase === f ? 'bg-brand text-white' : 'bg-white/5 text-slate-300'}`}>
              {f === 'TODAS' ? 'Todas' : NOMBRE_FASE[f]}
            </button>
          ))}
        </div>
        <ul className="space-y-2 mt-1">
          {finalizados.map((p) => (
            <li key={p.id} className="card p-3">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{NOMBRE_FASE[p.fase]}{p.grupo && ` · Grupo ${p.grupo}`}</span>
                <span>{fmtFechaHora(p.kickoff_utc)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 text-right"><TeamBadge equipo={p.equipo_a ? equipos.data?.get(p.equipo_a) : undefined} size={22} /></div>
                <span className="font-bold tabular-nums px-2">{p.goles_a_90} - {p.goles_b_90}</span>
                <div className="flex-1"><TeamBadge equipo={p.equipo_b ? equipos.data?.get(p.equipo_b) : undefined} size={22} /></div>
              </div>
              {p.hubo_extra && (
                <p className="text-[11px] text-slate-400 mt-1 text-center">
                  Tiempo extra: {p.goles_a_extra}-{p.goles_b_extra}
                  {p.ganador_final && ` · Ganó ${p.ganador_final === 'A' ? (p.equipo_a ?? 'Local') : (p.equipo_b ?? 'Visita')} (incl. penales)`}
                </p>
              )}
            </li>
          ))}
          {finalizados.length === 0 && <p className="text-center text-slate-400 py-10">Sin partidos finalizados todavía.</p>}
        </ul>
      </div>
    </div>
  );
}
