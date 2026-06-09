import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Partidos', icon: '⚽' },
  { to: '/grupos', label: 'Cuadro', icon: '🗂️' },
  { to: '/tabla', label: 'Tabla', icon: '🏆' },
  { to: '/bonos', label: 'Bonos', icon: '⭐' },
  { to: '/mis', label: 'Mías', icon: '📝' },
  { to: '/mas', label: 'Más', icon: '⋯' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-slate-900/95 backdrop-blur border-t border-white/5">
      <ul className="grid grid-cols-6 max-w-lg mx-auto">
        {items.map((it) => (
          <li key={it.to}>
            <NavLink
              to={it.to}
              end={it.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  isActive ? 'text-brand' : 'text-slate-400'
                }`
              }
            >
              <span className="text-lg leading-none">{it.icon}</span>
              {it.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
