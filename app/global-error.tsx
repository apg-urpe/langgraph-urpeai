'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error('[Global Error - Layout Level]', error);
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
      // Ignore
    }
  };

  return (
    <html lang="es">
      <body style={{ 
        margin: 0, 
        backgroundColor: '#0a0a0c', 
        color: '#fafafa',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{ maxWidth: '28rem', width: '100%' }}>
            {/* Main Card */}
            <div style={{
              backgroundColor: 'rgba(24, 24, 27, 0.8)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 0 40px rgba(239, 68, 68, 0.1)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                <div style={{
                  padding: '12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  flexShrink: 0
                }}>
                  <AlertTriangle style={{ width: '28px', height: '28px', color: '#ef4444' }} />
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fafafa' }}>
                    Error Crítico
                  </h1>
                  <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#a1a1aa' }}>
                    La aplicación no pudo cargar correctamente
                  </p>
                </div>
              </div>

              {/* Error Summary */}
              <div style={{
                marginBottom: '20px',
                padding: '12px',
                backgroundColor: 'rgba(9, 9, 11, 0.6)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px'
              }}>
                <p style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  color: '#f87171',
                  wordBreak: 'break-word'
                }}>
                  {error.message || 'Error desconocido en el layout principal'}
                </p>
                {error.digest && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#71717a' }}>
                    ID: {error.digest}
                  </p>
                )}
              </div>

              {/* Expandable Details */}
              <div style={{ marginBottom: '20px' }}>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.875rem',
                    color: '#a1a1aa',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    width: '100%'
                  }}
                >
                  <Bug style={{ width: '16px', height: '16px' }} />
                  <span>Detalles técnicos</span>
                  {showDetails ? (
                    <ChevronUp style={{ width: '16px', height: '16px', marginLeft: 'auto' }} />
                  ) : (
                    <ChevronDown style={{ width: '16px', height: '16px', marginLeft: 'auto' }} />
                  )}
                </button>
                
                {showDetails && (
                  <div style={{ marginTop: '12px', position: 'relative' }}>
                    <div style={{
                      padding: '12px',
                      backgroundColor: 'rgba(9, 9, 11, 0.8)',
                      border: '1px solid rgba(63, 63, 70, 0.4)',
                      borderRadius: '8px',
                      overflow: 'auto',
                      maxHeight: '192px'
                    }}>
                      <pre style={{
                        margin: 0,
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        color: '#71717a',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {errorDetails}
                      </pre>
                    </div>
                    <button
                      onClick={copyErrorDetails}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        padding: '6px',
                        backgroundColor: '#27272a',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="Copiar detalles"
                    >
                      {copied ? (
                        <Check style={{ width: '14px', height: '14px', color: '#4ade80' }} />
                      ) : (
                        <Copy style={{ width: '14px', height: '14px', color: '#a1a1aa' }} />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={reset}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '0.875rem'
                  }}
                >
                  <RefreshCw style={{ width: '16px', height: '16px' }} />
                  Intentar de nuevo
                </button>
                
                <button
                  onClick={() => window.location.href = '/'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#27272a',
                    color: '#e4e4e7',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '0.875rem'
                  }}
                >
                  <Home style={{ width: '16px', height: '16px' }} />
                  Ir a ventana estable
                </button>
              </div>
            </div>

            {/* Help Footer */}
            <p style={{
              margin: '16px 0 0',
              fontSize: '0.75rem',
              color: '#52525b',
              textAlign: 'center'
            }}>
              Si el problema persiste, borra la caché del navegador o contacta soporte
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
