import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInfoPagoPublico } from '../lib/queries.js';

/** Número de Nequi / Daviplata al que se envía la inscripción. */
const NUMERO_PAGO = '3132061200';

/**
 * Bloque de pago en el login: muestra el valor de inscripción (de la
 * parametrización) y el número de Nequi/Daviplata al que enviar el dinero.
 * El valor se lee sin sesión vía una función pública; si no carga, igual se
 * muestra el número para que la persona pueda pagar.
 */
export function PagoInfo() {
  const q = useQuery({
    queryKey: ['infoPagoPublico'],
    queryFn: fetchInfoPagoPublico,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const [copiado, setCopiado] = useState(false);

  const valor = q.data?.valorInscripcion ?? 0;
  const moneda = q.data?.moneda ?? 'COP';

  async function copiar() {
    try {
      await navigator.clipboard.writeText(NUMERO_PAGO);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* algunos navegadores in-app bloquean el portapapeles: se ignora */
    }
  }

  return (
    <div className="mt-5 rounded-xl bg-slate-800/60 ring-1 ring-white/10 p-4 text-center">
      <p className="text-xs text-slate-400">Para participar, envía tu inscripción</p>
      {valor > 0 && (
        <p className="text-lg font-extrabold text-brand mt-0.5 tabular-nums">
          {valor.toLocaleString('es-CO')} {moneda}
        </p>
      )}

      <div className="flex items-center justify-center gap-2 mt-2">
        <NequiBadge />
        <DaviplataBadge />
      </div>

      <button
        type="button"
        onClick={copiar}
        title="Copiar número"
        className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-slate-900/70 ring-1 ring-white/10 px-3 py-1.5 hover:ring-brand/50"
      >
        <PhoneIcon />
        <span className="font-bold tabular-nums tracking-wide">{NUMERO_PAGO}</span>
        <span className={`text-[11px] ${copiado ? 'text-emerald-400' : 'text-slate-400'}`}>
          {copiado ? '¡Copiado!' : 'copiar'}
        </span>
      </button>
    </div>
  );
}

/* ---------- Marcas (chips con los colores de cada billetera) ---------- */

function NequiBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: '#210049' }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#DA0081' }} />
      Nequi
    </span>
  );
}

function DaviplataBadge() {
  return (
    <span
      className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs text-white shadow-sm"
      style={{ backgroundColor: '#E1251B' }}
    >
      <span className="font-semibold">Davi</span>
      <span className="font-extrabold">Plata</span>
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-brand" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
