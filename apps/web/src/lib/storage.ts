/**
 * Acceso SEGURO a localStorage/sessionStorage.
 *
 * En navegadores in-app (WhatsApp, Instagram, Facebook), en modo privado o con
 * cookies bloqueadas, `localStorage`/`sessionStorage` puede lanzar una excepción
 * con solo leerlos. Si eso ocurre dentro del render (p. ej. en un `useState`
 * inicial), la pantalla entera deja de dibujarse y al usuario "no le sale nada".
 *
 * Estos wrappers nunca lanzan: si el almacenamiento no está disponible, leen como
 * vacío y las escrituras se ignoran silenciosamente. La app sigue funcionando
 * (solo se pierde el "recordar" en ese dispositivo).
 */
function area(tipo: 'local' | 'session'): Storage | null {
  try {
    const s = tipo === 'local' ? window.localStorage : window.sessionStorage;
    // Prueba real de escritura: algunos navegadores exponen el objeto pero fallan al usarlo.
    const k = '__polla_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

const LS = area('local');
const SS = area('session');

export function getLS(clave: string): string | null {
  try {
    return LS?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

export function setLS(clave: string, valor: string): void {
  try {
    LS?.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function delLS(clave: string): void {
  try {
    LS?.removeItem(clave);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function getSS(clave: string): string | null {
  try {
    return SS?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

export function setSS(clave: string, valor: string): void {
  try {
    SS?.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}
