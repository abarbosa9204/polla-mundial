/**
 * Bolsa y premios. La bolsa = suma de `valor_polla` de los usuarios ACTIVOS
 * (estado 'aprobado'). El reparto a los 3 primeros lo SUGIERE el sistema por
 * porcentaje, pero el admin puede fijar montos exactos (monto_X). Todo se calcula
 * en el servidor para no exponer los aportes individuales a los clientes.
 */
import { getServiceClient } from '../supabase.js';

export interface PremiosConfig {
  moneda: string;
  valor_inscripcion: number;
  pct_primero: number;
  pct_segundo: number;
  pct_tercero: number;
  monto_primero: number | null;
  monto_segundo: number | null;
  monto_tercero: number | null;
}

const DEFAULT: PremiosConfig = {
  moneda: 'COP',
  valor_inscripcion: 0,
  pct_primero: 50,
  pct_segundo: 30,
  pct_tercero: 20,
  monto_primero: null,
  monto_segundo: null,
  monto_tercero: null,
};

export async function getPremiosConfig(): Promise<PremiosConfig> {
  const db = getServiceClient();
  const { data, error } = await db.from('config_premios').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return { ...DEFAULT, ...(data as Partial<PremiosConfig> | null) };
}

export async function setPremiosConfig(patch: Partial<PremiosConfig>): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from('config_premios')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}

export interface PremioPuesto {
  puesto: number;
  pct: number;
  monto: number;
  definidoManual: boolean;
}

export interface Bolsa {
  moneda: string;
  valorInscripcion: number;
  bolsa: number;
  aportantes: number;
  premios: PremioPuesto[];
}

export async function getBolsa(): Promise<Bolsa> {
  const db = getServiceClient();
  const [cfg, perfiles] = await Promise.all([
    getPremiosConfig(),
    // El super admin administra pero no participa: se excluye de la bolsa.
    db.from('profiles').select('estado, pagado, role').neq('role', 'super_admin'),
  ]);
  if (perfiles.error) throw new Error(perfiles.error.message);

  // Bolsa = inscripción × usuarios APROBADOS y con PAGO confirmado (sin super admin).
  const aportantes = (perfiles.data ?? []).filter(
    (p) => p.estado === 'aprobado' && p.pagado === true,
  ).length;
  const bolsa = Number(cfg.valor_inscripcion) * aportantes;

  const calc = (pct: number, monto: number | null): PremioPuesto => ({
    puesto: 0,
    pct,
    monto: monto != null ? Number(monto) : Math.round((bolsa * Number(pct)) / 100),
    definidoManual: monto != null,
  });

  const premios = [
    { ...calc(cfg.pct_primero, cfg.monto_primero), puesto: 1 },
    { ...calc(cfg.pct_segundo, cfg.monto_segundo), puesto: 2 },
    { ...calc(cfg.pct_tercero, cfg.monto_tercero), puesto: 3 },
  ];

  return { moneda: cfg.moneda, valorInscripcion: Number(cfg.valor_inscripcion), bolsa, aportantes, premios };
}
