import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPartidos, fetchEquipos, fetchMisPronosticos, fetchMisDesgloses } from '../lib/queries.js';
import { supabase } from '../lib/supabase.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { NOMBRE_FASE, MULTIPLICADOR_FASE, fmtFechaHora } from '../lib/fases.js';
import { useCountdown, useRelojColombia } from '../lib/hooks.js';
import { AccountMenu } from '../components/AccountMenu.js';
import { MARGEN_CIERRE_MS } from '@polla/core';
import type { PartidoRow } from '@polla/data';

export function CalendarioScreen() {
  const qc = useQueryClient();
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const mios = useQuery({ queryKey: ['misPronosticos'], queryFn: fetchMisPronosticos });
  const desgloses = useQuery({ queryKey: ['misDesgloses'], queryFn: fetchMisDesgloses });

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

  if (partidos.isLoading) return <Cargando />;
  if (partidos.error) return <ErrorMsg />;

  const lista = partidos.data ?? [];
  return (
    <div>
      <Header titulo="Partidos" accion={<div className="flex items-center gap-2"><RelojColombia /><AccountMenu /></div>} />
      <div className="px-3 space-y-2">
        {lista.map((p) => (
          <PartidoCard
            key={p.id}
            p={p}
            equipos={equipos.data}
            mio={mios.data?.find((m) => m.partido_id === p.id)}
            desglose={desgloses.data?.find((d) => d.partido_id === p.id)}
          />
        ))}
        {lista.length === 0 && (
          <p className="text-center text-slate-400 py-10">
            Aún no hay partidos cargados. Se actualizarán automáticamente.
          </p>
        )}
      </div>
    </div>
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
      <TeamBadge equipo={id ? equipos?.get(id) : undefined} />
      {goles != null && <span className="text-lg font-bold tabular-nums">{goles}</span>}
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
