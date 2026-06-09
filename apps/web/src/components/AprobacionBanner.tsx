import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';

/**
 * Aviso (cerrable) cuando el usuario aún no puede participar: o no está activado, o
 * no tiene el pago confirmado. No bloquea: se puede cerrar y reaparece en la
 * siguiente sesión. La info completa siempre está en Mi perfil.
 */
export function AprobacionBanner() {
  const { estado, pagado, esAdmin } = useAuth();
  const clave = `polla:aviso-cerrado:${estado}:${pagado}`;
  const [cerrado, setCerrado] = useState(() => sessionStorage.getItem(clave) === '1');

  if (esAdmin || estado === null) return null;
  if (estado === 'aprobado' && pagado) return null;
  if (cerrado) return null;

  let texto: string;
  let rojo = false;
  if (estado === 'rechazado') {
    texto = 'Tu cuenta está inactiva. Contacta al administrador.';
    rojo = true;
  } else if (estado === 'pendiente') {
    texto = 'Tu cuenta está pendiente de activación por el administrador.';
  } else {
    texto = 'Falta confirmar tu pago de inscripción para poder pronosticar.';
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs ${rojo ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
      <span className="flex-1">{texto}</span>
      <button
        onClick={() => {
          sessionStorage.setItem(clave, '1');
          setCerrado(true);
        }}
        aria-label="Cerrar aviso"
        className="shrink-0 w-5 h-5 grid place-items-center rounded-full hover:bg-white/10"
      >
        ✕
      </button>
    </div>
  );
}
