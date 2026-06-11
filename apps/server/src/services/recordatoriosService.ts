/**
 * Recordatorios de información faltante que suma puntos.
 *
 * Para la ventana configurada (por defecto 24 h hacia adelante) reúne, por
 * usuario, lo que NO ha registrado y está por cerrarse:
 *   - Marcadores de partidos cuyo registro sigue abierto y arrancan en la ventana.
 *   - Bonos cuyo cierre cae dentro de la ventana y siguen abiertos:
 *       · Campeón y goleador (cierran al primer partido del torneo).
 *       · Clasificados por ronda (cierran al primer partido de la ronda previa).
 * A cada usuario con algo faltante se le envía UN correo con todo. Quien ya lo
 * registró no recibe nada.
 *
 * Es de solo lectura sobre los datos del torneo (no escribe nada); lo único que
 * produce son correos. Si no hay SMTP configurado o se pasa `dryRun`, calcula
 * todo pero no envía: seguro para probar en producción.
 */
import { MARGEN_CIERRE_MS } from '@polla/core';
import { getServiceClient } from '../supabase.js';
import { listarUsuarios } from './usuariosService.js';
import {
  calcularCierresBonos,
  type PartidoKickoff,
  type RondaClasificacion,
} from './bonosLock.js';
import { cargarSmtp, crearTransporte, enviarMensaje, type Mensaje } from './mailer.js';

const NOMBRE_FASE: Record<string, string> = {
  GRUPOS: 'Fase de grupos',
  R32: 'Dieciseisavos',
  R16: 'Octavos',
  CUARTOS: 'Cuartos de final',
  SEMIS: 'Semifinal',
  TERCER_PUESTO: 'Tercer puesto',
  FINAL: 'Final',
};

// Etiqueta de cada lista de clasificados (la ronda a la que clasifican).
const ETIQUETA_CLASIFICADOS: Record<RondaClasificacion, string> = {
  R32: 'Clasificados a dieciseisavos',
  R16: 'Clasificados a octavos',
  CUARTOS: 'Clasificados a cuartos',
  SEMIS: 'Clasificados a semifinales',
  FINAL: 'Clasificados a la final',
};

const RONDAS: RondaClasificacion[] = ['R32', 'R16', 'CUARTOS', 'SEMIS', 'FINAL'];

interface PartidoVentana {
  id: string;
  fase: string;
  kickoffMs: number;
  nombreA: string;
  nombreB: string;
}

/** Una categoría de bono cuyo cierre cae dentro de la ventana y sigue abierto. */
interface BonoVentana {
  /** clave para saber si el usuario lo tiene: 'campeon' | 'goleador' | 'clasif:R32'… */
  clave: string;
  etiqueta: string;
  cierreMs: number;
}

interface BonosUsuarioRow {
  user_id: string;
  campeon_equipo: string | null;
  goleador_jugador: string | null;
  clasificados: Partial<Record<RondaClasificacion, string[]>> | null;
}

export interface ResultadoRecordatorios {
  partidosEnVentana: number;
  bonosEnVentana: number;
  /** Etiquetas de los bonos cuyo cierre cae en la ventana (para previsualizar). */
  categoriasBonos: string[];
  usuariosConsiderados: number;
  usuariosFaltantes: number;
  correosEnviados: number;
  smtpConfigurado: boolean;
  dryRun: boolean;
  detalle: { email: string; nombre: string; partidosFaltantes: number; bonosFaltantes: number }[];
  errores: string[];
}

function fmtBogota(ms: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(ms));
}

