import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth/AuthProvider.js';
import { sincronizarCola } from './lib/colaPronosticos.js';
import { BottomNav } from './components/BottomNav.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen.js';
import { AprobacionBanner } from './components/AprobacionBanner.js';
import { BienvenidaToast } from './components/BienvenidaToast.js';
import { CalendarioScreen } from './screens/CalendarioScreen.js';
import { PronosticoScreen } from './screens/PronosticoScreen.js';
import { TablaScreen } from './screens/TablaScreen.js';
import { MisPronosticosScreen } from './screens/MisPronosticosScreen.js';
import { BonosScreen } from './screens/BonosScreen.js';
import { HistorialScreen } from './screens/HistorialScreen.js';
import { PartidoGlobalScreen } from './screens/PartidoGlobalScreen.js';
import { AdminScreen } from './screens/AdminScreen.js';
import { GruposScreen } from './screens/GruposScreen.js';
import { ReglasScreen } from './screens/ReglasScreen.js';
import { ResultadosScreen } from './screens/ResultadosScreen.js';
import { GoleadoresScreen } from './screens/GoleadoresScreen.js';
import { BolsaScreen } from './screens/BolsaScreen.js';
import { PerfilScreen } from './screens/PerfilScreen.js';
import { MasScreen } from './screens/MasScreen.js';

export function App() {
  const { session, cargando, recuperando } = useAuth();
  const qc = useQueryClient();

  // Sincroniza la cola offline de pronósticos: al cargar, al volver internet y
  // cada 30 s. Tras sincronizar, refresca lo que depende de los pronósticos.
  useEffect(() => {
    if (!session) return;
    let activo = true;
    const sync = async () => {
      const r = await sincronizarCola();
      if (activo && r.ok > 0) {
        qc.invalidateQueries({ queryKey: ['misPronosticos'] });
        qc.invalidateQueries({ queryKey: ['misDesgloses'] });
        qc.invalidateQueries({ queryKey: ['tabla'] });
      }
    };
    void sync();
    window.addEventListener('online', sync);
    const t = setInterval(sync, 30_000);
    return () => {
      activo = false;
      window.removeEventListener('online', sync);
      clearInterval(t);
    };
  }, [session, qc]);

  if (cargando) {
    return (
      <div className="min-h-dvh grid place-items-center text-slate-400">
        Cargando…
      </div>
    );
  }

  // Llegó desde el enlace de recuperación → fijar nueva contraseña (hay sesión temporal).
  if (recuperando) return <ResetPasswordScreen />;

  if (!session) return <LoginScreen />;

  return (
    <div className="min-h-dvh max-w-lg mx-auto pb-20">
      <BienvenidaToast />
      <OfflineBanner />
      <AprobacionBanner />
      <Routes>
        <Route path="/" element={<CalendarioScreen />} />
        <Route path="/partido/:id" element={<PronosticoScreen />} />
        <Route path="/partido/:id/global" element={<PartidoGlobalScreen />} />
        <Route path="/tabla" element={<TablaScreen />} />
        <Route path="/mis" element={<MisPronosticosScreen />} />
        <Route path="/bonos" element={<BonosScreen />} />
        <Route path="/historial" element={<HistorialScreen />} />
        <Route path="/grupos" element={<GruposScreen />} />
        <Route path="/reglas" element={<ReglasScreen />} />
        <Route path="/resultados" element={<ResultadosScreen />} />
        <Route path="/goleadores" element={<GoleadoresScreen />} />
        <Route path="/bolsa" element={<BolsaScreen />} />
        <Route path="/perfil" element={<PerfilScreen />} />
        <Route path="/mas" element={<MasScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
