/**
 * Gestión de usuarios por el SUPER ADMIN (Admin API de Supabase, service_role).
 *
 * Todo opera por ID (uuid de auth.users), así que cambiar el correo o el nombre
 * de un usuario NO afecta sus pronósticos, puntos ni posición: las FKs son por
 * ID. El display_name se replica en `tabla_posiciones` para la vista en vivo, así
 * que al editarlo lo sincronizamos allí también.
 */
import type { SupabaseClient } from '@polla/data';
import type { EstadoUsuario, Rol } from '../auth.js';

export interface UsuarioAdmin {
  id: string;
  email: string | null;
  display_name: string;
  role: Rol;
  estado: EstadoUsuario;
  pagado: boolean;
  email_confirmado: boolean;
  created_at: string;
}

/** Lista todos los usuarios cruzando auth.users (correo) con profiles (rol/estado). */
export async function listarUsuarios(db: SupabaseClient): Promise<UsuarioAdmin[]> {
  const { data: prof, error } = await db
    .from('profiles')
    .select('id, display_name, role, estado, pagado, created_at');
  if (error) throw new Error(error.message);
  const perfiles = new Map(
    (prof ?? []).map((p) => [p.id as string, p as Record<string, unknown>]),
  );

  // listUsers pagina (50 por defecto); recorremos hasta agotar.
  const usuarios: UsuarioAdmin[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (e) throw new Error(e.message);
    for (const u of data.users) {
      const p = perfiles.get(u.id);
      usuarios.push({
        id: u.id,
        email: u.email ?? null,
        display_name: (p?.display_name as string) ?? u.email?.split('@')[0] ?? '—',
        role: (p?.role as Rol) ?? 'user',
        estado: (p?.estado as EstadoUsuario) ?? 'pendiente',
        pagado: Boolean(p?.pagado),
        email_confirmado: Boolean(u.email_confirmed_at),
        created_at: (p?.created_at as string) ?? u.created_at,
      });
    }
    if (data.users.length < 200) break;
  }
  usuarios.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return usuarios;
}

/**
 * Crea un usuario por invitación: Supabase le envía un correo para fijar su
 * contraseña (usa el SMTP configurado en el panel de Supabase). Queda aprobado.
 */
export async function invitarUsuario(
  db: SupabaseClient,
  email: string,
  displayName: string,
  redirectTo?: string,
): Promise<{ id: string }> {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo,
  });
  if (error) throw new Error(error.message);
  const id = data.user.id;
  const { error: e2 } = await db
    .from('profiles')
    .update({ display_name: displayName, estado: 'aprobado' })
    .eq('id', id);
  if (e2) throw new Error(e2.message);
  return { id };
}

/** Cambia el estado de aprobación de un usuario. */
export async function cambiarEstado(
  db: SupabaseClient,
  id: string,
  estado: EstadoUsuario,
): Promise<void> {
  const { error } = await db.from('profiles').update({ estado }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Edita correo, nombre, contraseña y/o marca de pago sin tocar el ID. */
export async function editarUsuario(
  db: SupabaseClient,
  id: string,
  cambios: { email?: string; password?: string; display_name?: string; pagado?: boolean },
): Promise<void> {
  // Correo / contraseña → Admin API (email_confirm para no exigir reconfirmación).
  const authPatch: Record<string, unknown> = {};
  if (cambios.email) {
    authPatch.email = cambios.email;
    authPatch.email_confirm = true;
  }
  if (cambios.password) authPatch.password = cambios.password;
  if (Object.keys(authPatch).length) {
    const { error } = await db.auth.admin.updateUserById(id, authPatch);
    if (error) throw new Error(error.message);
  }
  // profiles: nombre y/o marca de pago.
  const profPatch: Record<string, unknown> = {};
  if (cambios.display_name) profPatch.display_name = cambios.display_name;
  if (cambios.pagado != null) profPatch.pagado = cambios.pagado;
  if (Object.keys(profPatch).length) {
    const { error } = await db.from('profiles').update(profPatch).eq('id', id);
    if (error) throw new Error(error.message);
    // El nombre se replica en la tabla en vivo.
    if (cambios.display_name) {
      await db.from('tabla_posiciones').update({ display_name: cambios.display_name }).eq('user_id', id);
    }
  }
}

/** Elimina un usuario (cascada: profile, pronósticos, bonos, etc.). */
export async function eliminarUsuario(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}
