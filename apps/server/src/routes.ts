/**
 * Rutas HTTP del servidor central.
 *   POST /api/pronostico/:partidoId   (usuario)  — guarda pronóstico con lock
 *   GET  /api/health                  (público)  — estado del servicio
 *   POST /api/admin/poll              (admin/cron)— ejecuta un ciclo de poller
 *   POST /api/admin/recompute         (admin)    — recálculo total idempotente
 *   POST /api/admin/partido/:id       (admin)    — corrección manual de resultado
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pronosticoPartidoSchema, configPuntosSchema } from '@polla/core';
import { loadEnv } from './env.js';
import { getServiceClient } from './supabase.js';
import { SupabaseRepo } from './repo.js';
import { verificarJwt, extraerBearer, esAdmin, type UsuarioAutenticado } from './auth.js';
import { guardarPronostico } from './services/pronosticoService.js';
import { guardarBonos } from './services/bonosService.js';
import { recomputarTodo } from './services/recompute.js';
import { runPoller } from './poller/runPoller.js';
import { fetchGoleadoresFootballData, type GoleadorFD } from './poller/footballDataClient.js';
import {
  listarUsuarios,
  cambiarEstado,
  editarUsuario,
  eliminarUsuario,
} from './services/usuariosService.js';
import {
  enviarConfirmacionRegistro,
  enviarReset,
  enviarInvitacion,
  enviarPrueba,
  getSmtpConfig,
  type SmtpConfig,
} from './services/emailService.js';
import { getBolsa, getPremiosConfig, setPremiosConfig } from './services/premiosService.js';

async function requireUser(req: {
  headers: Record<string, unknown>;
}): Promise<UsuarioAutenticado | null> {
  const token = extraerBearer(req.headers['authorization'] as string | undefined);
  if (!token) return null;
  return verificarJwt(token);
}

/** URL base a la que deben volver los enlaces de correo (confirmación/reset). */
function origenDe(req: { headers: Record<string, unknown> }): string {
  const origin = req.headers['origin'] as string | undefined;
  return origin || process.env.SITE_URL || 'http://localhost:5173';
}

