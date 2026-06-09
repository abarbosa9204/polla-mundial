import type { EquipoView } from '../lib/queries.js';

export function TeamBadge({
  equipo,
  size = 28,
}: {
  equipo: EquipoView | undefined;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {equipo?.crest_url ? (
        <img
          src={equipo.crest_url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="rounded-sm object-contain shrink-0"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="grid place-items-center rounded-sm bg-slate-700 text-[10px] shrink-0"
          style={{ width: size, height: size }}
        >
          {equipo?.id ?? '?'}
        </span>
      )}
      <span className="truncate">{equipo?.nombre ?? equipo?.id ?? 'Por definir'}</span>
    </span>
  );
}
