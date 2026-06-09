import { Link } from 'react-router-dom';
import { Header } from './CalendarioScreen.js';
import { useAuth } from '../auth/AuthProvider.js';

const ENLACES = [
  { to: '/bolsa', icon: '💰', label: 'Bolsa y premios', desc: 'Cuánto se reparte y a los 3 primeros' },
  { to: '/resultados', icon: '✅', label: 'Resultados', desc: 'Marcadores de los partidos jugados' },
  { to: '/goleadores', icon: '🥇', label: 'Goleadores', desc: 'Ranking de artilleros del Mundial' },
  { to: '/reglas', icon: '📖', label: 'Reglas y puntaje', desc: 'Cómo se gana cada punto' },
  { to: '/historial', icon: '📜', label: 'Historial', desc: 'Tus cambios de pronóstico' },
];

export function MasScreen() {
  const { esAdmin, displayName, signOut } = useAuth();
  return (
    <div>
      <Header titulo="Más" />
      <div className="px-3 space-y-2">
        {/* Perfil del usuario */}
        <Link to="/perfil" className="card p-4 flex items-center gap-3 active:scale-[0.99] transition block">
          <div className="w-10 h-10 rounded-full bg-brand/20 text-brand grid place-items-center font-bold">
            {(displayName ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{displayName}</p>
            <p className="text-xs text-slate-400">Ver mi perfil y datos</p>
          </div>
          <span className="text-slate-500">›</span>
        </Link>

        {ENLACES.map((e) => (
          <Link key={e.to} to={e.to} className="card p-4 flex items-center gap-3 active:scale-[0.99] transition block">
            <span className="text-2xl">{e.icon}</span>
            <div className="min-w-0">
              <p className="font-semibold">{e.label}</p>
              <p className="text-xs text-slate-400 truncate">{e.desc}</p>
            </div>
          </Link>
        ))}

        {esAdmin && (
          <Link to="/admin" className="card p-4 flex items-center gap-3 active:scale-[0.99] transition block">
            <span className="text-2xl">⚙️</span>
            <div className="min-w-0">
              <p className="font-semibold">Administración</p>
              <p className="text-xs text-slate-400 truncate">Usuarios, pagos, correo, premios y resultados</p>
            </div>
          </Link>
        )}

        <button onClick={() => signOut()} className="card w-full p-4 text-red-400 font-medium active:scale-[0.99] transition">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
