/**
 * Envío de correos vía SMTP (nodemailer). La configuración se toma, en orden:
 *   1) la tabla `config_smtp` (id=1, habilitado) — administrable sin redeploy;
 *   2) las variables de entorno SMTP_* del servidor (respaldo).
 *
 * IMPORTANTE: si no hay configuración utilizable, `cargarSmtp()` devuelve null y
 * el llamador NO envía nada (no-op). Esto garantiza que activar este módulo nunca
 * rompe el arranque ni el resto de la app si falta el SMTP.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getServiceClient } from '../supabase.js';
import { loadEnv } from '../env.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  senderEmail: string;
  senderName: string;
}

/** Resuelve la config SMTP (tabla → env). Devuelve null si no hay nada usable. */
export async function cargarSmtp(): Promise<SmtpConfig | null> {
  // 1) Tabla config_smtp (si existe y está habilitada con credenciales).
  try {
    const { data } = await getServiceClient()
      .from('config_smtp')
      .select('host, port, secure, username, password, sender_email, sender_name, habilitado')
      .eq('id', 1)
      .maybeSingle();
    if (data?.habilitado && data.host && data.username && data.password) {
      return {
        host: data.host as string,
        port: Number(data.port) || 465,
        secure: data.secure ?? Number(data.port) === 465,
        user: data.username as string,
        pass: data.password as string,
        senderEmail: (data.sender_email as string) || (data.username as string),
        senderName: (data.sender_name as string) || 'Polla Mundialista',
      };
    }
  } catch {
    /* la tabla puede no existir en algún entorno: caemos a env */
  }

  // 2) Variables de entorno SMTP_* (respaldo).
  const env = loadEnv();
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      senderEmail: env.SMTP_SENDER_EMAIL || env.SMTP_USER,
      senderName: env.SMTP_SENDER_NAME,
    };
  }

  return null;
}

export function crearTransporte(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

export interface Mensaje {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Envía un mensaje con el transporte ya creado. */
export async function enviarMensaje(
  transporter: Transporter,
  cfg: SmtpConfig,
  msg: Mensaje,
): Promise<void> {
  await transporter.sendMail({
    from: `"${cfg.senderName}" <${cfg.senderEmail}>`,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
}
