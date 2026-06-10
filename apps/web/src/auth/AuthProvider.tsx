import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';

export type Rol = 'user' | 'admin' | 'super_admin';
export type EstadoUsuario = 'pendiente' | 'aprobado' | 'rechazado';

interface AuthState {
  session: Session | null;
  userId: string | null;
  role: Rol | null;
  estado: EstadoUsuario | null;
  pagado: boolean;
  displayName: string | null;
  cargando: boolean;
  /** El usuario llegó desde un enlace de recuperación → debe fijar nueva clave. */
  recuperando: boolean;
  esAdmin: boolean;
  esSuperAdmin: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (nueva: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Rol | null>(null);
  const [estado, setEstado] = useState<EstadoUsuario | null>(null);
  const [pagado, setPagado] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Cargar rol, estado y nombre desde profiles cuando hay sesión.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) {
      setRole(null);
      setEstado(null);
      setPagado(false);
      setDisplayName(null);
      return;
    }
    supabase
      .from('profiles')
      .select('role, estado, pagado, display_name')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        setRole((data?.role as Rol | undefined) ?? 'user');
        setEstado((data?.estado as EstadoUsuario | undefined) ?? 'pendiente');
        setPagado(Boolean(data?.pagado));
        setDisplayName((data?.display_name as string | undefined) ?? null);
      });
  }, [session?.user.id]);

  const value: AuthState = {
    session,
    userId: session?.user.id ?? null,
    role,
    estado,
    pagado,
    displayName,
    cargando,
    recuperando,
    esAdmin: role === 'admin' || role === 'super_admin',
    esSuperAdmin: role === 'super_admin',
    async signInEmail(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(traducir(error.message));
    },
    async signUpEmail(email, password, displayName) {
      // Supabase crea el usuario y envía el correo de confirmación (SMTP del panel).
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(traducir(error.message));
    },
    async resendConfirmation(email) {
      // Reenvía el correo de confirmación de registro (por si no llegó o caducó).
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(traducir(error.message));
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw new Error(traducir(error.message));
    },
    async updatePassword(nueva) {
      const { error } = await supabase.auth.updateUser({ password: nueva });
      if (error) throw new Error(traducir(error.message));
      setRecuperando(false);
    },
    async signOut() {
      await supabase.auth.signOut();
      setRecuperando(false);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

function traducir(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/already.*regist|already.*exist|email.*exist/i.test(msg)) return 'Ese correo ya está registrado.';
  if (/password should be at least/i.test(msg)) return 'La contraseña es muy corta (mínimo 6).';
  if (/email not confirmed/i.test(msg)) return 'Debes confirmar tu correo antes de entrar (revisa tu bandeja).';
  if (/for security purposes/i.test(msg)) return 'Espera unos segundos antes de volver a intentarlo.';
  return msg;
}
