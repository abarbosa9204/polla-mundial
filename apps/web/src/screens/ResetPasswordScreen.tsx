import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';

export function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (password !== confirmar) return setError('Las contraseñas no coinciden.');
    setCargando(true);
    try {
      await updatePassword(password);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm card p-6">
        <div className="text-center mb-6">
          <div className="text-4xl">🔑</div>
          <h1 className="text-xl font-bold mt-2">Crear nueva contraseña</h1>
        </div>

        {ok ? (
          <div className="space-y-4 text-center">
            <p className="text-emerald-400 text-sm">¡Contraseña actualizada! Ya puedes usar la app.</p>
            <button onClick={() => window.location.assign('/')} className="btn-primary w-full">
              Continuar
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-xl bg-slate-800 px-4 py-3 ring-1 ring-white/10 focus:ring-2 focus:ring-brand outline-none"
              placeholder="Nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-xl bg-slate-800 px-4 py-3 ring-1 ring-white/10 focus:ring-2 focus:ring-brand outline-none"
              placeholder="Repetir contraseña"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={cargando} className="btn-primary w-full">
              {cargando ? '…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => signOut()} className="text-sm text-slate-400 w-full text-center">
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
