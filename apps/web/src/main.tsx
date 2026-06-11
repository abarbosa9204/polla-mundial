import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from './auth/AuthProvider.js';
import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime: 30 s → tras pintar desde caché, revalida en segundo plano.
      staleTime: 30_000,
      // gcTime alto: las consultas sobreviven en memoria/caché persistida entre
      // navegaciones y reaperturas (si fuera < maxAge, no se restaurarían).
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// localStorage SEGURO: algunos navegadores in-app (WhatsApp/Instagram, modo
// privado) lanzan excepción con solo TOCAR localStorage. Si no está disponible,
// devolvemos undefined → la persistencia se desactiva (noop) y la app sigue
// funcionando, en vez de crashear al arrancar.
function storageSegura(): Storage | undefined {
  try {
    const k = '__polla_ls_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// Persistimos la caché para que al REABRIR la PWA se pinten los últimos datos al
// instante (sin spinner) y luego se revaliden en segundo plano. `buster` se sube
// si cambia el esquema de datos para invalidar lo guardado.
const persister = createSyncStoragePersister({
  storage: storageSegura(),
  key: 'polla:rq-cache:v1',
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60 * 1000, // 24 h: descarta caché más vieja
          // Subir el buster invalida la caché previa en TODOS los dispositivos.
          // v2: Map roto; v3: pronósticos "fantasma" de guardados offline no confirmados.
          buster: 'v3',
          dehydrateOptions: {
            // NO persistir consultas cuyo dato es un Map (`equipos`, `perfiles`):
            // los Map no sobreviven a JSON (se vuelven {}) y al rehidratar
            // `data.get(...)` deja de ser función → crash. Se refrescan al cargar.
            shouldDehydrateQuery: (query) => {
              const key = query.queryKey?.[0];
              if (key === 'equipos' || key === 'perfiles') return false;
              return defaultShouldDehydrateQuery(query);
            },
          },
        }}
      >
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
