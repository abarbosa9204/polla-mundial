/**
 * Esquemas Zod para validar datos de entrada (pronósticos, resultados, config).
 * Se usan en el servidor para rechazar payloads malformados ANTES de tocar
 * la lógica de negocio o Firebase.
 */
import { z } from 'zod';
import { FASES } from './types.js';

/** Gol: entero >= 0 y con un techo razonable para evitar payloads absurdos. */
const golSchema = z.number().int().min(0).max(99);

export const marcadorSchema = z.object({
  golesA: golSchema,
  golesB: golSchema,
});

export const ladoEquipoSchema = z.enum(['A', 'B']);

export const faseSchema = z.enum(FASES);

/**
 * Pronóstico de partido tal como lo envía el cliente.
 * El timestamp NO viene aquí: lo asigna el servidor (sección 2/4).
 */
export const pronosticoPartidoSchema = z
  .object({
    marcador90: marcadorSchema,
    habraExtra: z.boolean().nullish(),
    marcadorExtra: marcadorSchema.nullish(),
    ganadorFinal: ladoEquipoSchema.nullish(),
  })
  .strict();

export const resultadoOficialSchema = z
  .object({
    marcador90: marcadorSchema,
    huboExtra: z.boolean().optional(),
    marcadorExtra: marcadorSchema.nullish(),
    ganadorFinal: ladoEquipoSchema.nullish(),
  })
  .strict();

export const configPuntosSchema = z.object({
  base: z.object({
    marcadorExacto: z.number().int(),
    resultado1X2: z.number().int(),
    totalGoles: z.number().int(),
  }),
  extras: z.object({
    acertarHuboExtra: z.number().int(),
    marcadorExtraExacto: z.number().int(),
    ganadorFinal: z.number().int(),
  }),
  multiplicadores: z.object({
    GRUPOS: z.number().int(),
    R32: z.number().int(),
    R16: z.number().int(),
    CUARTOS: z.number().int(),
    SEMIS: z.number().int(),
    TERCER_PUESTO: z.number().int(),
    FINAL: z.number().int(),
  }),
  bonos: z.object({
    clasificado16avos: z.number().int(),
    clasificadoOctavos: z.number().int(),
    clasificadoCuartos: z.number().int(),
    clasificadoSemis: z.number().int(),
    clasificadoFinal: z.number().int(),
    campeon: z.number().int(),
    goleador: z.number().int(),
  }),
});

export type PronosticoPartidoInput = z.infer<typeof pronosticoPartidoSchema>;
export type ResultadoOficialInput = z.infer<typeof resultadoOficialSchema>;
