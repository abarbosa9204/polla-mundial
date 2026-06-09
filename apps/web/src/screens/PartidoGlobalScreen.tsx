import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPartidos,
  fetchEquipos,
  fetchPronosticosDePartido,
  fetchPerfiles,
} from '../lib/queries.js';
import { Header, Cargando } from './CalendarioScreen.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { NOMBRE_FASE, fmtFechaHoraLarga } from '../lib/fases.js';

/**
 * Pronósticos globales de un partido EN CURSO/TERMINADO, con la fecha y hora de
 * registro (timestamp del servidor) para transparencia (sección 8). RLS solo
 * deja leer estos pronósticos cuando el partido ya inició.
 */
export function PartidoGlobalScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const perfiles = useQuery({ queryKey: ['perfiles'], queryFn: fetchPerfiles });
  const pron = useQuery({
    queryKey: ['pronosticosPartido', id],
    queryFn: () => fetchPronosticosDePartido(id!),
    enabled: !!id,
  });

  const partido = partidos.data?.find((p) => p.id === id);
  if (partidos.isLoading || !partido) return <Cargando />;

  // Usuarios sin pronóstico aparecen como "Sin pronóstico (0 pts)" (sección 8).
  const conPronostico = new Set((pron.data ?? []).map((p) => p.user_id));
  const sinPronostico = [...(perfiles.data ?? new Map()).entries()].filter(
    ([uid]) => !conPronostico.has(uid),
  );

  return (
    <div>
      <Header titulo="Pronósticos del partido" accion={<button onClick={() => nav(-1)} className="text-slate-400 text-sm">Volver</button>} />
      <div className="px-3 space-y-3">
        <div className="card p-4 text-center">
          <div className="text-[11px] text-slate-400">{NOMBRE_FASE[partido.fase]}</div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <TeamBadge equipo={partido.equipo_a ? equipos.data?.get(partido.equipo_a) : undefined} />
            <span className="font-bold text-xl tabular-nums">
              {partido.goles_a_90 ?? '-'} : {partido.goles_b_90 ?? '-'}
            </span>
            <TeamBadge equipo={partido.equipo_b ? equipos.data?.get(partido.equipo_b) : undefined} />
          </div>
        </div>

        <ul className="space-y-1.5">
          {(pron.data ?? []).map((p) => (
            <li key={p.id} className="card p-3 flex items-center justify-between text-sm gap-2">
              <span className="font-medium flex-1 min-w-0 truncate">
                {perfiles.data?.get(p.user_id) ?? p.user_id.slice(0, 6)}
              </span>
              <span className="tabular-nums font-bold">{p.marcador_a_90} - {p.marcador_b_90}</span>
              <span className="text-[10px] text-slate-500 w-28 text-right">
                {fmtFechaHoraLarga(p.created_at_server)}
              </span>
            </li>
          ))}
          {sinPronostico.map(([uid, nombre]) => (
            <li key={uid} className="card p-3 flex items-center justify-between text-sm text-slate-500">
              <span className="flex-1 min-w-0 truncate">{nombre}</span>
              <span className="italic">Sin pronóstico (0 pts)</span>
            </li>
          ))}
          {(pron.data ?? []).length === 0 && sinPronostico.length === 0 && (
            <p className="text-center text-slate-400 py-8 text-sm">
              {pron.isLoading ? 'Cargando…' : 'Los pronósticos de todos se hacen visibles cuando el partido finaliza.'}
            </p>
          )}
        </ul>
        <p className="text-[11px] text-slate-500 text-center">
          La hora mostrada es la hora oficial de registro: prueba de que se guardó antes del cierre.
        </p>
      </div>
    </div>
  );
}
