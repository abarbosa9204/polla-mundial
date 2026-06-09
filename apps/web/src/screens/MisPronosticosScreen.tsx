import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMisPronosticos, fetchPartidos, fetchEquipos, fetchMisDesgloses } from '../lib/queries.js';
import { Header, Cargando } from './CalendarioScreen.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { NOMBRE_FASE, fmtFechaHora } from '../lib/fases.js';
import { describirDesglose } from '../lib/desglose.js';
import type { DesglosePartido } from '@polla/core';

export function MisPronosticosScreen() {
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const mios = useQuery({ queryKey: ['misPronosticos'], queryFn: fetchMisPronosticos });
  const desgloses = useQuery({ queryKey: ['misDesgloses'], queryFn: fetchMisDesgloses });

  if (partidos.isLoading || mios.isLoading) return <Cargando />;

  const porPartido = new Map((partidos.data ?? []).map((p) => [p.id, p]));
  const desgPorPartido = new Map((desgloses.data ?? []).map((d) => [d.partido_id, d]));
  const lista = (mios.data ?? []).slice().sort((x, y) => {
    const px = porPartido.get(x.partido_id)?.kickoff_utc ?? '';
    const py = porPartido.get(y.partido_id)?.kickoff_utc ?? '';
    return px.localeCompare(py);
  });

  return (
    <div>
      <Header titulo="Mis pronósticos" />
      <div className="px-3 space-y-2">
        {lista.map((pr) => {
          const p = porPartido.get(pr.partido_id);
          if (!p) return null;
          const cerrado = Date.parse(p.kickoff_utc) <= Date.now();
          const d = desgPorPartido.get(pr.partido_id);
          const desg = d?.desglose as DesglosePartido | undefined;
          return (
            <div key={pr.id} className="card p-3">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{NOMBRE_FASE[p.fase]}</span>
                <span>{fmtFechaHora(p.kickoff_utc)} {cerrado && '🔒'}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 text-right"><TeamBadge equipo={p.equipo_a ? equipos.data?.get(p.equipo_a) : undefined} size={22} /></div>
                <span className="font-bold tabular-nums px-2">{pr.marcador_a_90} - {pr.marcador_b_90}</span>
                <div className="flex-1"><TeamBadge equipo={p.equipo_b ? equipos.data?.get(p.equipo_b) : undefined} size={22} /></div>
              </div>
              {d && desg && (
                <div className="mt-2 text-xs rounded-lg bg-slate-800/60 px-2.5 py-1.5">
                  <span className={`font-semibold ${d.provisional ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {d.provisional ? 'En juego' : 'Confirmado'}: {d.puntos > 0 ? `ganaste ${d.puntos} pts` : '0 pts'}
                  </span>
                  <p className="text-slate-400 mt-0.5">
                    {describirDesglose(desg)}
                    {desg.multiplicador > 1 && desg.total > 0 && ` · ×${desg.multiplicador} por la fase`}
                  </p>
                </div>
              )}
              {!cerrado && (
                <Link to={`/partido/${p.id}`} className="text-brand text-xs mt-2 inline-block">Editar →</Link>
              )}
            </div>
          );
        })}
        {lista.length === 0 && <p className="text-center text-slate-400 py-10">Aún no has pronosticado.</p>}
      </div>
    </div>
  );
}
