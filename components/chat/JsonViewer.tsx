'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, Maximize2, Minimize2 } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  name?: string;
  collapsed?: boolean;
  level?: number;
  maxInitialDepth?: number;
}

// Color scheme for different types
const TYPE_COLORS = {
  string: 'text-emerald-400',
  number: 'text-amber-400',
  boolean: 'text-purple-400',
  null: 'text-zinc-500',
  key: 'text-cyan-400',
  bracket: 'text-zinc-400',
};

const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  name,
  collapsed: initialCollapsed = false,
  level = 0,
  maxInitialDepth = 2,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed || level >= maxInitialDepth);
  const [copied, setCopied] = useState(false);

  const isExpandable = useMemo(() => {
    return data !== null && typeof data === 'object';
  }, [data]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [data]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Render primitive values
  const renderValue = (value: any): React.ReactNode => {
    if (value === null) {
      return <span className={TYPE_COLORS.null}>null</span>;
    }
    if (value === undefined) {
      return <span className={TYPE_COLORS.null}>undefined</span>;
    }
    
    switch (typeof value) {
      case 'string':
        // Truncate long strings
        const displayStr = value.length > 100 ? value.substring(0, 100) + '...' : value;
        return (
          <span className={TYPE_COLORS.string} title={value.length > 100 ? value : undefined}>
            &quot;{displayStr}&quot;
          </span>
        );
      case 'number':
        return <span className={TYPE_COLORS.number}>{value}</span>;
      case 'boolean':
        return <span className={TYPE_COLORS.boolean}>{value.toString()}</span>;
      default:
        return <span className="text-zinc-400">{String(value)}</span>;
    }
  };

  // Render object/array preview when collapsed
  const renderPreview = (): string => {
    if (Array.isArray(data)) {
      return `Array(${data.length})`;
    }
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length <= 3) {
        return `{ ${keys.join(', ')} }`;
      }
      return `{ ${keys.slice(0, 3).join(', ')}, ... }`;
    }
    return '';
  };

  // Non-expandable values
  if (!isExpandable) {
    return (
      <div className="inline-flex items-center gap-1">
        {name && (
          <>
            <span className={TYPE_COLORS.key}>&quot;{name}&quot;</span>
            <span className={TYPE_COLORS.bracket}>: </span>
          </>
        )}
        {renderValue(data)}
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data : Object.entries(data);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  return (
    <div className="font-mono text-xs">
      {/* Header row with expand/collapse */}
      <div className="flex items-center gap-1 group">
        <button
          onClick={toggleCollapse}
          className="p-0.5 hover:bg-white/10 rounded transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-zinc-500" />
          ) : (
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          )}
        </button>
        
        {name && (
          <>
            <span className={TYPE_COLORS.key}>&quot;{name}&quot;</span>
            <span className={TYPE_COLORS.bracket}>: </span>
          </>
        )}
        
        <span className={TYPE_COLORS.bracket}>{openBracket}</span>
        
        {isCollapsed && (
          <>
            <span className="text-zinc-500 text-[10px]">{renderPreview()}</span>
            <span className={TYPE_COLORS.bracket}>{closeBracket}</span>
          </>
        )}
        
        {/* Copy button - show on hover */}
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all ml-1"
          title="Copy JSON"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-500" />
          )}
        </button>
      </div>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="ml-4 border-l border-zinc-700/50 pl-2">
          {isArray ? (
            data.map((item: any, index: number) => (
              <div key={index} className="py-0.5">
                <span className="text-zinc-500 mr-1">{index}:</span>
                {typeof item === 'object' && item !== null ? (
                  <JsonViewer
                    data={item}
                    level={level + 1}
                    maxInitialDepth={maxInitialDepth}
                  />
                ) : (
                  renderValue(item)
                )}
                {index < data.length - 1 && <span className={TYPE_COLORS.bracket}>,</span>}
              </div>
            ))
          ) : (
            Object.entries(data).map(([key, value], index, arr) => (
              <div key={key} className="py-0.5">
                {typeof value === 'object' && value !== null ? (
                  <JsonViewer
                    data={value}
                    name={key}
                    level={level + 1}
                    maxInitialDepth={maxInitialDepth}
                  />
                ) : (
                  <div className="inline-flex items-center">
                    <span className={TYPE_COLORS.key}>&quot;{key}&quot;</span>
                    <span className={TYPE_COLORS.bracket}>: </span>
                    {renderValue(value)}
                  </div>
                )}
                {index < arr.length - 1 && <span className={TYPE_COLORS.bracket}>,</span>}
              </div>
            ))
          )}
          <span className={TYPE_COLORS.bracket}>{closeBracket}</span>
        </div>
      )}
    </div>
  );
};

// Calculate data size for display
const getDataSize = (data: any): { size: number; unit: string; isLarge: boolean } => {
  try {
    const str = JSON.stringify(data);
    const bytes = new Blob([str]).size;
    if (bytes > 1024 * 1024) {
      return { size: Math.round(bytes / (1024 * 1024) * 10) / 10, unit: 'MB', isLarge: true };
    }
    if (bytes > 1024) {
      return { size: Math.round(bytes / 1024 * 10) / 10, unit: 'KB', isLarge: bytes > 50 * 1024 };
    }
    return { size: bytes, unit: 'B', isLarge: false };
  } catch {
    return { size: 0, unit: 'B', isLarge: false };
  }
};

// Count items in data
const getItemCount = (data: any): string => {
  if (Array.isArray(data)) {
    return `${data.length} items`;
  }
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    return `${keys.length} keys`;
  }
  return '';
};

// Full-screen JSON Viewer with search and controls
interface FullJsonViewerProps {
  data: any;
  title?: string;
  onClose?: () => void;
  maxHeight?: string;
}

export const FullJsonViewer: React.FC<FullJsonViewerProps> = React.memo(({ 
  data, 
  title, 
  onClose,
  maxHeight = '300px' 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const dataSize = useMemo(() => getDataSize(data), [data]);
  const itemCount = useMemo(() => getItemCount(data), [data]);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [data]);

  return (
    <div className="bg-zinc-900/95 rounded-lg border border-zinc-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300">{title || 'JSON Data'}</span>
          {itemCount && (
            <span className="text-[10px] text-zinc-500 font-mono">({itemCount})</span>
          )}
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            dataSize.isLarge ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/50 text-zinc-500'
          }`}>
            {dataSize.size} {dataSize.unit}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title={isExpanded ? 'Collapse all' : 'Expand all'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>
          <button
            onClick={handleCopyAll}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Copy all"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>
        </div>
      </div>
      
      {/* Content - Dynamic height based on prop */}
      <div 
        className="p-3 overflow-auto scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600"
        style={{ maxHeight }}
      >
        <JsonViewer 
          data={data} 
          maxInitialDepth={isExpanded ? 10 : 2}
          collapsed={!isExpanded}
        />
      </div>
    </div>
  );
});
FullJsonViewer.displayName = 'FullJsonViewer';

export default JsonViewer;
