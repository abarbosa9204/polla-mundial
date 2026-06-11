/**
 * Acceso a datos sobre Supabase (service_role). Implementa el `PronosticoRepo`
 * del servicio de pronósticos y expone consultas para el poller y el recálculo.
 */
import type { SupabaseClient } from '@polla/data';
import {
  partidoARresultado,
  partidoAResultadoProvisional,
  pronosticoRowADominio,
  kickoffMs,
  configRowADominio,
  type PartidoRow,
  type PronosticoRow,
  type ConfigTorneoRow,
} from '@polla/data';
import type { ConfigPuntos } from '@polla/core';
import type {
  PronosticoRepo,
  PartidoParaLock,
  PronosticoUpsert,
} from './services/pronosticoService.js';
import type { PartidoScoring, PronosticoUsuario, UsuarioTabla } from './scoring/index.js';

export class SupabaseRepo implements PronosticoRepo {
  constructor(private readonly db: SupabaseClient) {}

  async getPartido(partidoId: string): Promise<PartidoParaLock | null> {
    const { data, error } = await this.db
      .from('partidos')
      .select('id, kickoff_utc, fase, estado')
      .eq('id', partidoId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id as string,
      kickoffUtcMs: kickoffMs({ kickoff_utc: data.kickoff_utc as string }),
      fase: data.fase as PartidoParaLock['fase'],
      estado: data.estado as string | undefined,
    };
  }

  async upsertPronostico(
    d: PronosticoUpsert,
  ): Promise<{ id: string; version: number; registradoEn: string }> {
    // No incluimos created_at_server/version/updated_at_server: defaults +
    // triggers de la BD se encargan (created se preserva en updates).
    const { data, error } = await this.db
      .from('pronosticos')
      .upsert(
        {
          user_id: d.userId,
          partido_id: d.partidoId,
          marcador_a_90: d.marcadorA90,
          marcador_b_90: d.marcadorB90,
          habra_extra: d.habraExtra,
          extra_a: d.extraA,
          extra_b: d.extraB,
          ganador_final: d.ganadorFinal,
        },
        { onConflict: 'user_id,partido_id' },
      )
      .select('id, version, created_at_server, updated_at_server')
      .single();
    if (error) throw error;
    return {
      id: data.id as string,
      version: data.version as number,
      registradoEn:
        (data.updated_at_server as string) ?? (data.created_at_server as string),
    };
  }

  // --- Lectura para el poller / recálculo ---

  async getConfig(): Promise<ConfigPuntos> {
    const { data, error } = await this.db
      .from('config_torneo')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    return configRowADominio(data as ConfigTorneoRow);
  }

  async getPartidos(): Promise<PartidoRow[]> {
    const { data, error } = await this.db.from('partidos').select('*');
    if (error) throw error;
    return (data ?? []) as PartidoRow[];
  }

  async getPronosticosDePartido(partidoId: string): Promise<PronosticoRow[]> {
    const { data, error } = await this.db
      .from('pronosticos')
      .select('*')
      .eq('partido_id', partidoId);
    if (error) throw error;
    return (data ?? []) as PronosticoRow[];
  }

