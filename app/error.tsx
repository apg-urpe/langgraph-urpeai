'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { logComponentError } from '@/lib/error-logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    const context = [
      `Digest: ${error.digest || 'N/A'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`,
      error.stack || ''
    ].join('\n');
    
    logComponentError('GlobalErrorBoundary', error, {
      componentStack: context,
    });
    
    console.error('[App Error]', error);
  }, [error]);

  const errorDetails = `
Error: ${error.message}
Digest: ${error.digest || 'N/A'}
URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}
Time: ${new Date().toISOString()}
User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
${error.stack ? `\nStack:\n${error.stack}` : ''}
  `.trim();

  const copyErrorDetails = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0c] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Main Card */}
        <div className="bg-zinc-900/80 border border-red-500/30 rounded-xl p-6 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className="p-3 bg-red-500/10 rounded-lg shrink-0">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-zinc-50">
                Error de Aplicación
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Ocurrió un error inesperado en el cliente
              </p>
            </div>
          </div>

          {/* Error Summary */}
          <div className="mb-5 p-3 bg-zinc-950/60 border border-red-500/20 rounded-lg">
            <p className="text-sm font-mono text-red-400 break-words">
              {error.message || 'Error desconocido'}
            </p>
            {error.digest && (
              <p className="text-xs text-zinc-500 mt-2">
                ID: {error.digest}
              </p>
            )}
          </div>

          {/* Expandable Details */}
          {(isDev || error.stack) && (
            <div className="mb-5">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors w-full"
              >
                <Bug className="w-4 h-4" />
                <span>Detalles técnicos</span>
                {showDetails ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
              </button>
              
              {showDetails && (
                <div className="mt-3 relative">
                  <div className="p-3 bg-zinc-950/80 border border-zinc-700/40 rounded-lg overflow-auto max-h-48">
                    <pre className="text-xs font-mono text-zinc-500 whitespace-pre-wrap">
                      {errorDetails}
                    </pre>
                  </div>
                  <button
                    onClick={copyErrorDetails}
                    className="absolute top-2 right-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                    title="Copiar detalles"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={reset}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors font-medium text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Intentar de nuevo
            </button>
            
            <button
              onClick={() => window.location.href = '/'}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors font-medium text-sm"
            >
              <Home className="w-4 h-4" />
              Ir a ventana estable
            </button>
          </div>
        </div>

        {/* Help Footer */}
        <p className="text-xs text-zinc-600 mt-4 text-center">
          Si el problema persiste, recarga la página o contacta soporte
        </p>
      </div>
    </div>
  );
}
