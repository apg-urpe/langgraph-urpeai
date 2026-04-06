'use client';

import { logger } from '@/lib/logger';

/**
 * Error Boundary Component
 * 
 * Propósito:
 * - Captura errores de React en componentes hijos
 * - Previene crashes completos de la aplicación
 * - Logging automático de errores
 * - UI de fallback amigable
 * 
 * Uso:
 * ```tsx
 * <ErrorBoundary fallback={<CustomError />}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logComponentError } from '@/lib/error-logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });

    logComponentError(
      this.props.componentName || 'ErrorBoundary',
      error,
      {
        componentStack: errorInfo.componentStack || undefined
      }
    );

    this.props.onError?.(error, errorInfo);

    if (process.env.NODE_ENV === 'development') {
      logger.error('[ErrorBoundary] Caught error:', error);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prevProps.resetKeys &&
      this.props.resetKeys.some((key, index) => key !== prevProps.resetKeys?.[index])
    ) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          resetError={this.resetErrorBoundary}
        />
      );
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  resetError: () => void;
}

function DefaultErrorFallback({ error, errorInfo, resetError }: DefaultErrorFallbackProps) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-zinc-900/80 border border-red-500/30 rounded-xl p-8 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-red-500/10 rounded-lg">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-50">
              Algo salió mal
            </h1>
            <p className="text-zinc-400 mt-1">
              La aplicación encontró un error inesperado
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-zinc-950/50 border border-red-500/20 rounded-lg">
            <p className="text-sm font-mono text-red-400">
              {error.message || 'Error desconocido'}
            </p>
          </div>
        )}

        {/* Error Stack (Development Only) */}
        {isDevelopment && errorInfo?.componentStack && (
          <details className="mb-6">
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-300 mb-2">
              Ver detalles técnicos
            </summary>
            <div className="p-4 bg-zinc-950/50 border border-zinc-700/30 rounded-lg overflow-auto max-h-64">
              <pre className="text-xs font-mono text-zinc-500 whitespace-pre-wrap">
                {errorInfo.componentStack}
              </pre>
            </div>
          </details>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={resetError}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Intentar de nuevo
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Ir al inicio
          </button>
        </div>

        {/* Help Text */}
        <p className="text-xs text-zinc-500 mt-6 text-center">
          Si el problema persiste, contacta al soporte técnico
        </p>
      </div>
    </div>
  );
}

/**
 * Minimal Error Boundary for critical sections
 */
export class MinimalErrorBoundary extends Component<
  { children: ReactNode; componentName?: string },
  { hasError: boolean; error: Error | null }
> {
  private retryCount = 0;
  private static MAX_DOM_RETRIES = 1;

  constructor(props: { children: ReactNode; componentName?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  // Detect errors caused by browser extensions manipulating the DOM
  private static isDOMManipulationError(error: Error): boolean {
    const msg = error.message || '';
    return msg.includes('removeChild') ||
           msg.includes('insertBefore') ||
           msg.includes('appendChild') ||
           msg.includes('is not a child of');
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Auto-retry once for DOM manipulation errors (browser extensions)
    if (MinimalErrorBoundary.isDOMManipulationError(error) && this.retryCount < MinimalErrorBoundary.MAX_DOM_RETRIES) {
      this.retryCount++;
      logger.warn(`[MinimalErrorBoundary:${this.props.componentName || '?'}] DOM manipulation error (likely browser extension). Auto-retrying (${this.retryCount}/${MinimalErrorBoundary.MAX_DOM_RETRIES})`);
      this.setState({ hasError: false, error: null });
      return;
    }

    logComponentError(
      this.props.componentName || 'MinimalErrorBoundary',
      error,
      { componentStack: errorInfo.componentStack || undefined }
    );
    if (process.env.NODE_ENV === 'development') {
      logger.error(`[MinimalErrorBoundary:${this.props.componentName || '?'}]`, error);
    }
  }

  render() {
    if (this.state.hasError) {
      const isDOMError = this.state.error ? MinimalErrorBoundary.isDOMManipulationError(this.state.error) : false;
      return (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">
            Error al cargar este componente
          </p>
          {this.state.error && (
            <p className="text-[10px] text-red-400/60 mt-1 font-mono break-all">
              {this.state.error.message}
            </p>
          )}
          {isDOMError && (
            <button
              onClick={() => {
                this.retryCount = 0;
                this.setState({ hasError: false, error: null });
              }}
              className="mt-2 text-[10px] text-primary-400 hover:text-primary-300 underline"
            >
              Reintentar
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Error Boundary específico para el Chat
 */
export function ChatErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-50 mb-2">
              Error en el chat
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              No se pudo cargar la interfaz del chat. Intenta recargar la página.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Error Boundary específico para el Admin Panel
 * Clase para capturar error + componentStack y mostrarlos en diagnóstico
 */
export class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; componentStack: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ componentStack: errorInfo.componentStack || null });
    logComponentError('AdminErrorBoundary', error, {
      componentStack: errorInfo.componentStack || undefined,
    });
    // Siempre loguear en consola para diagnóstico en producción
    console.error('[AdminErrorBoundary] Crash capturado:', error.message);
    console.error('[AdminErrorBoundary] Stack de componentes:', errorInfo.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-zinc-50 mb-2">
            Error en el panel de administración
          </h3>
          {this.state.error && (
            <p className="text-xs font-mono text-red-400/80 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-4 text-left break-all">
              {this.state.error.message}
            </p>
          )}
          <p className="text-sm text-zinc-400 mb-4">
            No se pudo cargar el panel. Verifica tu conexión e intenta nuevamente.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              Recargar
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
