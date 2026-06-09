import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchGoleadores } from '../lib/api.js';
import { Header, Cargando } from './CalendarioScreen.js';

export function GoleadoresScreen() {
  const q = useQuery({ queryKey: ['goleadores'], queryFn: fetchGoleadores });
  const [busca, setBusca] = useState('');

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const arr = q.data?.goleadores ?? [];
    return t
      ? arr.filter((g) => g.nombre.toLowerCase().includes(t) || g.equipo?.toLowerCase().includes(t))
      : arr;
  }, [q.data, busca]);

  if (q.isLoading) return <Cargando />;

  return (
    <div>
      <Header titulo="Goleadores" />
      <div className="px-3 space-y-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar jugador o selección…"
          className="w-full rounded-xl bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm"
        />

        {lista.length === 0 && (
          <p className="text-center text-slate-400 py-10">
            Aún no hay goleadores registrados. Aparecerán cuando empiece el torneo.
          </p>
        )}

        <ol className="space-y-1.5">
          {lista.map((g, i) => (
            <li key={`${g.nombre}-${i}`} className="card p-2.5 flex items-center gap-3">
              <span className={`w-6 text-center font-bold tabular-nums ${i < 3 ? 'text-brand' : 'text-slate-500'}`}>{i + 1}</span>
              {g.equipoCrest ? (
                <img src={g.equipoCrest} alt="" className="w-6 h-6 rounded-sm object-contain shrink-0" />
              ) : (
                <span className="w-6 h-6 rounded-sm bg-slate-700 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{g.nombre}</p>
                {g.equipo && <p className="text-[11px] text-slate-400 truncate">{g.equipo}</p>}
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-bold tabular-nums">{g.goles}</span>
                <span className="text-[11px] text-slate-400 ml-1">goles</span>
                {g.penales != null && g.penales > 0 && (
                  <p className="text-[10px] text-slate-500">{g.penales} de penal</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
