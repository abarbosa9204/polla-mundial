/**
 * Ciclo del poller: consulta football-data.org, normaliza, escribe SOLO los
 * cambios (respetando partidos sellados/manuales) y dispara el recálculo si
 * algún partido entró en juego o finalizó. Con fallback a API-Football y
 * alerta por webhook si lleva > 5 minutos fallando.
 */
import type { Env } from '../env.js';
import { SupabaseRepo } from '../repo.js';
import { fetchPartidosFootballData } from './footballDataClient.js';
import { normalizarFootballData } from './footballDataNormalizer.js';
import { fetchPartidosApiFootball } from './apiFootballClient.js';
import { fetchMundialEnVivo } from './sportdbClient.js';
import { traducirPais } from './traducciones.js';
import { necesitaActualizar, requiereRecalculo } from './diff.js';
import type { PartidoNormalizado } from './model.js';
import { recomputarTodo } from '../services/recompute.js';

const CINCO_MINUTOS = 5 * 60 * 1000;

function aRow(n: PartidoNormalizado): Record<string, unknown> {
  return {
    id: n.id,
    fase: n.fase,
    grupo: n.grupo,
    ronda_orden: n.rondaOrden,
    equipo_a: n.equipoA?.id ?? null,
    equipo_b: n.equipoB?.id ?? null,
    kickoff_utc: n.kickoffUtc,
    estado: n.estado,
    goles_a_90: n.golesA90,
    goles_b_90: n.golesB90,
    hubo_extra: n.huboExtra,
    goles_a_extra: n.golesAExtra,
    goles_b_extra: n.golesBExtra,
    ganador_final: n.ganadorFinal,
  };
}

async function obtenerNormalizados(
  env: Env,
): Promise<{ partidos: PartidoNormalizado[]; fuente: string }> {
  try {
    const matches = await fetchPartidosFootballData(env);
    const partidos = matches
      .map(normalizarFootballData)
      .filter((p): p is PartidoNormalizado => p !== null);
    if (partidos.length > 0) return { partidos, fuente: 'football-data' };
    throw new Error('football-data devolvió 0 partidos');
  } catch (err) {
    // Fallback a API-Football si está configurado.
    if (env.API_FOOTBALL_TOKEN) {
      const partidos = await fetchPartidosApiFootball(env);
      return { partidos, fuente: 'api-football' };
    }
    throw err;
  }
}

export interface PollResultado {
  fuente: string;
  cambios: number;
  recalculado: boolean;
}

export async function runPoller(repo: SupabaseRepo, env: Env): Promise<PollResultado> {
  try {
    const { partidos, fuente } = await obtenerNormalizados(env);

    // 1) Upsert de equipos primero (FK de partidos).
    const equipos = new Map<string, { id: string; nombre: string; crestUrl: string | null }>();
    for (const n of partidos) {
      if (n.equipoA) equipos.set(n.equipoA.id, n.equipoA);
      if (n.equipoB) equipos.set(n.equipoB.id, n.equipoB);
    }
    await repo.upsertEquipos([...equipos.values()]);

    // 2) Escritura mínima de partidos cambiados.
    const actuales = await repo.getPartidos();
    const mapa = new Map(actuales.map((p) => [p.id, p]));
    let cambios = 0;
    let recalcular = false;
    for (const n of partidos) {
      const actual = mapa.get(n.id);
      if (necesitaActualizar(n, actual)) {
        const row = aRow(n);
        // Si el partido estaba bajo control manual y la API ya tiene datos, la API
        // RECLAMA el control: limpiamos el flag para que vuelva a actualizarse solo.
        if (actual?.correccion_manual) row.correccion_manual = false;
        await repo.upsertPartido(row);
        cambios++;
        if (requiereRecalculo(n)) recalcular = true;
      }
    }

    // 2.5) Fuente ALTERNA en vivo (sportdb): rellena el marcador EN VIVO cuando
    // football-data va atrasado. Best-effort: jamás tumba el ciclo del poller.
    try {
      const envivo = await fetchMundialEnVivo(env);
      if (envivo.length > 0) {
        const nombreDe = (id: string | null) => equipos.get(id ?? '')?.nombre ?? id ?? '';
        for (const s of envivo) {
          if (s.estado === 'SCHEDULED') continue;
          const sKick = Date.parse(s.kickoffUtc);
          const homeEs = traducirPais(s.homeNombre).toLowerCase();
          const awayEs = traducirPais(s.awayNombre).toLowerCase();
          // Emparejar por kickoff + (sigla O nombre traducido) de algún equipo.
          const actual = actuales.find((p) => {
            if (Date.parse(p.kickoff_utc) !== sKick) return false;
            const a = (p.equipo_a ?? '').toUpperCase();
            const b = (p.equipo_b ?? '').toUpperCase();
            const porSigla = s.home3 === a || s.away3 === b || s.home3 === b || s.away3 === a;
            const porNombre =
              nombreDe(p.equipo_a).toLowerCase() === homeEs ||
              nombreDe(p.equipo_b).toLowerCase() === awayEs;
            return porSigla || porNombre;
          });
          if (!actual || actual.sellado) continue;
          // En eliminatorias el final (extra/penales) lo confirma football-data;
          // la fuente alterna solo da el marcador de los 90'. Por eso un FINISHED
          // de eliminatoria se trata como EN JUEGO (provisional) hasta que la
          // primaria lo selle. En grupos el 90' ES el final ⇒ sí puede finalizar.
          let estado = s.estado;
          if (estado === 'FINISHED' && actual.fase !== 'GRUPOS') estado = 'IN_PLAY';
          const cambia =
            actual.estado !== estado ||
            actual.goles_a_90 !== s.golesA ||
            actual.goles_b_90 !== s.golesB;
          if (!cambia) continue;
          await repo.actualizarPartido(actual.id, {
            estado,
            goles_a_90: s.golesA,
            goles_b_90: s.golesB,
            correccion_manual: false, // dato real de API en vivo
          });
          cambios++;
          recalcular = true;
        }
      }
    } catch {
      // La fuente alterna nunca debe tumbar el poller; se ignora su fallo.
    }

    // 3) Recalcular puntos y tabla si hubo partidos en juego/finalizados.
    if (recalcular) {
      await recomputarTodo(repo);
    }

    await repo.marcarPollerExito(fuente);
    return { fuente, cambios, recalculado: recalcular };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    const { msSinExito } = await repo.marcarPollerFallo(mensaje);
    if (msSinExito > CINCO_MINUTOS) {
      await enviarAlerta(env, mensaje, msSinExito);
    }
    throw err;
  }
}

async function enviarAlerta(env: Env, mensaje: string, msSinExito: number): Promise<void> {
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `⚠️ Poller Polla Mundialista lleva ${Math.round(
          msSinExito / 60000,
        )} min fallando. Último error: ${mensaje}`,
      }),
    });
  } catch {
    // No propagar errores de la alerta.
  }
}
