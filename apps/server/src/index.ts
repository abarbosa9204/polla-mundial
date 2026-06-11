/**
 * Arranque del servidor central: API HTTP (Fastify) + poller programado.
 */
import './dotenv.js'; // carga .env en desarrollo (debe ir primero)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cron from 'node-cron';
import { loadEnv } from './env.js';
import { getServiceClient } from './supabase.js';
import { SupabaseRepo } from './repo.js';
import { registerRoutes } from './routes.js';
import { runPoller } from './poller/runPoller.js';
import { debePollearAhora, type PartidoTiempo } from './scheduler.js';
import { enviarRecordatorios } from './services/recordatoriosService.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await registerRoutes(app);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  // --- Poller programado (cada minuto decide si consultar la API) ---
  const repo = new SupabaseRepo(getServiceClient());
  let ultimoPollMs: number | null = null;

  cron.schedule('* * * * *', async () => {
    try {
      const partidos = await repo.getPartidos();
      const tiempos: PartidoTiempo[] = partidos.map((p) => ({
        kickoffUtcMs: Date.parse(p.kickoff_utc),
        estado: p.estado,
      }));
      const ahora = Date.now();
      if (debePollearAhora(tiempos, ahora, ultimoPollMs)) {
        ultimoPollMs = ahora;
        const r = await runPoller(repo, env);
        app.log.info({ poll: r }, 'poller ejecutado');
      }
    } catch (err) {
      app.log.error({ err }, 'fallo en el ciclo del poller');
    }
  });

  // --- Recordatorios diarios de información faltante (marcadores + bonos) ---
  // Activo por defecto (REMINDER_ENABLED='false' lo apaga). Cada día, a la hora
  // configurada, envía a cada usuario que no haya registrado lo que se le cierra
  // dentro de la ventana. Si no hay SMTP configurado, es un NO-OP inofensivo.
  if (env.REMINDER_ENABLED !== 'false') {
    const hora = env.REMINDER_DAILY_HOUR_UTC;
    cron.schedule(`0 ${hora} * * *`, async () => {
      try {
        const r = await enviarRecordatorios({
          ventanaHoras: env.REMINDER_WINDOW_HOURS,
          siteUrl: env.SITE_URL || undefined,
        });
        app.log.info({ recordatorios: r }, 'recordatorios enviados');
      } catch (err) {
        app.log.error({ err }, 'fallo enviando recordatorios');
      }
    });
    app.log.info(`Recordatorios diarios activados a las ${hora}:00 UTC (ventana ${env.REMINDER_WINDOW_HOURS} h)`);
  }

  app.log.info('Servidor central de la Polla Mundialista en marcha');
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exitCode = 1;
});