  async getUsuarios(): Promise<{ userId: string; displayName: string }[]> {
    // Solo PARTICIPANTES: aprobados Y pagados (los que cuentan para la bolsa).
    // El super admin administra pero NO participa. Así la tabla muestra
    // exactamente a quienes ya están activos, no a los pendientes/sin pago.
    const { data, error } = await this.db
      .from('profiles')
      .select('id, display_name, role, estado, pagado')
      .neq('role', 'super_admin')
      .eq('estado', 'aprobado')
      .eq('pagado', true);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      userId: r.id as string,
      displayName: r.display_name as string,
    }));
  }

  /** Elimina filas de la tabla de posiciones que no estén entre `userIds` (p. ej. el super admin o usuarios borrados). */
  async limpiarTablaExcepto(userIds: readonly string[]): Promise<void> {
    let q = this.db.from('tabla_posiciones').delete();
    // Si no hay usuarios participantes, borra todo.
    if (userIds.length > 0) {
      q = q.not('user_id', 'in', `(${userIds.map((id) => `"${id}"`).join(',')})`);
    }
    const { error } = await q;
    if (error) throw error;
  }

  async getResultadosTorneo(): Promise<{
    campeon: string | null;
    goleadores: string[];
    clasificados: Record<string, string[]>;
  }> {
    const { data, error } = await this.db
      .from('resultados_torneo')
      .select('campeon, goleadores, clasificados')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return {
      campeon: (data?.campeon as string | null) ?? null,
      goleadores: (data?.goleadores as string[] | null) ?? [],
      clasificados: (data?.clasificados as Record<string, string[]> | null) ?? {},
    };
  }

  async getBonosPicks(): Promise<
    {
      userId: string;
      campeon: string | null;
      campeonRegistradoEn: string | null;
      goleador: string | null;
      clasificados: Record<string, string[]>;
    }[]
  > {
    const { data, error } = await this.db
      .from('bonos_usuario')
      .select('user_id, campeon_equipo, campeon_registrado_en, goleador_jugador, clasificados');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      userId: r.user_id as string,
      campeon: (r.campeon_equipo as string | null) ?? null,
      campeonRegistradoEn: (r.campeon_registrado_en as string | null) ?? null,
      goleador: (r.goleador_jugador as string | null) ?? null,
      clasificados: (r.clasificados as Record<string, string[]> | null) ?? {},
    }));
  }

  async upsertDesgloses(
    filas: {
      userId: string;
      partidoId: string;
      desglose: unknown;
      puntos: number;
      provisional: boolean;
    }[],
  ): Promise<void> {
    if (filas.length === 0) return;
    const { error } = await this.db.from('desgloses').upsert(
      filas.map((f) => ({
        user_id: f.userId,
        partido_id: f.partidoId,
        desglose: f.desglose,
        puntos: f.puntos,
        provisional: f.provisional,
      })),
      { onConflict: 'user_id,partido_id' },
    );
    if (error) throw error;
  }

  async sellarPartido(partidoId: string): Promise<void> {
    const { error } = await this.db
      .from('partidos')
      .update({ sellado: true })
      .eq('id', partidoId)
      .eq('estado', 'FINISHED');
    if (error) throw error;
  }

  async getPosicionesPrevias(): Promise<Map<string, number>> {
    const { data, error } = await this.db
      .from('tabla_posiciones')
      .select('user_id, posicion');
    if (error) throw error;
    const m = new Map<string, number>();
    for (const r of data ?? []) {
      if (r.posicion != null) m.set(r.user_id as string, r.posicion as number);
    }
    return m;
  }

  async upsertTabla(
    filas: {
      userId: string;
      displayName: string;
      puntosConfirmados: number;
      puntosProvisionales: number;
      puntosTotales: number;
      marcadoresExactos: number;
      resultados1x2: number;
      timestampCampeon: number | null;
      posicion: number;
      movimiento: number;
    }[],
  ): Promise<void> {
    if (filas.length === 0) return;
    const { error } = await this.db.from('tabla_posiciones').upsert(
      filas.map((f) => ({
        user_id: f.userId,
        display_name: f.displayName,
        puntos_confirmados: f.puntosConfirmados,
        puntos_provisionales: f.puntosProvisionales,
        puntos_totales: f.puntosTotales,
        marcadores_exactos: f.marcadoresExactos,
        resultados_1x2: f.resultados1x2,
        timestamp_campeon:
          f.timestampCampeon != null ? new Date(f.timestampCampeon).toISOString() : null,
        posicion: f.posicion,
        movimiento: f.movimiento,
      })),
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  }

  async upsertPartido(row: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('partidos').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  }

  /** Actualización PARCIAL de un partido por id (no toca columnas no incluidas). */
  async actualizarPartido(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('partidos').update(patch).eq('id', id);
    if (error) throw error;
  }

  async upsertEquipos(
    equipos: { id: string; nombre: string; crestUrl: string | null }[],
  ): Promise<void> {
    if (equipos.length === 0) return;
    const { error } = await this.db.from('equipos').upsert(
      equipos.map((e) => ({ id: e.id, nombre: e.nombre, crest_url: e.crestUrl })),
      { onConflict: 'id' },
    );
    if (error) throw error;
  }

  async getBonosUsuario(userId: string): Promise<{
    campeon: string | null;
    campeonRegistradoEn: string | null;
    goleador: string | null;
    goleadorRegistradoEn: string | null;
    clasificados: Record<string, string[]>;
    clasificadosRegistradoEn: Record<string, string>;
  } | null> {
    const { data, error } = await this.db
      .from('bonos_usuario')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      campeon: (data.campeon_equipo as string | null) ?? null,
      campeonRegistradoEn: (data.campeon_registrado_en as string | null) ?? null,
      goleador: (data.goleador_jugador as string | null) ?? null,
      goleadorRegistradoEn: (data.goleador_registrado_en as string | null) ?? null,
      clasificados: (data.clasificados as Record<string, string[]> | null) ?? {},
      clasificadosRegistradoEn:
        (data.clasificados_registrado_en as Record<string, string> | null) ?? {},
    };
  }

  async upsertBonosUsuario(userId: string, row: Record<string, unknown>): Promise<void> {
    const { error } = await this.db
      .from('bonos_usuario')
      .upsert({ user_id: userId, ...row }, { onConflict: 'user_id' });
    if (error) throw error;
  }

  // --- Salud del poller (alerta si falla > 5 min, sección 1) ---

  async marcarPollerExito(fuente: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db
      .from('poller_estado')
      .update({
        ultimo_exito_en: now,
        ultimo_intento_en: now,
        fallos_consecutivos: 0,
        fuente_activa: fuente,
        mensaje: null,
      })
      .eq('id', 1);
    if (error) throw error;
  }

  /** Registra un fallo y devuelve cuánto tiempo lleva sin éxito (ms). */
  async marcarPollerFallo(mensaje: string): Promise<{ msSinExito: number; fallos: number }> {
    const { data } = await this.db
      .from('poller_estado')
      .select('ultimo_exito_en, fallos_consecutivos')
      .eq('id', 1)
      .maybeSingle();
    const fallos = ((data?.fallos_consecutivos as number | null) ?? 0) + 1;
    const ultimoExito = data?.ultimo_exito_en as string | null;
    const msSinExito = ultimoExito ? Date.now() - Date.parse(ultimoExito) : Infinity;
    await this.db
      .from('poller_estado')
      .update({
        ultimo_intento_en: new Date().toISOString(),
        fallos_consecutivos: fallos,
        mensaje,
      })
      .eq('id', 1);
    return { msSinExito, fallos };
  }
}

/** Convierte una fila de partido en el DTO de scoring (resultado + provisional). */
export function partidoRowAScoring(row: PartidoRow): PartidoScoring {
  return {
    id: row.id,
    fase: row.fase,
    estado: row.estado,
    resultado: partidoARresultado(row),
    resultadoProvisional: partidoAResultadoProvisional(row),
  };
}

export function pronosticosRowsAUsuarios(rows: PronosticoRow[]): PronosticoUsuario[] {
  return rows.map((r) => ({
    userId: r.user_id,
    pronostico: pronosticoRowADominio(r),
  }));
}
