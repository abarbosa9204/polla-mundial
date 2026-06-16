/**
 * Código CANÓNICO de selección — fuente única de verdad para el `id` de equipo,
 * independiente de qué API entregue el dato.
 *
 * Problema que resuelve: football-data.org cambia el TLA de algunas selecciones
 * con el tiempo (p.ej. Uruguay `URY`↔`URU`, Curazao `CUW`↔`CUR`) y la fuente
 * secundaria API-Football no trae TLA — el cliente lo derivaba de las 3 primeras
 * letras del nombre (`name.slice(0,3)`), lo que genera códigos distintos para el
 * mismo país (Curacao→CUR, Uruguay→URU) y basura para otros (Cape Verde→CAP…).
 * Eso creaba EQUIPOS DUPLICADOS en la BD. Aquí toda fuente pasa por el mismo
 * resolutor, de modo que cada selección queda SIEMPRE en un solo código estable.
 *
 * Canónicos elegidos: ISO-3166 alfa-3 (Curazao=CUW, Uruguay=URY).
 */

/**
 * Alias de TLA → código canónico. Cuando una API emite una variante conocida,
 * la reescribimos al canónico ANTES de tocar la BD. Extensible si football-data
 * vuelve a cambiar algún código en el futuro.
 */
const ALIAS_TLA: Record<string, string> = {
  CUR: 'CUW', // Curazao (variante derivada de "Curacao".slice(0,3) / football-data)
  URU: 'URY', // Uruguay (TLA de football-data /teams ↔ URY de /matches)
};

/** Normaliza un código de 3 letras a su forma canónica (mayúsculas + alias). */
export function canonicalTla(raw: string): string {
  const up = raw.trim().toUpperCase();
  return ALIAS_TLA[up] ?? up;
}

/** Normaliza un nombre de país para indexarlo (sin acentos, solo letras). */
function normNombre(s: string): string {
  // NFD separa los acentos en marcas combinantes; el filtro [^a-z] final las
  // elimina junto con espacios, guiones y demás (no hace falta un rango aparte).
  return s.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Nombre (en inglés, normalizado) → TLA oficial de football-data. Generado a
 * partir del catálogo oficial de la competición (`/competitions/WC/teams`), con
 * variantes habituales de otras fuentes (API-Football, Flashscore). El valor se
 * pasa luego por `canonicalTla`, así que URU/CUR quedan ya consolidados.
 */
const NOMBRE_A_TLA: Record<string, string> = {
  algeria: 'ALG',
  argentina: 'ARG',
  australia: 'AUS',
  austria: 'AUT',
  belgium: 'BEL',
  bosniaherzegovina: 'BIH',
  bosniaandherzegovina: 'BIH',
  brazil: 'BRA',
  canada: 'CAN',
  ivorycoast: 'CIV',
  cotedivoire: 'CIV',
  congodr: 'COD',
  drcongo: 'COD',
  democraticrepublicofcongo: 'COD',
  colombia: 'COL',
  capeverdeislands: 'CPV',
  capeverde: 'CPV',
  caboverde: 'CPV',
  croatia: 'CRO',
  curacao: 'CUW',
  czechia: 'CZE',
  czechrepublic: 'CZE',
  ecuador: 'ECU',
  egypt: 'EGY',
  england: 'ENG',
  spain: 'ESP',
  france: 'FRA',
  germany: 'GER',
  ghana: 'GHA',
  haiti: 'HAI',
  iran: 'IRN',
  iraq: 'IRQ',
  jordan: 'JOR',
  japan: 'JPN',
  southkorea: 'KOR',
  korearepublic: 'KOR',
  korea: 'KOR',
  saudiarabia: 'KSA',
  morocco: 'MAR',
  mexico: 'MEX',
  netherlands: 'NED',
  holland: 'NED',
  norway: 'NOR',
  newzealand: 'NZL',
  panama: 'PAN',
  paraguay: 'PAR',
  portugal: 'POR',
  qatar: 'QAT',
  southafrica: 'RSA',
  scotland: 'SCO',
  senegal: 'SEN',
  switzerland: 'SUI',
  sweden: 'SWE',
  tunisia: 'TUN',
  turkey: 'TUR',
  turkiye: 'TUR',
  uruguay: 'URU', // → canonicalTla ⇒ URY
  unitedstates: 'USA',
  usa: 'USA',
  unitedstatesofamerica: 'USA',
  uzbekistan: 'UZB',
};

/** Resuelve el código canónico desde un nombre de país; null si no se reconoce. */
export function codigoPorNombre(nombre: string): string | null {
  const tla = NOMBRE_A_TLA[normNombre(nombre)];
  return tla ? canonicalTla(tla) : null;
}

/**
 * Resuelve el `id` canónico de un equipo a partir de lo que traiga la fuente.
 * Prioridad: TLA explícito → nombre conocido → fallback (3 primeras letras o id
 * numérico). El resultado SIEMPRE pasa por `canonicalTla`.
 */
export function codigoEquipo(input: {
  tla?: string | null;
  nombre?: string | null;
  fallbackId?: string | null;
}): string | null {
  if (input.tla) return canonicalTla(input.tla);
  if (input.nombre) {
    const porNombre = codigoPorNombre(input.nombre);
    if (porNombre) return porNombre;
    return canonicalTla(input.nombre.slice(0, 3));
  }
  if (input.fallbackId) return canonicalTla(input.fallbackId);
  return null;
}
