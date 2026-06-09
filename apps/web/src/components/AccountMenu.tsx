import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';

export function AccountMenu() {
  const { displayName, esAdmin, signOut } = useAuth();
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-9 h-9 rounded-full bg-brand/20 text-brand grid place-items-center font-bold"
        aria-label="Cuenta"
      >
        {(displayName ?? '?').slice(0, 1).toUpperCase()}
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-slate-900 ring-1 ring-white/15 rounded-2xl shadow-2xl p-2 z-30 text-sm">
            <p className="px-3 py-1.5 text-slate-400 truncate">{displayName}</p>
            <Link to="/perfil" onClick={() => setAbierto(false)} className="block px-3 py-2 rounded-lg hover:bg-white/5">
              👤 Mi perfil
            </Link>
            {esAdmin && (
              <Link to="/admin" onClick={() => setAbierto(false)} className="block px-3 py-2 rounded-lg hover:bg-white/5">
                ⚙️ Administración
              </Link>
            )}
            <button onClick={() => signOut()} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-red-400">
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
