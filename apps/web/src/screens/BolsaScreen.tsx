import { useQuery } from '@tanstack/react-query';
import { fetchBolsa } from '../lib/api.js';
import { Header, Cargando } from './CalendarioScreen.js';

const MEDALLA = ['🥇', '🥈', '🥉'];

export function BolsaScreen() {
  const q = useQuery({ queryKey: ['bolsa'], queryFn: fetchBolsa });
  if (q.isLoading) return <Cargando />;

  const data = q.data;
  const money = (n: number) => `${n.toLocaleString('es-CO')} ${data?.moneda ?? ''}`.trim();

  return (
    <div>
      <Header titulo="Bolsa y premios" />
      <div className="px-3 space-y-4">
        <section className="card p-5 text-center">
          <p className="text-sm text-slate-300">Bolsa total del torneo</p>
          <p className="text-4xl font-bold text-brand my-1">{data ? money(data.bolsa) : '—'}</p>
          <p className="text-xs text-slate-400">
            {data ? money(data.valorInscripcion) : '—'} × {data?.aportantes ?? 0} participantes con pago confirmado
          </p>
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold mb-1">Cómo se reparte</h2>
          {(data?.premios ?? []).map((p) => (
            <div key={p.puesto} className="flex items-center justify-between py-2 border-t border-white/5">
              <span className="flex items-center gap-2">
                <span className="text-2xl">{MEDALLA[p.puesto - 1] ?? '🏅'}</span>
                <span className="font-medium">
                  {p.puesto}º lugar
                  <span className="text-xs text-slate-400 ml-1">({p.pct}%)</span>
                </span>
              </span>
              <span className="text-lg font-bold text-brand tabular-nums">{money(p.monto)}</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-500 pt-1">
            Los montos se actualizan automáticamente según la bolsa. El administrador puede ajustar el reparto.
          </p>
        </section>
      </div>
    </div>
  );
}
