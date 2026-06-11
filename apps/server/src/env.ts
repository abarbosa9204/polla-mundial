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
  // Fuente ALTERNA de marcador en vivo (sportdb.dev / Flashscore). Si está, el
  // poller la usa para rellenar el marcador EN VIVO cuando football-data va
  // atrasado. Sin esta clave, todo sigue igual (no se consulta).
  SPORTDB_API_KEY: z.string().optional().default(''),
  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).default(''),
  PORT: z.coerce.number().int().positive().default(8787),
  // Competición de football-data.org para el Mundial:
  FD_COMPETITION: z.string().default('WC'),
  // Token simple para proteger el disparo manual del poller/recálculo (cron).
  ADMIN_TASK_TOKEN: z.string().min(8).optional(),

  // --- Correo (SMTP) para recordatorios de marcadores faltantes ---
  // Opcionales: si faltan, el envío de correos es un NO-OP (no rompe nada).
  // También se pueden tomar de la tabla `config_smtp`; ver services/mailer.ts.
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(465),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_SENDER_EMAIL: z.string().optional().default(''),
  SMTP_SENDER_NAME: z.string().optional().default('Polla Mundialista'),
  // URL pública de la PWA (para el enlace del correo).
  SITE_URL: z.string().url().optional().or(z.literal('')).default(''),

  // --- Recordatorios automáticos ---
  // Ventana (horas) hacia adelante para considerar un partido/bono "próximo".
  REMINDER_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  // Hora UTC (0-23) del envío diario en proceso. Por defecto 13 UTC = 8:00 a.m.
  // en Colombia. Solo envía a quien le falte algo y haya SMTP configurado.
  REMINDER_DAILY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(13),
  // Interruptor maestro del envío automático ('false' lo apaga sin redeploy).
  REMINDER_ENABLED: z.string().optional().default('true'),
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
