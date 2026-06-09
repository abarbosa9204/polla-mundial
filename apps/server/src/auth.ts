/**
 * Verificación del JWT de Supabase Auth. El cliente envía su ID-token (JWT) en
 * `Authorization: Bearer <token>`; aquí se valida con el Admin SDK (service_role)
 * y se resuelve el rol del usuario desde `profiles`.
 */
import { getServiceClient } from './supabase.js';

export type Rol = 'user' | 'admin' | 'super_admin';
export type EstadoUsuario = 'pendiente' | 'aprobado' | 'rechazado';

export interface UsuarioAutenticado {
  userId: string;
  role: Rol;
  estado: EstadoUsuario;
  pagado: boolean;
  email: string | null;
}

export async function verificarJwt(token: string): Promise<UsuarioAutenticado | null> {
  const db = getServiceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: prof } = await db
    .from('profiles')
    .select('role, estado, pagado')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    userId: data.user.id,
    role: (prof?.role as Rol | undefined) ?? 'user',
    estado: (prof?.estado as EstadoUsuario | undefined) ?? 'pendiente',
    pagado: Boolean(prof?.pagado),
    email: data.user.email ?? null,
  };
}

/** ¿El rol tiene privilegios de administración (admin o super_admin)? */
export function esAdmin(role: Rol | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** Extrae el token "Bearer xxx" de la cabecera Authorization. */
export function extraerBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}
