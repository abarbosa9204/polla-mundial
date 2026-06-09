/**
 * Carga y validación de variables de entorno (falla rápido si falta algo).
 */
import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  FOOTBALL_DATA_TOKEN: z.string().min(1),
  API_FOOTBALL_TOKEN: z.string().optional().default(''),
  THESPORTSDB_KEY: z.string().optional().default('3'),
  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).default(''),
  PORT: z.coerce.number().int().positive().default(8787),
  // Competición de football-data.org para el Mundial:
  FD_COMPETITION: z.string().default('WC'),
  // Token simple para proteger el disparo manual del poller/recálculo (cron).
  ADMIN_TASK_TOKEN: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detalles = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detalles}`);
  }
  cached = parsed.data;
  return cached;
}
