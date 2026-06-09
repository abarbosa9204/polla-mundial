/**
 * Envío de correos por el SERVIDOR usando nodemailer. La configuración SMTP vive
 * en la tabla `config_smtp` (administrable por el super admin), NO en el .env.
 *
 * Para los correos de autenticación (confirmación de registro, reset, invitación)
 * generamos el enlace oficial de Supabase con `auth.admin.generateLink()` y lo
 * enviamos nosotros con nuestra plantilla y nuestro SMTP. Así la cuenta/clave de
 * envío es administrable desde la app y Supabase no depende de su SMTP de panel.
 */
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { getServiceClient } from '../supabase.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  sender_email: string;
  sender_name: string;
  habilitado: boolean;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const db = getServiceClient();
  const { data, error } = await db.from('config_smtp').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SmtpConfig | null) ?? null;
}

function requireHabilitado(cfg: SmtpConfig | null): asserts cfg is SmtpConfig {
  if (!cfg || !cfg.habilitado || !cfg.host || !cfg.username || !cfg.sender_email) {
    throw new Error('El envío de correos no está configurado/habilitado. Configúralo en Administración → Correo.');
  }
}

async function enviarCon(cfg: SmtpConfig, to: string, subject: string, html: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.username, pass: cfg.password },
  });
  await transport.sendMail({
    from: `"${cfg.sender_name}" <${cfg.sender_email}>`,
    to,
    subject,
    html,
  });
}

/** Envío genérico (valida que SMTP esté habilitado). */
export async function enviarCorreo(to: string, subject: string, html: string): Promise<void> {
  const cfg = await getSmtpConfig();
  requireHabilitado(cfg);
  await enviarCon(cfg, to, subject, html);
}

/** Prueba de envío usando una config dada (sin exigir que esté habilitada). */
export async function enviarPrueba(cfg: SmtpConfig, to: string): Promise<void> {
  if (!cfg.host || !cfg.username || !cfg.sender_email) {
    throw new Error('Faltan datos de SMTP (host, usuario o remitente).');
  }
  await enviarCon(cfg, to, 'Prueba de correo — Polla Mundialista', plantilla(
    '✅ SMTP funcionando',
    'Si recibes este correo, la configuración de envío de la Polla Mundialista quedó correcta.',
  ));
}

// --- Correos de autenticación (enlace oficial de Supabase + nuestra plantilla) ---

/** Registro: crea el usuario (queda pendiente de aprobación) y envía confirmación. */
export async function enviarConfirmacionRegistro(
  email: string,
  password: string,
  displayName: string,
  redirectTo: string,
): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { display_name: displayName }, redirectTo },
  });
  if (error) throw new Error(error.message);
  const link = data.properties?.action_link;
  if (!link) throw new Error('No se pudo generar el enlace de confirmación.');
  await enviarCorreo(
    email,
    'Confirma tu cuenta — Polla Mundialista',
    plantilla(
      `¡Hola ${displayName}!`,
      'Gracias por registrarte en la Polla Mundialista. Confirma tu correo para activar tu cuenta. ' +
        'Luego un administrador te aprobará para empezar a pronosticar.',
      'Confirmar mi cuenta',
      link,
    ),
  );
}

/** Reset de contraseña. No revela si el correo existe. */
export async function enviarReset(email: string, redirectTo: string): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (error) {
    if (/not found|no.*user/i.test(error.message)) return; // no revelar inexistencia
    throw new Error(error.message);
  }
  const link = data.properties?.action_link;
  if (!link) return;
  await enviarCorreo(
    email,
    'Restablece tu contraseña — Polla Mundialista',
    plantilla(
      'Restablecer contraseña',
      'Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, haz clic abajo. ' +
        'Si no, ignora este correo.',
      'Crear nueva contraseña',
      link,
    ),
  );
}

/**
 * Invitación creada por el super admin: crea el usuario aprobado con una clave
 * temporal aleatoria y le envía un enlace para que él fije su propia contraseña.
 * Devuelve el id del usuario creado.
 */
export async function enviarInvitacion(
  email: string,
  displayName: string,
  redirectTo: string,
): Promise<string> {
  const db = getServiceClient();
  const tmp = crypto.randomBytes(18).toString('base64url') + 'Aa1!';
  const { data: creado, error } = await db.auth.admin.createUser({
    email,
    password: tmp,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(error.message);
  const id = creado.user.id;
  await db.from('profiles').update({ display_name: displayName, estado: 'aprobado' }).eq('id', id);

  const { data: link, error: e2 } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (e2) throw new Error(e2.message);
  const action = link.properties?.action_link;
  if (!action) throw new Error('No se pudo generar el enlace de invitación.');
  await enviarCorreo(
    email,
    'Te invitaron a la Polla Mundialista',
    plantilla(
      `¡Hola ${displayName}!`,
      'Te invitaron a participar en la Polla Mundialista. Crea tu contraseña para entrar.',
      'Crear mi contraseña',
      action,
    ),
  );
  return id;
}

// --- Plantilla HTML simple ---
function plantilla(titulo: string, cuerpo: string, cta?: string, link?: string): string {
  const boton =
    cta && link
      ? `<p style="text-align:center;margin:28px 0;">
           <a href="${link}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;display:inline-block;">${cta}</a>
         </p>
         <p style="font-size:12px;color:#94a3b8;word-break:break-all;">O copia este enlace: ${link}</p>`
      : '';
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;background:#0f172a;color:#e2e8f0;border-radius:16px;padding:28px;">
    <div style="text-align:center;font-size:32px;">🏆</div>
    <h1 style="font-size:20px;text-align:center;margin:8px 0 16px;">${titulo}</h1>
    <p style="font-size:14px;line-height:1.5;color:#cbd5e1;">${cuerpo}</p>
    ${boton}
    <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;">
    <p style="font-size:11px;color:#64748b;text-align:center;">Polla Mundialista 2026</p>
  </div>`;
}