const correccionSchema = z
  .object({
    estado: z.string().optional(),
    goles_a_90: z.number().int().min(0).nullable().optional(),
    goles_b_90: z.number().int().min(0).nullable().optional(),
    hubo_extra: z.boolean().nullable().optional(),
    goles_a_extra: z.number().int().min(0).nullable().optional(),
    goles_b_extra: z.number().int().min(0).nullable().optional(),
    ganador_final: z.enum(['A', 'B']).nullable().optional(),
    // false ⇒ "devolver el control a la API" (el poller vuelve a actualizarlo).
    correccion_manual: z.boolean().optional(),
  })
  .strict();

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  const repo = new SupabaseRepo(getServiceClient());

  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  // --- Auth pública: registro y reset envían correo desde NUESTRO servidor ---
  const registroSchema = z
    .object({
      email: z.string().email(),
      password: z.string().min(6),
      display_name: z.string().min(1),
    })
    .strict();

  app.post('/api/auth/registro', async (req, reply) => {
    const parsed = registroSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    }
    try {
      await enviarConfirmacionRegistro(
        parsed.data.email,
        parsed.data.password,
        parsed.data.display_name,
        origenDe(req),
      );
      return reply.send({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = /already|exist|registered/i.test(msg) ? 409 : 400;
      return reply.code(code).send({ error: msg });
    }
  });

  // --- Goleadores del torneo (football-data, con caché en memoria) ---
  let goleadoresCache: { ts: number; data: GoleadorFD[] } | null = null;
  app.get('/api/goleadores', async (_req, reply) => {
    const ahora = Date.now();
    if (goleadoresCache && ahora - goleadoresCache.ts < 5 * 60_000) {
      return reply.send({ ok: true, goleadores: goleadoresCache.data, cacheado: true });
    }
    try {
      const data = await fetchGoleadoresFootballData(env, 30);
      goleadoresCache = { ts: ahora, data };
      return reply.send({ ok: true, goleadores: data, cacheado: false });
    } catch (err) {
      // Si la API aún no expone goleadores (torneo sin iniciar / plan), devolver vacío.
      if (goleadoresCache) return reply.send({ ok: true, goleadores: goleadoresCache.data, cacheado: true });
      return reply.send({ ok: true, goleadores: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Bolsa y premios (cualquier usuario autenticado la ve) ---
  app.get('/api/bolsa', async (req, reply) => {
    const user = await requireUser(req);
    if (!user) return reply.code(401).send({ error: 'No autenticado' });
    try {
      return reply.send({ ok: true, ...(await getBolsa()) });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/auth/reset', async (req, reply) => {
    const parsed = z.object({ email: z.string().email() }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Correo inválido' });
    try {
      await enviarReset(parsed.data.email, origenDe(req));
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
    // Siempre ok (no revelar si el correo existe).
    return reply.send({ ok: true });
  });

  // --- Pronóstico (usuario autenticado) ---
  app.post('/api/pronostico/:partidoId', async (req, reply) => {
    const user = await requireUser(req);
    if (!user) return reply.code(401).send({ error: 'No autenticado' });
    if (user.estado !== 'aprobado') {
      return reply
        .code(403)
        .send({ error: 'Tu cuenta aún no ha sido activada para participar.', code: 'NOT_APPROVED' });
    }
    if (!user.pagado) {
      return reply
        .code(403)
        .send({ error: 'Falta confirmar tu pago de inscripción para participar.', code: 'NOT_PAID' });
    }

    const { partidoId } = req.params as { partidoId: string };
    const parsed = pronosticoPartidoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Pronóstico inválido', detalles: parsed.error.issues });
    }

    // Hora del dispositivo al registrar (si vino offline). Solo auditoría/log: el
    // reloj que valida el cierre es el del servidor.
    const clienteTs = req.headers['x-cliente-ts'] as string | undefined;
    const r = await guardarPronostico(repo, user.userId, partidoId, parsed.data, Date.now());
    req.log.info(
      {
        accion: 'pronostico',
        userId: user.userId,
        partidoId,
        clienteTs: clienteTs ?? null,
        servidorTs: new Date().toISOString(),
        ok: r.ok,
        code: r.ok ? null : r.code,
      },
      'pronostico recibido',
    );
    if (!r.ok) {
      const status = r.code === 'NOT_FOUND' ? 404 : r.code === 'LOCKED' ? 403 : 400;
      return reply.code(status).send({ error: r.error, code: r.code });
    }
    return reply.send({ ok: true, id: r.id, version: r.version, registradoEn: r.registradoEn });
  });

  // --- Bonos de torneo (usuario autenticado) ---
  const bonosSchema = z
    .object({
      campeon: z.string().nullable().optional(),
      goleador: z.string().nullable().optional(),
      clasificados: z
        .object({
          R32: z.array(z.string()).optional(),
          R16: z.array(z.string()).optional(),
          CUARTOS: z.array(z.string()).optional(),
          SEMIS: z.array(z.string()).optional(),
          FINAL: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .strict();

  app.post('/api/bonos', async (req, reply) => {
    const user = await requireUser(req);
    if (!user) return reply.code(401).send({ error: 'No autenticado' });
    if (user.estado !== 'aprobado') {
      return reply
        .code(403)
        .send({ error: 'Tu cuenta aún no ha sido activada para participar.', code: 'NOT_APPROVED' });
    }
    if (!user.pagado) {
      return reply
        .code(403)
        .send({ error: 'Falta confirmar tu pago de inscripción para participar.', code: 'NOT_PAID' });
    }
    const parsed = bonosSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bonos inválidos', detalles: parsed.error.issues });
    }
    const r = await guardarBonos(repo, user.userId, parsed.data, Date.now());
    return reply.send(r);
  });

  // --- Admin / cron ---
  async function requireAdminOrTask(req: {
    headers: Record<string, unknown>;
  }): Promise<boolean> {
    const taskToken = req.headers['x-task-token'] as string | undefined;
    if (env.ADMIN_TASK_TOKEN && taskToken === env.ADMIN_TASK_TOKEN) return true;
    const user = await requireUser(req);
    return esAdmin(user?.role);
  }

  // Solo el super admin gestiona usuarios.
  async function requireSuperAdmin(req: {
    headers: Record<string, unknown>;
  }): Promise<UsuarioAutenticado | null> {
    const user = await requireUser(req);
    return user?.role === 'super_admin' ? user : null;
  }

  app.post('/api/admin/poll', async (req, reply) => {
    if (!(await requireAdminOrTask(req))) return reply.code(403).send({ error: 'Prohibido' });
    try {
      const r = await runPoller(repo, env);
      return reply.send({ ok: true, ...r });
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/admin/recompute', async (req, reply) => {
    if (!(await requireAdminOrTask(req))) return reply.code(403).send({ error: 'Prohibido' });
    const r = await recomputarTodo(repo);
    return reply.send({ ok: true, ...r });
  });

  app.post('/api/admin/partido/:id', async (req, reply) => {
    const user = await requireUser(req);
    if (!user || !esAdmin(user.role)) return reply.code(403).send({ error: 'Solo admin' });

    const { id } = req.params as { id: string };
    const parsed = correccionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Corrección inválida', detalles: parsed.error.issues });
    }

    // El dato manual prevalece sobre la API (sección 1). Si `correccion_manual`
    // viene como false, el admin DEVUELVE el control a la API (el poller vuelve a
    // actualizar el partido); por defecto una corrección marca el partido manual.
    const { correccion_manual, ...campos } = parsed.data;
    const flag = correccion_manual ?? true;
    const patch: Record<string, unknown> = { ...campos, correccion_manual: flag };
    // Devolver el control a la API también des-sella el partido (la API lo reclama).
    if (correccion_manual === false) patch.sellado = false;
    const db = getServiceClient();
    const { error } = await db.from('partidos').update(patch).eq('id', id);
    if (error) return reply.code(500).send({ error: error.message });

    // Toda corrección dispara recálculo total (sección 9).
    const r = await recomputarTodo(repo);
    await db.from('audit_log').insert({
      admin_id: user.userId,
      accion: flag ? 'correccion_partido' : 'liberar_partido',
      detalle: { partidoId: id, cambios: parsed.data },
    });
    return reply.send({ ok: true, recompute: r });
  });

  // Resultados oficiales del torneo (bonos): campeón, goleadores, clasificados.
  const resultadosSchema = z
    .object({
      campeon: z.string().nullable().optional(),
      goleadores: z.array(z.string()).optional(),
      clasificados: z.record(z.string(), z.array(z.string())).optional(),
    })
    .strict();

  app.post('/api/admin/resultados', async (req, reply) => {
    const user = await requireUser(req);
    if (!user || !esAdmin(user.role)) return reply.code(403).send({ error: 'Solo admin' });
    const parsed = resultadosSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Resultados inválidos', detalles: parsed.error.issues });
    }
    const db = getServiceClient();
    const { error } = await db
      .from('resultados_torneo')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return reply.code(500).send({ error: error.message });
    const r = await recomputarTodo(repo);
    await db.from('audit_log').insert({
      admin_id: user.userId,
      accion: 'resultados_torneo',
      detalle: parsed.data,
    });
    return reply.send({ ok: true, recompute: r });
  });

  // Edición de la configuración de puntos (solo hasta que quede bloqueada).
  app.post('/api/admin/config', async (req, reply) => {
    const user = await requireUser(req);
    if (!user || !esAdmin(user.role)) return reply.code(403).send({ error: 'Solo admin' });
    const parsed = configPuntosSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Config inválida', detalles: parsed.error.issues });
    }
    const db = getServiceClient();
    const { data: actual } = await db
      .from('config_torneo')
      .select('bloqueada')
      .eq('id', 1)
      .maybeSingle();
    if (actual?.bloqueada) {
      return reply.code(403).send({ error: 'La configuración está bloqueada (ya inició el torneo)' });
    }
    const { error } = await db
      .from('config_torneo')
      .update({ config_puntos: parsed.data, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) return reply.code(500).send({ error: error.message });
    await db.from('audit_log').insert({ admin_id: user.userId, accion: 'config', detalle: parsed.data });
    return reply.send({ ok: true });
  });

  // ==========================================================================
  // Gestión de usuarios — SOLO super_admin. Todo opera por ID (uuid), así que
  // editar correo/nombre no afecta pronósticos ni puntos.
  // ==========================================================================
  const crearUsuarioSchema = z
    .object({ email: z.string().email(), display_name: z.string().min(1) })
    .strict();
  const editarUsuarioSchema = z
    .object({
      email: z.string().email().optional(),
      display_name: z.string().min(1).optional(),
      password: z.string().min(6).optional(),
      pagado: z.boolean().optional(),
    })
    .strict()
    .refine((o) => o.email || o.display_name || o.password || o.pagado != null, {
      message: 'Indica al menos un campo a cambiar',
    });
  const estadoSchema = z
    .object({ estado: z.enum(['pendiente', 'aprobado', 'rechazado']) })
    .strict();

  app.get('/api/admin/usuarios', async (req, reply) => {
    if (!(await requireSuperAdmin(req))) return reply.code(403).send({ error: 'Solo super admin' });
    try {
      const usuarios = await listarUsuarios(getServiceClient());
      return reply.send({ ok: true, usuarios });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/admin/usuarios', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const parsed = crearUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    }
    const db = getServiceClient();
    try {
      const redirectTo = origenDe(req);
      const id = await enviarInvitacion(parsed.data.email, parsed.data.display_name, redirectTo);
      await db.from('audit_log').insert({
        admin_id: admin.userId,
        accion: 'usuario_crear',
        detalle: { id, email: parsed.data.email },
      });
      return reply.send({ ok: true, id });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/admin/usuarios/:id/estado', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const parsed = estadoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Estado inválido', detalles: parsed.error.issues });
    }
    const { id } = req.params as { id: string };
    const db = getServiceClient();
    try {
      await cambiarEstado(db, id, parsed.data.estado);
      await db.from('audit_log').insert({
        admin_id: admin.userId,
        accion: 'usuario_estado',
        detalle: { id, estado: parsed.data.estado },
      });
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/admin/usuarios/:id', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const parsed = editarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    }
    const { id } = req.params as { id: string };
    const db = getServiceClient();
    try {
      await editarUsuario(db, id, parsed.data);
      await db.from('audit_log').insert({
        admin_id: admin.userId,
        accion: 'usuario_editar',
        // No registramos la contraseña en el log.
        detalle: { id, email: parsed.data.email, display_name: parsed.data.display_name },
      });
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/admin/usuarios/:id', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const { id } = req.params as { id: string };
    if (id === admin.userId) {
      return reply.code(400).send({ error: 'No puedes eliminar tu propia cuenta de super admin.' });
    }
    const db = getServiceClient();
    try {
      await eliminarUsuario(db, id);
      await db.from('audit_log').insert({ admin_id: admin.userId, accion: 'usuario_eliminar', detalle: { id } });
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // Configuración SMTP (solo super_admin). La contraseña NUNCA se devuelve.
  // ==========================================================================
  const smtpSchema = z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive(),
      secure: z.boolean(),
      username: z.string().min(1),
      password: z.string().optional(), // solo se actualiza si viene
      sender_email: z.string().email(),
      sender_name: z.string().min(1),
      habilitado: z.boolean(),
    })
    .strict();

  function sinClave(cfg: SmtpConfig | null) {
    if (!cfg) return null;
    const { password, ...resto } = cfg;
    return { ...resto, password_set: Boolean(password) };
  }

  app.get('/api/admin/smtp', async (req, reply) => {
    if (!(await requireSuperAdmin(req))) return reply.code(403).send({ error: 'Solo super admin' });
    try {
      return reply.send({ ok: true, config: sinClave(await getSmtpConfig()) });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/admin/smtp', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const parsed = smtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Config inválida', detalles: parsed.error.issues });
    }
    const db = getServiceClient();
    // No pisar la contraseña si el campo viene vacío/ausente.
    const { password, ...resto } = parsed.data;
    const patch: Record<string, unknown> = { ...resto, updated_at: new Date().toISOString() };
    if (password) patch.password = password;
    const { error } = await db.from('config_smtp').update(patch).eq('id', 1);
    if (error) return reply.code(500).send({ error: error.message });
    await db.from('audit_log').insert({ admin_id: admin.userId, accion: 'smtp_config', detalle: { ...resto } });
    return reply.send({ ok: true });
  });

  // --- Configuración de premios (solo super_admin) ---
  const premiosSchema = z
    .object({
      moneda: z.string().min(1).optional(),
      valor_inscripcion: z.number().min(0).optional(),
      pct_primero: z.number().min(0).max(100).optional(),
      pct_segundo: z.number().min(0).max(100).optional(),
      pct_tercero: z.number().min(0).max(100).optional(),
      monto_primero: z.number().min(0).nullable().optional(),
      monto_segundo: z.number().min(0).nullable().optional(),
      monto_tercero: z.number().min(0).nullable().optional(),
    })
    .strict();

  app.get('/api/admin/premios', async (req, reply) => {
    if (!(await requireSuperAdmin(req))) return reply.code(403).send({ error: 'Solo super admin' });
    return reply.send({ ok: true, config: await getPremiosConfig(), bolsa: await getBolsa() });
  });

  app.put('/api/admin/premios', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const parsed = premiosSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Config inválida', detalles: parsed.error.issues });
    }
    try {
      await setPremiosConfig(parsed.data);
      await getServiceClient().from('audit_log').insert({ admin_id: admin.userId, accion: 'premios', detalle: parsed.data });
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/admin/smtp/test', async (req, reply) => {
    const admin = await requireSuperAdmin(req);
    if (!admin) return reply.code(403).send({ error: 'Solo super admin' });
    const parsed = z.object({ to: z.string().email() }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Correo de prueba inválido' });
    try {
      const cfg = await getSmtpConfig();
      if (!cfg) return reply.code(400).send({ error: 'No hay configuración SMTP guardada.' });
      await enviarPrueba(cfg, parsed.data.to);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
