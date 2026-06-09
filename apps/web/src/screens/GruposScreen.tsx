import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPartidos, fetchEquipos } from '../lib/queries.js';
import { calcularGrupos } from '../lib/clasificacion.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { Header, Cargando, ErrorMsg } from './CalendarioScreen.js';
import { NOMBRE_FASE, fmtFechaHora } from '../lib/fases.js';
import type { Fase } from '@polla/core';
import type { PartidoRow } from '@polla/data';

const FASES_ELIM: Fase[] = ['R32', 'R16', 'CUARTOS', 'SEMIS', 'TERCER_PUESTO', 'FINAL'];

export function GruposScreen() {
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const [tab, setTab] = useState<'grupos' | 'elim'>('grupos');

  const grupos = useMemo(() => calcularGrupos(partidos.data ?? [], equipos.data), [partidos.data, equipos.data]);

  if (partidos.isLoading) return <Cargando />;
  if (partidos.error) return <ErrorMsg />;

  const lista = partidos.data ?? [];
  const hayElim = lista.some((p) => p.fase !== 'GRUPOS');

  return (
    <div>
      <Header titulo="Campeonato" />
      <div className="px-3">
        <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 mb-3">
          <button onClick={() => setTab('grupos')} className={`flex-1 py-1.5 rounded-lg text-sm ${tab === 'grupos' ? 'bg-brand text-white' : 'text-slate-300'}`}>Grupos</button>
          <button onClick={() => setTab('elim')} className={`flex-1 py-1.5 rounded-lg text-sm ${tab === 'elim' ? 'bg-brand text-white' : 'text-slate-300'}`}>Eliminatorias</button>
        </div>

        {tab === 'grupos' && (
          <div className="space-y-4">
            {grupos.length === 0 && <p className="text-center text-slate-400 py-10">Aún no hay grupos cargados.</p>}
            {grupos.map((g) => (
              <section key={g.grupo} className="card p-3">
                <h2 className="font-semibold mb-2">Grupo {g.grupo}</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400">
                      <th className="text-left font-normal pb-1">Equipo</th>
                      <th className="w-7 text-center font-normal">PJ</th>
                      <th className="w-7 text-center font-normal">DG</th>
                      <th className="w-8 text-center font-semibold text-slate-300">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.map((f, i) => (
                      <tr key={f.equipoId} className={`border-t border-white/5 ${i < 2 ? '' : 'opacity-70'}`}>
                        <td className="py-1.5 flex items-center gap-1.5 min-w-0">
                          <span className={`w-4 text-[11px] text-center ${i < 2 ? 'text-emerald-400' : 'text-slate-500'}`}>{i + 1}</span>
                          <TeamBadge equipo={equipos.data?.get(f.equipoId)} size={20} />
                        </td>
                        <td className="text-center tabular-nums text-slate-300">{f.pj}</td>
                        <td className="text-center tabular-nums text-slate-300">{f.dg > 0 ? `+${f.dg}` : f.dg}</td>
                        <td className="text-center tabular-nums font-bold">{f.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2">Verde = clasifica (top 2 del grupo).</p>
              </section>
            ))}
          </div>
        )}

        {tab === 'elim' && (
          <div className="space-y-4">
            {!hayElim && (
              <p className="text-center text-slate-400 py-10">
                El cuadro de eliminatorias se irá definiendo al avanzar la fase de grupos.
              </p>
            )}
            {FASES_ELIM.map((fase) => {
              const ms = lista.filter((p) => p.fase === fase).sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc));
              if (ms.length === 0) return null;
              return (
                <section key={fase} className="card p-3">
                  <h2 className="font-semibold mb-2">{NOMBRE_FASE[fase]}</h2>
                  <ul className="space-y-1.5">
                    {ms.map((p) => (
                      <PartidoElim key={p.id} p={p} equipos={equipos.data} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PartidoElim({
  p,
  equipos,
}: {
  p: PartidoRow;
  equipos: Map<string, { id: string; nombre: string; crest_url: string | null }> | undefined;
}) {
  const jugado = p.estado === 'FINISHED' && p.goles_a_90 != null;
  return (
    <li className="flex items-center justify-between gap-2 text-sm border-t border-white/5 pt-1.5 first:border-0 first:pt-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <TeamBadge equipo={p.equipo_a ? equipos?.get(p.equipo_a) : undefined} size={18} />
          {jugado && <span className="tabular-nums font-bold">{p.goles_a_90}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <TeamBadge equipo={p.equipo_b ? equipos?.get(p.equipo_b) : undefined} size={18} />
          {jugado && <span className="tabular-nums font-bold">{p.goles_b_90}</span>}
        </div>
      </div>
      <span className="text-[10px] text-slate-500 shrink-0 w-20 text-right">{jugado ? 'Final' : fmtFechaHora(p.kickoff_utc)}</span>
    </li>
  );
}
