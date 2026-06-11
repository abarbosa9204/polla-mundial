import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
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

// Persistimos la caché en localStorage para que al REABRIR la PWA se pinten los
// últimos datos al instante (sin spinner) y luego se revaliden en segundo plano.
// `buster` se sube si cambia el esquema de datos para invalidar lo guardado.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
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
          buster: 'v1',
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
