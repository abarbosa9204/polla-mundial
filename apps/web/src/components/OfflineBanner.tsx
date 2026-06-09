import { useEffect, useState } from 'react';
import { useOnline } from '../lib/hooks.js';
import { listaCola, pendientes } from '../lib/colaPronosticos.js';

export function OfflineBanner() {
  const online = useOnline();
  const [pend, setPend] = useState(() => pendientes());
  const [errores, setErrores] = useState(() => listaCola().filter((i) => i.estado === 'error').length);

  useEffect(() => {
    const actualizar = () => {
      setPend(pendientes());
      setErrores(listaCola().filter((i) => i.estado === 'error').length);
    };
    window.addEventListener('cola-pronosticos', actualizar);
    const t = setInterval(actualizar, 5000);
    return () => {
      window.removeEventListener('cola-pronosticos', actualizar);
      clearInterval(t);
    };
  }, []);

  if (!online) {
    return (
      <div className="sticky top-0 z-30 bg-amber-500/90 text-slate-900 text-center text-sm py-1.5 font-medium">
        Sin conexión — tus marcadores se guardan y se sincronizarán al volver internet
        {pend > 0 ? ` (${pend} pendiente${pend > 1 ? 's' : ''})` : ''}.
      </div>
    );
  }
  if (pend > 0) {
    return (
      <div className="sticky top-0 z-30 bg-sky-500/90 text-slate-900 text-center text-sm py-1.5 font-medium">
        Sincronizando {pend} marcador{pend > 1 ? 'es' : ''} pendiente{pend > 1 ? 's' : ''}…
      </div>
    );
  }
  if (errores > 0) {
    return (
      <div className="sticky top-0 z-30 bg-red-500/90 text-white text-center text-sm py-1.5 font-medium">
        {errores} marcador{errores > 1 ? 'es' : ''} no se pudo sincronizar (el partido ya cerró).
      </div>
    );
  }
  return null;
}
