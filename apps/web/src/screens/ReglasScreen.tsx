import { useQuery } from '@tanstack/react-query';
import { fetchConfigPuntos } from '../lib/queries.js';
import { NOMBRE_FASE } from '../lib/fases.js';
import { Header, Cargando } from './CalendarioScreen.js';
import type { Fase } from '@polla/core';

const FASES_ORDEN: Fase[] = ['GRUPOS', 'R32', 'R16', 'CUARTOS', 'SEMIS', 'TERCER_PUESTO', 'FINAL'];

function Linea({ texto, pts }: { texto: string; pts: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-white/5">
      <span className="text-sm text-slate-300">{texto}</span>
      <span className="text-sm font-bold text-brand tabular-nums shrink-0 ml-3">{pts}</span>
    </div>
  );
}

export function ReglasScreen() {
  const cfg = useQuery({ queryKey: ['configPuntos'], queryFn: fetchConfigPuntos });
  if (cfg.isLoading || !cfg.data) return <Cargando />;
  const c = cfg.data;

  return (
    <div>
      <Header titulo="Reglas y puntaje" />
      <div className="px-3 space-y-4 pb-4">
        <section className="card p-4">
          <h2 className="font-semibold mb-1">Por cada partido</h2>
          <p className="text-xs text-slate-400 mb-1">Acumulables entre sí.</p>
          <Linea texto="Marcador exacto (90′)" pts={`${c.base.marcadorExacto}`} />
          <Linea texto="Acertar quién gana o si empatan" pts={`${c.base.resultado1X2}`} />
          <Linea texto="Acertar el total de goles" pts={`${c.base.totalGoles}`} />
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-1">Eliminatorias (extras)</h2>
          <p className="text-xs text-slate-400 mb-1">Solo en partidos con tiempo extra / penales.</p>
          <Linea texto="Acertar si hubo tiempo extra" pts={`${c.extras.acertarHuboExtra}`} />
          <Linea texto="Marcador exacto del tiempo extra" pts={`${c.extras.marcadorExtraExacto}`} />
          <Linea texto="Acertar el ganador final (incl. penales)" pts={`${c.extras.ganadorFinal}`} />
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-1">Multiplicador por fase</h2>
          <p className="text-xs text-slate-400 mb-1">Los puntos del partido se multiplican según la fase.</p>
          {FASES_ORDEN.map((f) => (
            <Linea key={f} texto={NOMBRE_FASE[f]} pts={`×${c.multiplicadores[f]}`} />
          ))}
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-1">Bonos de torneo</h2>
          <p className="text-xs text-slate-400 mb-1">Se pronostican antes del primer partido.</p>
          <Linea texto="Cada clasificado a 16avos" pts={`${c.bonos.clasificado16avos}`} />
          <Linea texto="Cada clasificado a octavos" pts={`${c.bonos.clasificadoOctavos}`} />
          <Linea texto="Cada clasificado a cuartos" pts={`${c.bonos.clasificadoCuartos}`} />
          <Linea texto="Cada clasificado a semis" pts={`${c.bonos.clasificadoSemis}`} />
          <Linea texto="Cada clasificado a la final" pts={`${c.bonos.clasificadoFinal}`} />
          <Linea texto="🏆 Campeón del Mundial" pts={`${c.bonos.campeon}`} />
          <Linea texto="⚽ Goleador del Mundial" pts={`${c.bonos.goleador}`} />
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-1">Empates en la tabla</h2>
          <p className="text-xs text-slate-400 mb-1">
            La tabla de posiciones usa exactamente este puntaje. Si dos jugadores quedan con los mismos
            puntos, se desempata en este orden:
          </p>
          <ol className="text-sm text-slate-300 list-decimal list-inside space-y-0.5">
            <li>Más <b>marcadores exactos</b> acertados.</li>
            <li>Más veces que acertó <b>quién gana</b> (o si empatan).</li>
            <li>Quien <b>registró primero</b> su pronóstico de campeón.</li>
          </ol>
          <p className="text-xs text-slate-500 mt-1">Si aun así siguen iguales, comparten la misma posición.</p>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-1">Cierre de pronósticos</h2>
          <p className="text-sm text-slate-300">
            El registro del marcador de cada partido <b>cierra 5 minutos antes de la hora oficial de
            inicio</b>. Si el partido empieza antes de lo previsto, también queda cerrado de inmediato.
            Desde el cierre, tu pronóstico <b>ya no se puede modificar</b>.
          </p>
          <p className="text-sm text-slate-300 mt-2">
            Los bonos de torneo (campeón, goleador, clasificados) cierran con el primer partido del
            Mundial. El cierre se controla con la <b>hora oficial</b>, así que la hora de tu celular no
            afecta tu registro.
          </p>
        </section>
      </div>
    </div>
  );
}
