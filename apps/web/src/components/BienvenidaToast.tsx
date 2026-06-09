import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';

/**
 * Saludo de bienvenida al iniciar sesión. Aparece una vez por sesión del
 * navegador (por usuario) y se cierra solo a los 5 s.
 */
export function BienvenidaToast() {
  const { userId, displayName, estado, pagado } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId || !displayName) return;
    const clave = `polla:bienvenida:${userId}`;
    if (sessionStorage.getItem(clave)) return;
    sessionStorage.setItem(clave, '1');
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [userId, displayName]);

  if (!visible) return null;

  const puedeJugar = estado === 'aprobado' && pagado;
  const sub = puedeJugar
    ? '¡Listo para pronosticar! Mucha suerte.'
    : estado === 'aprobado' && !pagado
      ? 'Tu cuenta está activa; falta confirmar tu pago para participar.'
      : 'Tu cuenta está pendiente de activación por el administrador.';

  return (
    <div className="fixed top-3 inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto max-w-md w-full bg-slate-900 ring-1 ring-brand/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-2xl">👋</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">¡Hola, {displayName}!</p>
          <p className="text-xs text-slate-400">{sub}</p>
        </div>
        <button
          onClick={() => setVisible(false)}
          aria-label="Cerrar"
          className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
