/**
 * Recálculo completo (idempotente, sección 9): recorre todos los partidos,
 * computa desgloses por usuario (provisional/confirmado) vía @polla/core,
 * persiste, sella los finalizados y reconstruye la tabla de posiciones con
 * los bonos de torneo y los desempates.
 *
 * Reejecutarlo con los mismos datos produce siempre el mismo resultado.
 */
import type { ConfigPuntos } from '@polla/core';
import type { Env } from '../env.js';
import { fetchGoleadoresVivosIds } from '../poller/footballDataClient.js';
import {
  computarDesglosesPartido,
  construirTablaPosiciones,
  computarBonosUsuario,
  proyectarClasificadosVivo,
  clasificadosDesdeCuadro,
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

// Etiqueta legible de cada categoría de bono, para el detalle de los parciales.
const ETIQUETA_BONO: Record<string, string> = {
  clasificado16avos: '16avos',
  clasificadoOctavos: 'Octavos',
  clasificadoCuartos: 'Cuartos',
  clasificadoSemis: 'Semis',
  clasificadoFinal: 'Final',
  goleador: 'Goleador',
  campeon: 'Campeón',
};

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

  // --- Consolidación automática de clasificados OFICIALES desde el CUADRO ---
  // Cuando football-data resuelve por completo la llave de una ronda (16avos,
  // octavos…), esos equipos SON los clasificados oficiales (desempates reales de
  // FIFA). Se persiste UNA vez por ronda y así el bono pasa de PARCIAL a FIRME
  // sin cambiar el total (solo se mueve de provisional a confirmado). NO se pisa
  // una ronda que el admin haya fijado a mano (precedencia del admin).
  const clasificadosCuadro = clasificadosDesdeCuadro(partidos);
  const rondasNuevas: Record<string, string[]> = {};
  for (const r of RONDAS) {
    const yaOficial =
      Array.isArray(resultados.clasificados[r]) && resultados.clasificados[r].length > 0;
    if (!yaOficial && clasificadosCuadro[r]?.length) rondasNuevas[r] = clasificadosCuadro[r];
  }
  if (Object.keys(rondasNuevas).length > 0) {
    resultados.clasificados = { ...resultados.clasificados, ...rondasNuevas };
    await repo.setClasificadosOficiales(resultados.clasificados);
  }

  // --- Bonos por usuario ---
  const clasificadosReales = mapaClasificados(resultados.clasificados);
  const picksPorUsuario = new Map(bonosPicks.map((b) => [b.userId, b]));

  // Resultado EN VIVO (provisional) para los bonos parciales: clasificados
  // proyectados desde los partidos actuales + goleador(es) líder(es). Campeón
  // NO se proyecta (decisión de producto). Las rondas YA oficiales (firmes) se
  // excluyen de la proyección para que no generen un parcial residual.
  const proyeccion = proyectarClasificadosVivo(partidos);
  for (const r of RONDAS) {
    if (Array.isArray(resultados.clasificados[r]) && resultados.clasificados[r].length > 0) {
      delete proyeccion[r];
    }
  }
  const clasificadosVivos = mapaClasificados(proyeccion);
  const resultadosVivos = {
    clasificados: clasificadosVivos,
    campeon: null,
    goleadores: goleadoresVivos,
  };

  const usuariosTabla: UsuarioTabla[] = usuarios.map((u) => {
    const pick = picksPorUsuario.get(u.userId);
    const picksU = {
      clasificados: pick ? recortarClasificados(pick.clasificados) : {},
      campeon: pick?.campeon ?? null,
      goleador: pick?.goleador ?? null,
    };
    // FIRMES: contra el resultado OFICIAL (admin). PARCIALES: contra el resultado
    // EN VIVO menos lo ya firme (no duplicar). Al final, lo parcial pasa a firme.
    const bonos = computarBonosUsuario(
      picksU,
      { clasificados: clasificadosReales, campeon: resultados.campeon, goleadores: resultados.goleadores },
      config,
    );
    const bonosVivos = computarBonosUsuario(picksU, resultadosVivos, config);
    // Desglose del parcial POR CATEGORÍA = (en vivo) − (oficial) por tipo, ≥0.
    const oficialPorTipo = new Map(bonos.detalle.map((d) => [d.tipo, d.total]));
    const bonosParcialesDetalle: Record<string, number> = {};
    for (const d of bonosVivos.detalle) {
      const p = Math.max(0, d.total - (oficialPorTipo.get(d.tipo) ?? 0));
      if (p > 0) bonosParcialesDetalle[ETIQUETA_BONO[d.tipo] ?? d.tipo] = p;
    }
    const puntosBonosParciales = Object.values(bonosParcialesDetalle).reduce((s, v) => s + v, 0);

    return {
      userId: u.userId,
      displayName: u.displayName,
      timestampCampeon: pick?.campeonRegistradoEn
        ? Date.parse(pick.campeonRegistradoEn)
        : null,
      puntosBonos: bonos.total,
      puntosBonosParciales,
      bonosParcialesDetalle,
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