function tablaPartidos(partidos: PartidoVentana[]): string {
  if (partidos.length === 0) return '';
  const filas = partidos
    .map((p) => {
      const cierre = p.kickoffMs - MARGEN_CIERRE_MS;
      return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${p.nombreA} <span style="color:#9ca3af;">vs</span> ${p.nombreB}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${NOMBRE_FASE[p.fase] ?? p.fase}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${fmtBogota(p.kickoffMs)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-weight:600;">${fmtBogota(cierre)}</td>
      </tr>`;
    })
    .join('');
  return `
    <h3 style="margin:20px 0 8px;font-size:15px;">Partidos sin marcador</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr style="text-align:left;background:#f3f4f6;">
          <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;">Partido</th>
          <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;">Fase</th>
          <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;">Inicio (Col)</th>
          <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;">Cierra (Col)</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function tablaBonos(bonos: BonoVentana[]): string {
  if (bonos.length === 0) return '';
  const filas = bonos
    .map(
      (b) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${b.etiqueta}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-weight:600;">${fmtBogota(b.cierreMs)}</td>
      </tr>`,
    )
    .join('');
  return `
    <h3 style="margin:20px 0 8px;font-size:15px;">Bonos por cerrar</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr style="text-align:left;background:#f3f4f6;">
          <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;">Bono</th>
          <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;">Cierra (Col)</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function construirHtml(
  nombre: string,
  partidos: PartidoVentana[],
  bonos: BonoVentana[],
  siteUrl: string,
): string {
  const total = partidos.length + bonos.length;
  const boton = siteUrl
    ? `<p style="margin:24px 0 0;"><a href="${siteUrl}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block;">Completar mis pronósticos</a></p>`
    : '';
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
    <h2 style="margin:0 0 4px;">Hola, ${nombre}</h2>
    <p style="margin:0 0 4px;color:#374151;">
      Tienes <b>${total}</b> pronóstico${total > 1 ? 's' : ''} <b>por completar</b> que se cierran pronto.
      Lo que no registres antes del cierre suma <b>0 puntos</b>.
    </p>
    ${tablaPartidos(partidos)}
    ${tablaBonos(bonos)}
    ${boton}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
      El registro de cada partido cierra 5 minutos antes del inicio. Este es un recordatorio automático de la Polla Mundialista.
    </p>
  </div>`;
}

function construirTexto(nombre: string, partidos: PartidoVentana[], bonos: BonoVentana[]): string {
  const partes: string[] = [`Hola, ${nombre}`, ''];
  if (partidos.length) {
    partes.push('Partidos sin marcador:');
    for (const p of partidos) {
      const cierre = p.kickoffMs - MARGEN_CIERRE_MS;
      partes.push(
        `- ${p.nombreA} vs ${p.nombreB} (${NOMBRE_FASE[p.fase] ?? p.fase}) — inicia ${fmtBogota(p.kickoffMs)}, cierra ${fmtBogota(cierre)}`,
      );
    }
    partes.push('');
  }
  if (bonos.length) {
    partes.push('Bonos por cerrar:');
    for (const b of bonos) partes.push(`- ${b.etiqueta} — cierra ${fmtBogota(b.cierreMs)}`);
    partes.push('');
  }
  partes.push('El registro de cada partido cierra 5 minutos antes del inicio.');
  return partes.join('\n');
}

export async function enviarRecordatorios(opts?: {
  ventanaHoras?: number;
  dryRun?: boolean;
  ahoraMs?: number;
  siteUrl?: string;
}): Promise<ResultadoRecordatorios> {
  const ahora = opts?.ahoraMs ?? Date.now();
  const ventanaMs = (opts?.ventanaHoras ?? 24) * 60 * 60 * 1000;
  const dryRun = opts?.dryRun ?? false;
  const siteUrl = opts?.siteUrl ?? '';
  const db = getServiceClient();
  const errores: string[] = [];

  // --- Partidos del torneo (para ventana de marcadores y cierres de bonos) ---
  const { data: partidosRaw, error: ePart } = await db
    .from('partidos')
    .select('id, fase, kickoff_utc, estado, equipo_a, equipo_b')
    .order('kickoff_utc', { ascending: true });
  if (ePart) throw new Error(ePart.message);

  const { data: equiposRaw } = await db.from('equipos').select('id, nombre');
  const nombreEq = new Map<string, string>((equiposRaw ?? []).map((e) => [e.id as string, e.nombre as string]));

  // 1) Marcadores: partidos con registro abierto que arrancan dentro de la ventana.
  const INICIADOS = ['IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED'];
  const ventana: PartidoVentana[] = (partidosRaw ?? [])
    .filter((p) => {
      const ko = Date.parse(p.kickoff_utc as string);
      if (Number.isNaN(ko)) return false;
      const cierre = ko - MARGEN_CIERRE_MS;
      const noIniciado = !INICIADOS.includes(p.estado as string);
      return noIniciado && cierre > ahora && ko <= ahora + ventanaMs;
    })
    .map((p) => ({
      id: p.id as string,
      fase: p.fase as string,
      kickoffMs: Date.parse(p.kickoff_utc as string),
      nombreA: nombreEq.get((p.equipo_a as string) ?? '') ?? 'Equipo A',
      nombreB: nombreEq.get((p.equipo_b as string) ?? '') ?? 'Equipo B',
    }));

  // 2) Bonos: categorías cuyo cierre cae dentro de la ventana y siguen abiertas.
  const kickoffs: PartidoKickoff[] = (partidosRaw ?? [])
    .map((p) => ({ fase: p.fase as PartidoKickoff['fase'], kickoffUtcMs: Date.parse(p.kickoff_utc as string) }))
    .filter((k) => !Number.isNaN(k.kickoffUtcMs));
  const cierres = calcularCierresBonos(kickoffs);

  const enVentanaCierre = (cierreMs: number | null): boolean =>
    cierreMs != null && ahora < cierreMs && cierreMs <= ahora + ventanaMs;

  const bonosVentana: BonoVentana[] = [];
  if (enVentanaCierre(cierres.primerKickoffMs)) {
    bonosVentana.push({ clave: 'campeon', etiqueta: 'Campeón del torneo', cierreMs: cierres.primerKickoffMs! });
    bonosVentana.push({ clave: 'goleador', etiqueta: 'Goleador del torneo', cierreMs: cierres.primerKickoffMs! });
  }
  for (const r of RONDAS) {
    if (enVentanaCierre(cierres.clasificados[r])) {
      bonosVentana.push({ clave: `clasif:${r}`, etiqueta: ETIQUETA_CLASIFICADOS[r], cierreMs: cierres.clasificados[r]! });
    }
  }

  // Si no hay nada por cerrar, terminamos sin enviar.
  if (ventana.length === 0 && bonosVentana.length === 0) {
    return {
      partidosEnVentana: 0,
      bonosEnVentana: 0,
      categoriasBonos: [],
      usuariosConsiderados: 0,
      usuariosFaltantes: 0,
      correosEnviados: 0,
      smtpConfigurado: (await cargarSmtp()) != null,
      dryRun,
      detalle: [],
      errores,
    };
  }

  // --- Usuarios (todos, con correo) ---
  const usuarios = (await listarUsuarios(db)).filter((u) => !!u.email);

  // --- Marcadores ya registrados para esos partidos ---
  const tienePron = new Set<string>();
  if (ventana.length > 0) {
    const { data: pronRaw, error: ePron } = await db
      .from('pronosticos')
      .select('user_id, partido_id')
      .in('partido_id', ventana.map((p) => p.id));
    if (ePron) throw new Error(ePron.message);
    for (const r of pronRaw ?? []) tienePron.add(`${r.user_id}:${r.partido_id}`);
  }

  // --- Bonos ya registrados (todos los usuarios) ---
  const bonosPorUsuario = new Map<string, BonosUsuarioRow>();
  if (bonosVentana.length > 0) {
    const { data: bonosRaw, error: eBon } = await db
      .from('bonos_usuario')
      .select('user_id, campeon_equipo, goleador_jugador, clasificados');
    if (eBon) throw new Error(eBon.message);
    for (const b of (bonosRaw ?? []) as BonosUsuarioRow[]) bonosPorUsuario.set(b.user_id, b);
  }

  const tieneBono = (userId: string, clave: string): boolean => {
    const b = bonosPorUsuario.get(userId);
    if (!b) return false;
    if (clave === 'campeon') return !!b.campeon_equipo;
    if (clave === 'goleador') return !!b.goleador_jugador;
    if (clave.startsWith('clasif:')) {
      const ronda = clave.slice('clasif:'.length) as RondaClasificacion;
      return !!b.clasificados?.[ronda]?.length;
    }
    return false;
  };

  // --- Faltantes por usuario ---
  const mensajes: { usuario: (typeof usuarios)[number]; faltan: PartidoVentana[]; bonos: BonoVentana[] }[] = [];
  for (const u of usuarios) {
    const faltan = ventana.filter((p) => !tienePron.has(`${u.id}:${p.id}`));
    const bonos = bonosVentana.filter((b) => !tieneBono(u.id, b.clave));
    if (faltan.length > 0 || bonos.length > 0) mensajes.push({ usuario: u, faltan, bonos });
  }

  const detalle = mensajes.map((m) => ({
    email: m.usuario.email as string,
    nombre: m.usuario.display_name,
    partidosFaltantes: m.faltan.length,
    bonosFaltantes: m.bonos.length,
  }));

  // --- Envío (salvo dryRun o si no hay SMTP) ---
  const cfg = await cargarSmtp();
  const smtpConfigurado = cfg != null;
  let correosEnviados = 0;

  if (!dryRun && cfg) {
    const transporter = crearTransporte(cfg);
    for (const { usuario, faltan, bonos } of mensajes) {
      const total = faltan.length + bonos.length;
      const msg: Mensaje = {
        to: usuario.email as string,
        subject: `⚽ Tienes ${total} pronóstico${total > 1 ? 's' : ''} por completar — Polla Mundialista`,
        html: construirHtml(usuario.display_name, faltan, bonos, siteUrl),
        text: construirTexto(usuario.display_name, faltan, bonos),
      };
      try {
        await enviarMensaje(transporter, cfg, msg);
        correosEnviados++;
      } catch (err) {
        errores.push(`${usuario.email}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    partidosEnVentana: ventana.length,
    bonosEnVentana: bonosVentana.length,
    categoriasBonos: bonosVentana.map((b) => b.etiqueta),
    usuariosConsiderados: usuarios.length,
    usuariosFaltantes: mensajes.length,
    correosEnviados,
    smtpConfigurado,
    dryRun,
    detalle,
    errores,
  };
}
