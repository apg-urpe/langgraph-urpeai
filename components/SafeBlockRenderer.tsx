'use client';

import React, { Component, ErrorInfo, ReactNode, useState } from 'react';
import { ValidatedBlock, validateBlock } from '../lib/ui/BlockValidator';
import { logger } from '@/lib/logger';
import { AlertCircle, RefreshCw, Copy, ChevronDown, ChevronUp } from 'lucide-react';

interface SafeBlockRendererProps {
  block: unknown;
  onAction?: (actionId: string, payload?: any) => void;
  onError?: (error: Error, block: ValidatedBlock) => void;
  className?: string;
  disabled?: boolean;
}

interface SafeBlockRendererState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
  validatedBlock: ValidatedBlock | null;
}

export class SafeBlockRenderer extends Component<SafeBlockRendererProps, SafeBlockRendererState> {
  constructor(props: SafeBlockRendererProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
      validatedBlock: null
    };
  }

  static getDerivedStateFromProps(props: SafeBlockRendererProps, state: SafeBlockRendererState) {
    // Si el bloque original cambió, re-validar
    try {
      const validated = validateBlock(props.block);
      return { ...state, validatedBlock: validated };
    } catch (e) {
      return { ...state, hasError: true, error: e as Error };
    }
  }

  static getDerivedStateFromError(error: Error): Partial<SafeBlockRendererState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Report error to parent if we have a validated block
    if (this.props.onError && this.state.validatedBlock) {
      this.props.onError(error, this.state.validatedBlock);
    }

    // Log error for debugging
    logger.error('[SafeBlockRenderer] Component error:', {
      blockType: this.state.validatedBlock?.type,
      blockTitle: this.state.validatedBlock?.title,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  handleRetry = () => {
    if (this.state.retryCount < 3) {
      this.setState(prevState => ({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: prevState.retryCount + 1
      }));
    }
  };

  render() {
    const { validatedBlock, hasError, error, errorInfo, retryCount } = this.state;

    // Caso 1: Error capturado por Boundary o validación fallida
    if (hasError || !validatedBlock || (validatedBlock && validatedBlock._meta.validationType === 'error')) {
      return (
        <BlockErrorFallback 
          block={validatedBlock as ValidatedBlock}
          error={error}
          errorInfo={errorInfo}
          onRetry={this.handleRetry}
          retryCount={retryCount}
          className={this.props.className}
        />
      );
    }

    // Caso 2: Bloque desconocido (pero válido estructuralmente)
    if (validatedBlock.type === 'unknown') {
      return <UnknownBlockFallback block={validatedBlock} />;
    }

    // Importación diferida para evitar dependencia circular si VisualRenderer usa SafeBlockRenderer
    const VisualRenderer = require('./VisualRenderer').VisualRenderer;

    return (
      <div className={this.props.className}>
        <VisualRenderer 
          block={validatedBlock} 
          onInteract={this.props.onAction}
          disabled={this.props.disabled}
        />
      </div>
    );
  }
}

interface BlockErrorFallbackProps {
  block: ValidatedBlock;
  error?: Error;
  errorInfo?: ErrorInfo;
  onRetry: () => void;
  retryCount: number;
  className?: string;
}

const BlockErrorFallback: React.FC<BlockErrorFallbackProps> = ({
  block,
  error,
  errorInfo,
  onRetry,
  retryCount,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopyError = () => {
    const errorText = `Block Type: ${block?.type || 'unknown'}\nBlock Title: ${block?.title || 'n/a'}\nError: ${error?.message}\n\n${error?.stack || ''}`;
    navigator.clipboard.writeText(errorText);
  };

  return (
    <div className={`bg-rose-950/10 border border-rose-900/30 rounded-xl backdrop-blur-sm ${className}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
              {block?._meta?.validationType === 'error' ? 'Validation Error' : 'Render Error'}
            </span>
            <span className="text-xs text-rose-300/60 font-mono">
              {block?.type || 'unknown'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {retryCount < 3 && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 rounded transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry ({3 - retryCount})
              </button>
            )}
            <button
              onClick={handleCopyError}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 rounded transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 rounded transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {isExpanded ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>

        <div className="mb-2">
          <p className="text-sm text-rose-300 font-mono break-words">
            {error?.message || (block?.data?.message as string) || 'Unknown error occurred'}
          </p>
        </div>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-rose-900/30">
            {block?.title && (
              <div>
                <span className="text-[10px] text-rose-400/60 uppercase tracking-wider">Block Title:</span>
                <p className="text-sm text-rose-300 font-mono mt-1">{block.title}</p>
              </div>
            )}

            {error?.stack && (
              <div>
                <span className="text-[10px] text-rose-400/60 uppercase tracking-wider">Stack Trace:</span>
                <pre className="mt-1 p-2 bg-black/20 rounded text-[10px] text-rose-300/50 overflow-x-auto font-mono max-h-40">
                  {error.stack}
                </pre>
              </div>
            )}

            <div>
              <span className="text-[10px] text-rose-400/60 uppercase tracking-wider">Original Data:</span>
              <pre className="mt-1 p-2 bg-black/20 rounded text-[10px] text-rose-300/50 overflow-x-auto font-mono max-h-32 overflow-y-auto">
                {JSON.stringify(block, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Skeleton loader for streaming blocks - Animated "Generando visualización"
export const BlockSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`w-full h-full min-h-[120px] ${className}`}>
    <div className="bg-zinc-900/40 border border-primary-500/20 rounded-xl overflow-hidden p-4 flex flex-col gap-3 backdrop-blur-sm h-full shadow-[0_0_15px_rgba(var(--primary-500),0.1)]">
      {/* Header con indicador de actividad */}
      <div className="flex items-center gap-2 border-b border-primary-500/10 pb-2">
        <div className="relative w-3 h-3">
          <div className="absolute inset-0 bg-primary-400 rounded-sm animate-ping opacity-75"></div>
          <div className="relative w-3 h-3 bg-primary-500 rounded-sm"></div>
        </div>
        <span className="text-[10px] font-medium text-primary-400/80 uppercase tracking-wider">
          Generando visualización
        </span>
        <div className="flex gap-0.5 ml-auto">
          <span className="w-1 h-1 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
          <span className="w-1 h-1 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
          <span className="w-1 h-1 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
        </div>
      </div>
      {/* Skeleton lines con shimmer */}
      <div className="space-y-2 pt-1 flex-1 overflow-hidden">
        <div className="h-5 w-2/3 bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 rounded-md animate-shimmer bg-[length:200%_100%]"></div>
        <div className="h-3 w-full bg-gradient-to-r from-zinc-800/50 via-zinc-700/50 to-zinc-800/50 rounded-md animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '100ms' }}></div>
        <div className="h-3 w-4/5 bg-gradient-to-r from-zinc-800/50 via-zinc-700/50 to-zinc-800/50 rounded-md animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '200ms' }}></div>
      </div>
    </div>
  </div>
);

// Fallback for unknown block types
export const UnknownBlockFallback: React.FC<{
  block: ValidatedBlock;
  onInteract?: (data: any) => void;
}> = ({ block, onInteract }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopyBlock = () => {
    navigator.clipboard.writeText(JSON.stringify(block, null, 2));
  };

  return (
    <div className="bg-amber-950/10 border border-amber-900/30 rounded-xl backdrop-blur-sm">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Unknown Block
            </span>
            <span className="text-xs text-amber-300/60">
              {block.type || 'undefined'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyBlock}
              className="px-2 py-1 text-xs bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 rounded transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-2 py-1 text-xs bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 rounded transition-colors"
            >
              {isExpanded ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>

        {/* Message */}
        <div className="mb-2">
          <p className="text-sm text-amber-300">
            This block type is not supported or malformed.
          </p>
          {block.title && (
            <p className="text-xs text-amber-400/60 mt-1">
              Title: {block.title}
            </p>
          )}
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-amber-900/30">
            <span className="text-xs text-amber-400/60 uppercase tracking-wider">Block Data:</span>
            <pre className="mt-1 p-2 bg-black/20 rounded text-xs text-amber-300/50 overflow-x-auto font-mono max-h-32 overflow-y-auto">
              {JSON.stringify(block, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
