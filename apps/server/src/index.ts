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

  app.log.info('Servidor central de la Polla Mundialista en marcha');
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exitCode = 1;
});
