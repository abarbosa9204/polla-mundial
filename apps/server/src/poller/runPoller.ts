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
