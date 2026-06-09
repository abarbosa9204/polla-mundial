import { useEffect, useState } from 'react';

/** Indica si el navegador está online (para banner offline y deshabilitar guardado). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * Cuenta regresiva en VIVO (tic cada segundo) hasta el CIERRE del pronóstico, que
 * ocurre `margenMs` antes del kickoff (por defecto 5 min). Devuelve ms restantes
 * y si ya cerró. El reloj base es la hora actual del dispositivo (sin consumir API).
 */
export function useCountdown(
  kickoffUtc: string | null,
  margenMs = 0,
): {
  msRestantes: number;
  cerrado: boolean;
  etiqueta: string;
} {
  const target = kickoffUtc ? Date.parse(kickoffUtc) - margenMs : null;
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (target == null) return { msRestantes: 0, cerrado: true, etiqueta: '—' };
  const ms = target - ahora;
  const cerrado = ms <= 0;
  return { msRestantes: ms, cerrado, etiqueta: formatearRestante(ms) };
}

/** Hora actual (Colombia) que avanza cada segundo. Para mostrar un reloj en vivo. */
export function useRelojColombia(): string {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return new Date(ahora).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function formatearRestante(ms: number): string {
  if (ms <= 0) return 'Cerrado';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${seg}s`;
  return `${seg}s`;
}
