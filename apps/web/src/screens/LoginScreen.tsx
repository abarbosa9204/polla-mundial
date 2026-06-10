import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { getLS, setLS, delLS } from '../lib/storage.js';
import { PagoInfo } from '../components/PagoInfo.js';

type Modo = 'login' | 'registro' | 'recuperar';

export function LoginScreen() {
  const { signInEmail, signUpEmail, resendConfirmation, resetPassword } = useAuth();
  const [modo, setModo] = useState<Modo>('login');
  const [email, setEmail] = useState(() => getLS('polla:correo') ?? '');
  const [recordar, setRecordar] = useState(() => getLS('polla:correo') != null);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);
    try {
      // Recordar (o no) el correo en este dispositivo. Nunca se guarda la clave;
      // el navegador ofrece guardarla con su gestor de contraseñas.
      if (recordar) setLS('polla:correo', email);
      else delLS('polla:correo');
      if (modo === 'login') {
        await signInEmail(email, password);
      } else if (modo === 'registro') {
        await signUpEmail(email, password, displayName || email.split('@')[0]!);
        setAviso(
          'Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión. ' +
            'Un administrador debe aprobarte antes de poder pronosticar.',
        );
        setModo('login');
      } else {
        await resetPassword(email);
        setAviso('Si el correo existe, te enviamos un enlace para crear una nueva contraseña.');
        setModo('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCargando(false);
    }
  }

  async function reenviarConfirmacion() {
    setError(null);
    setAviso(null);
    if (!email) {
      setError('Escribe tu correo arriba para reenviarte la confirmación.');
      return;
    }
    setCargando(true);
    try {
      await resendConfirmation(email);
      setAviso('Te reenviamos el correo de confirmación. Revisa tu bandeja y la carpeta de spam.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar.');
    } finally {
      setCargando(false);
    }
  }

  const titulo =
    modo === 'login' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Enviar enlace';

  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm card p-6">
        <div className="text-center mb-6">
          <div className="text-4xl">🏆</div>
          <h1 className="text-xl font-bold mt-2">Polla Mundialista 2026</h1>
          <p className="text-slate-400 text-sm">Pronostica, compite, gana.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {modo === 'registro' && (
            <input
              className="w-full rounded-xl bg-slate-800 px-4 py-3 ring-1 ring-white/10 focus:ring-2 focus:ring-brand outline-none"
              placeholder="Tu nombre para la tabla"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <input
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-xl bg-slate-800 px-4 py-3 ring-1 ring-white/10 focus:ring-2 focus:ring-brand outline-none"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {modo !== 'recuperar' && (
            <input
              type="password"
              required
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-xl bg-slate-800 px-4 py-3 ring-1 ring-white/10 focus:ring-2 focus:ring-brand outline-none"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {modo === 'login' && (
            <label className="flex items-center gap-2 text-sm text-slate-300 select-none">
              <input
                type="checkbox"
                checked={recordar}
                onChange={(e) => setRecordar(e.target.checked)}
                className="w-4 h-4 accent-brand"
              />
              Recordar mi correo en este dispositivo
            </label>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {aviso && <p className="text-emerald-400 text-sm">{aviso}</p>}

          <button type="submit" disabled={cargando} className="btn-primary w-full">
            {cargando ? '…' : titulo}
          </button>
          {modo === 'login' && (
            <p className="text-[11px] text-slate-500 text-center">
              Tu sesión queda guardada en este dispositivo: no tendrás que iniciar sesión cada vez.
            </p>
          )}
        </form>

        {modo === 'login' && (
          <button
            type="button"
            onClick={() => {
              setModo('recuperar');
              setError(null);
              setAviso(null);
            }}
            className="text-sm text-slate-400 mt-3 w-full text-center hover:text-slate-200"
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {modo === 'login' && (
          <button
            type="button"
            disabled={cargando}
            onClick={reenviarConfirmacion}
            className="text-sm text-slate-400 mt-2 w-full text-center hover:text-slate-200 disabled:opacity-50"
          >
            ¿No te llegó el correo? Reenviar confirmación
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login');
            setError(null);
            setAviso(null);
          }}
          className="text-sm text-slate-400 mt-4 w-full text-center hover:text-slate-200"
        >
          {modo === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>

        {modo !== 'recuperar' && <PagoInfo />}
      </div>
    </div>
  );
}
