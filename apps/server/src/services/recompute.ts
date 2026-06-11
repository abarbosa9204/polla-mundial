/**
 * Recálculo completo (idempotente, sección 9): recorre todos los partidos,
 * computa desgloses por usuario (provisional/confirmado) vía @polla/core,
 * persiste, sella los finalizados y reconstruye la tabla de posiciones con
 * los bonos de torneo y los desempates.
 *
 * Reejecutarlo con los mismos datos produce siempre el mismo resultado.
 */
import { calcularBonoGoleador, type ConfigPuntos } from '@polla/core';
import type { Env } from '../env.js';
import { fetchGoleadoresVivosIds } from '../poller/footballDataClient.js';
import {
  computarDesglosesPartido,
  construirTablaPosiciones,
  computarBonosUsuario,
  type DesgloseCalculado,
  type UsuarioTabla,
  type PronosticoUsuario,
  type RondaClasificacion,
} from '../scoring/index.js';
import {
  SupabaseRepo,
  partidoRowAScoring,
  pronosticosRowsAUsuarios,
} from '../repo.js';

const RONDAS: RondaClasificacion[] = ['R32', 'R16', 'CUARTOS', 'SEMIS', 'FINAL'];

export interface RecomputeResumen {
  partidosPuntuados: number;
  partidosSellados: number;
  usuarios: number;
}

export async function recomputarTodo(repo: SupabaseRepo, env?: Env): Promise<RecomputeResumen> {
  const [config, partidos, usuarios, resultados, bonosPicks, previas] =
    await Promise.all([
      repo.getConfig(),
      repo.getPartidos(),
      repo.getUsuarios(),
      repo.getResultadosTorneo(),
      repo.getBonosPicks(),
      repo.getPosicionesPrevias(),
    ]);

  // Goleador(es) líder(es) en vivo (para el bono de goleador PARCIAL). Sin env
  // (recálculos que no lo pasan) o si la API falla ⇒ [] ⇒ no hay parcial.
  const goleadoresVivos = env ? await fetchGoleadoresVivosIds(env, Date.now()) : [];

  const todosLosDesgloses: DesgloseCalculado[] = [];
  let partidosPuntuados = 0;
  let partidosSellados = 0;

  // Mapa userId → todos sus desgloses (para persistir). Incluimos a todos los
  // usuarios (los sin pronóstico ⇒ 0) solo en partidos ya puntuables.
  for (const row of partidos) {
    const partido = partidoRowAScoring(row);
    if (partido.estado !== 'FINISHED' && partido.estado !== 'IN_PLAY' && partido.estado !== 'PAUSED') {
      continue;
    }
    const pronosticoRows = await repo.getPronosticosDePartido(row.id);
    const conPronostico = pronosticosRowsAUsuarios(pronosticoRows);
    const idsConPronostico = new Set(conPronostico.map((p) => p.userId));
    // Añadir usuarios sin pronóstico (0 puntos, sección 4) para registrar su 0.
    const todos: PronosticoUsuario[] = [
      ...conPronostico,
      ...usuarios
        .filter((u) => !idsConPronostico.has(u.userId))
        .map((u) => ({ userId: u.userId, pronostico: null })),
    ];

    const desgloses = computarDesglosesPartido(partido, todos, config);
    if (desgloses.length > 0) partidosPuntuados++;
    todosLosDesgloses.push(...desgloses);

    await repo.upsertDesgloses(
      desgloses.map((d) => ({
        userId: d.userId,
        partidoId: d.partidoId,
        desglose: d.desglose,
        puntos: d.puntos,
        provisional: d.provisional,
      })),
    );

    // Sellar partidos finalizados (ya con puntos calculados).
    if (partido.estado === 'FINISHED' && !row.sellado) {
      await repo.sellarPartido(row.id);
      partidosSellados++;
    }
  }

  // --- Bonos por usuario ---
  const clasificadosReales = mapaClasificados(resultados.clasificados);
  const picksPorUsuario = new Map(bonosPicks.map((b) => [b.userId, b]));

  const usuariosTabla: UsuarioTabla[] = usuarios.map((u) => {
    const pick = picksPorUsuario.get(u.userId);
    const bonos = computarBonosUsuario(
      {
        clasificados: pick ? recortarClasificados(pick.clasificados) : {},
        campeon: pick?.campeon ?? null,
        goleador: pick?.goleador ?? null,
      },
      {
        clasificados: clasificadosReales,
        campeon: resultados.campeon,
        goleadores: resultados.goleadores,
      },
      config,
    );
    // Bono de goleador PARCIAL = (líder en vivo) − (oficial ya contado). Durante
    // el torneo el oficial es 0 ⇒ muestra la proyección; al cargar el oficial al
    // final, el parcial baja a 0 y pasa a firme. Sin doble conteo.
    const valGol = config.bonos.goleador;
    const golVivo = calcularBonoGoleador(pick?.goleador ?? null, goleadoresVivos, valGol).total;
    const golOficial = calcularBonoGoleador(pick?.goleador ?? null, resultados.goleadores, valGol).total;
    const puntosBonosParciales = Math.max(0, golVivo - golOficial);

    return {
      userId: u.userId,
      displayName: u.displayName,
      timestampCampeon: pick?.campeonRegistradoEn
        ? Date.parse(pick.campeonRegistradoEn)
        : null,
      puntosBonos: bonos.total,
      puntosBonosParciales,
    };
  });

  // --- Tabla de posiciones ---
  const tabla = construirTablaPosiciones(usuariosTabla, todosLosDesgloses, previas);
  await repo.upsertTabla(tabla);
  // Quitar filas obsoletas (super admin que no participa, o usuarios eliminados).
  await repo.limpiarTablaExcepto(usuariosTabla.map((u) => u.userId));

  return { partidosPuntuados, partidosSellados, usuarios: usuarios.length };
}

function mapaClasificados(
  c: Record<string, string[]>,
): Partial<Record<RondaClasificacion, ReadonlySet<string>>> {
  const out: Partial<Record<RondaClasificacion, ReadonlySet<string>>> = {};
  for (const r of RONDAS) {
    if (Array.isArray(c[r])) out[r] = new Set(c[r]);
  }
  return out;
}

function recortarClasificados(
  c: Record<string, string[]>,
): Partial<Record<RondaClasificacion, string[]>> {
  const out: Partial<Record<RondaClasificacion, string[]>> = {};
  for (const r of RONDAS) {
    if (Array.isArray(c[r])) out[r] = c[r];
  }
  return out;
}
