import { Component, type ReactNode } from 'react';

/**
 * Red de seguridad global: si algún componente lanza al renderizar (p. ej. un
 * navegador in-app que bloquea APIs), en vez de dejar la pantalla en blanco
 * ("no sale nada") mostramos un mensaje claro con un botón para reintentar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh grid place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl">😕</div>
          <h1 className="text-lg font-bold mt-2">Algo se interrumpió</h1>
          <p className="text-sm text-slate-400 mt-1">
            No pudimos cargar la pantalla. Si abriste el enlace dentro de WhatsApp/Instagram, intenta
            abrirlo en tu navegador (Chrome/Safari).
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mt-4"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
