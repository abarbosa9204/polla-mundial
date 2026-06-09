import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { Header } from './CalendarioScreen.js';

const ESTADO: Record<string, { txt: string; cls: string }> = {
  pendiente: { txt: 'Pendiente de activación', cls: 'bg-amber-500/20 text-amber-300' },
  aprobado: { txt: 'Activo', cls: 'bg-emerald-500/20 text-emerald-300' },
  rechazado: { txt: 'Inactivo', cls: 'bg-red-500/20 text-red-300' },
};

export function PerfilScreen() {
  const { displayName, session, estado, pagado, esAdmin, updatePassword, signOut } = useAuth();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const email = session?.user.email ?? '—';
  const est = estado ? ESTADO[estado] : null;

  async function cambiar() {
    setMsg(null);
    if (p1.length < 6) return setMsg({ t: 'err', m: 'La contraseña debe tener al menos 6 caracteres.' });
    if (p1 !== p2) return setMsg({ t: 'err', m: 'Las contraseñas no coinciden.' });
    setBusy(true);
    try {
      await updatePassword(p1);
      setMsg({ t: 'ok', m: 'Contraseña actualizada ✓' });
      setP1('');
      setP2('');
    } catch (err) {
      setMsg({ t: 'err', m: err instanceof Error ? err.message : 'No se pudo cambiar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Header titulo="Mi perfil" />
      <div className="px-3 space-y-4">
        <section className="card p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand/20 text-brand grid place-items-center text-xl font-bold">
            {(displayName ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{displayName}</p>
            <p className="text-xs text-slate-400 truncate">{email}</p>
            <div className="flex gap-1.5 mt-1">
              {est && <span className={`text-[10px] rounded-full px-2 py-0.5 ${est.cls}`}>{est.txt}</span>}
              <span className={`text-[10px] rounded-full px-2 py-0.5 ${pagado ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>
                {pagado ? 'Inscripción pagada' : 'Pago pendiente'}
              </span>
            </div>
          </div>
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Mis cosas</h2>
          <Link to="/mis" className="block px-3 py-2 rounded-lg hover:bg-white/5">📝 Mis pronósticos</Link>
          <Link to="/historial" className="block px-3 py-2 rounded-lg hover:bg-white/5">📜 Historial de cambios</Link>
          <Link to="/bonos" className="block px-3 py-2 rounded-lg hover:bg-white/5">⭐ Mis bonos</Link>
          {esAdmin && <Link to="/admin" className="block px-3 py-2 rounded-lg hover:bg-white/5 text-brand">⚙️ Administración</Link>}
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Cambiar contraseña</h2>
          <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Nueva contraseña" className="w-full rounded-xl bg-slate-800 px-3 py-2.5 ring-1 ring-white/10 text-sm" />
          <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Repetir contraseña" className="w-full rounded-xl bg-slate-800 px-3 py-2.5 ring-1 ring-white/10 text-sm" />
          {msg && <p className={`text-sm ${msg.t === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.m}</p>}
          <button disabled={busy} onClick={cambiar} className="btn-primary w-full text-sm">Actualizar contraseña</button>
        </section>

        <button onClick={() => signOut()} className="w-full card p-3 text-red-400 font-medium active:scale-[0.99] transition">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
