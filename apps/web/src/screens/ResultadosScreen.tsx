import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPartidos, fetchEquipos } from '../lib/queries.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { NOMBRE_FASE, fmtFechaHora } from '../lib/fases.js';
import { Header, Cargando, ErrorMsg } from './CalendarioScreen.js';
import type { PartidoRow } from '@polla/data';
import type { Fase } from '@polla/core';

const FASES: Fase[] = ['GRUPOS', 'R32', 'R16', 'CUARTOS', 'SEMIS', 'TERCER_PUESTO', 'FINAL'];

export function ResultadosScreen() {
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const [q, setQ] = useState('');
  const [fase, setFase] = useState<string>('');

  const nombre = (id: string | null) => (id ? equipos.data?.get(id)?.nombre ?? id : '');

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (partidos.data ?? [])
      .filter((p) => p.estado === 'FINISHED')
      .filter((p) => (fase ? p.fase === fase : true))
      .filter((p) => (t ? `${nombre(p.equipo_a)} ${nombre(p.equipo_b)}`.toLowerCase().includes(t) : true))
      .sort((a, b) => b.kickoff_utc.localeCompare(a.kickoff_utc));
  }, [partidos.data, equipos.data, q, fase]);

  if (partidos.isLoading) return <Cargando />;
  if (partidos.error) return <ErrorMsg />;

  return (
    <div>
      <Header titulo="Resultados" />
      <div className="px-3 space-y-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar equipo…"
            className="flex-1 rounded-xl bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm"
          />
          <select
            value={fase}
            onChange={(e) => setFase(e.target.value)}
            className="rounded-xl bg-slate-800 px-2 py-2 ring-1 ring-white/10 text-sm"
          >
            <option value="">Todas</option>
            {FASES.map((f) => <option key={f} value={f}>{NOMBRE_FASE[f]}</option>)}
          </select>
        </div>

        {lista.length === 0 && (
          <p className="text-center text-slate-400 py-10">No hay partidos finalizados todavía.</p>
        )}

        {lista.map((p) => (
          <Resultado key={p.id} p={p} equipos={equipos.data} />
        ))}
      </div>
    </div>
  );
}

function Resultado({
  p,
  equipos,
}: {
  p: PartidoRow;
  equipos: Map<string, { id: string; nombre: string; crest_url: string | null }> | undefined;
}) {
  const penales = p.ganador_final && p.hubo_extra;
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
        <span>{NOMBRE_FASE[p.fase]}{p.grupo && ` · Grupo ${p.grupo}`}</span>
        <span>{fmtFechaHora(p.kickoff_utc)}</span>
      </div>
      <Fila equipos={equipos} id={p.equipo_a} goles={p.goles_a_90} ganador={p.ganador_final === 'A'} />
      <Fila equipos={equipos} id={p.equipo_b} goles={p.goles_b_90} ganador={p.ganador_final === 'B'} />
      {penales && (
        <p className="text-[10px] text-slate-500 mt-1">
          Definido en tiempo extra/penales · ganó {p.ganador_final === 'A' ? equipos?.get(p.equipo_a ?? '')?.nombre : equipos?.get(p.equipo_b ?? '')?.nombre}
        </p>
      )}
    </div>
  );
}

function Fila({
  equipos,
  id,
  goles,
  ganador,
}: {
  equipos: Map<string, { id: string; nombre: string; crest_url: string | null }> | undefined;
  id: string | null;
  goles: number | null;
  ganador: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${ganador ? 'font-semibold' : ''}`}>
      <TeamBadge equipo={id ? equipos?.get(id) : undefined} size={22} wrap />
      <span className="text-lg font-bold tabular-nums shrink-0">{goles ?? '-'}</span>
    </div>
  );
}
