import { Component, type ErrorInfo, type ReactNode } from 'react';

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

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Deja el error en consola para diagnosticar (útil al depurar en remoto).
    console.error('[ErrorBoundary]', error, info.componentStack);
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
          {/* Detalle técnico (pequeño) para poder reportar la causa real. */}
          <details className="mt-4 text-left">
            <summary className="text-[11px] text-slate-500 cursor-pointer">Ver detalle técnico</summary>
            <pre className="mt-1 text-[10px] text-slate-500 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
