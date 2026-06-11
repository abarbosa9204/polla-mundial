import { useMemo, useRef, useState, useEffect } from 'react';

export interface OpcionSelector {
  value: string;
  label: string;
  sub?: string;        // texto secundario (p. ej. equipo del jugador)
  img?: string | null; // bandera / foto
  badge?: string;      // sigla
}

/**
 * Selector con buscador (combobox). Móvil-first: botón que abre un panel con
 * input de búsqueda y lista filtrada. Muestra bandera/foto y nombre.
 */
export function SelectorBuscador({
  opciones,
  value,
  onChange,
  placeholder = 'Buscar…',
  vacioLabel = '— Elegir —',
  disabled = false,
}: {
  opciones: OpcionSelector[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  vacioLabel?: string;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const sel = opciones.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t
      ? opciones.filter(
          (o) =>
            o.label.toLowerCase().includes(t) ||
            o.sub?.toLowerCase().includes(t) ||
            o.badge?.toLowerCase().includes(t),
        )
      : opciones;
    return base.slice(0, 60);
  }, [opciones, q]);

  useEffect(() => {
    if (!abierto) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [abierto]);

  function elegir(v: string) {
    onChange(v);
    setAbierto(false);
    setQ('');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAbierto((v) => !v)}
        className={`w-full rounded-xl bg-slate-800 px-3 py-2.5 ring-1 ring-white/10 flex items-center gap-2 text-left ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {sel ? (
          <>
            {sel.img ? (
              <img src={sel.img} alt="" className="w-6 h-6 rounded-sm object-contain shrink-0" />
            ) : sel.badge ? (
              <span className="w-6 h-6 grid place-items-center rounded-sm bg-slate-700 text-[10px] shrink-0">{sel.badge}</span>
            ) : null}
            <span className="flex-1 truncate">{sel.label}</span>
            {sel.sub && <span className="text-xs text-slate-400 truncate">{sel.sub}</span>}
          </>
        ) : (
          <span className="flex-1 text-slate-400">{vacioLabel}</span>
        )}
        <span className="text-slate-500 text-xs">▾</span>
      </button>

      {abierto && (
        <div className="absolute z-40 mt-1 w-full bg-slate-900 ring-1 ring-white/15 rounded-2xl shadow-2xl p-2 max-h-72 overflow-hidden flex flex-col">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm mb-2"
          />
          <ul className="overflow-auto">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => elegir('')}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 text-slate-400 text-sm"
                >
                  {vacioLabel}
                </button>
              </li>
            )}
            {filtradas.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => elegir(o.value)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 ${
                    o.value === value ? 'bg-white/5' : ''
                  }`}
                >
                  {o.img ? (
                    <img src={o.img} alt="" className="w-6 h-6 rounded-sm object-contain shrink-0" />
                  ) : o.badge ? (
                    <span className="w-6 h-6 grid place-items-center rounded-sm bg-slate-700 text-[10px] shrink-0">{o.badge}</span>
                  ) : null}
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.sub && <span className="text-xs text-slate-400 truncate">{o.sub}</span>}
                </button>
              </li>
            ))}
            {filtradas.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">Sin resultados.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
