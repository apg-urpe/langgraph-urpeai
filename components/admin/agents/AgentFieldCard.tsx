'use client';

import React from 'react';
import { Pencil, Eye, Lock, Image as ImageIcon } from 'lucide-react';
import { AgentFieldConfig } from '../../../types/agent';

interface AgentFieldCardProps {
  field: AgentFieldConfig;
  value: any;
  canEdit: boolean;
  onEdit: () => void;
  onChange: (value: any) => void;
}

export const AgentFieldCard: React.FC<AgentFieldCardProps> = ({
  field,
  value,
  canEdit,
  onEdit,
  onChange
}) => {
  const isTextArea = field.type === 'textarea';
  const isSelect = field.type === 'select';
  const isJson = field.type === 'json';
  const isImage = field.type === 'image';
  const isRestricted = field.minRoleId === 1;
  
  // Format value for display
  const getDisplayValue = (): string => {
    if (value === null || value === undefined || value === '') {
      return 'Sin configurar';
    }
    
    if (isJson) {
      try {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      } catch {
        return 'JSON inválido';
      }
    }
    
    if (isSelect && field.options) {
      const option = field.options.find(o => o.value === value);
      return option?.label || value;
    }
    
    return String(value);
  };
  
  // Get preview (first 150 chars for textareas)
  const getPreview = (): string => {
    const display = getDisplayValue();
    if (display === 'Sin configurar') return display;
    
    if (isTextArea || isJson) {
      const cleaned = display.replace(/\n/g, ' ').trim();
      return cleaned.length > 150 ? cleaned.slice(0, 150) + '...' : cleaned;
    }
    
    return display;
  };
  
  const isEmpty = value === null || value === undefined || value === '';
  const preview = getPreview();
  
  // Simple inputs for non-textarea fields
  if (!isTextArea && !isJson) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
            {field.label}
            {isRestricted && <Lock className="w-3 h-3 text-amber-500" />}
          </label>
        </div>
        
        {isImage ? (
          <div className="flex items-center gap-3">
            {value ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img 
                src={value} 
                alt="Preview" 
                className="w-12 h-12 rounded-lg object-cover border border-white/10"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-zinc-800/50 border border-white/10 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-zinc-600" />
              </div>
            )}
            <input
              type="text"
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              disabled={!canEdit}
              placeholder={field.placeholder || 'URL de imagen'}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none disabled:opacity-60"
            />
          </div>
        ) : isSelect ? (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={!canEdit}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-violet-500/50 outline-none disabled:opacity-60"
          >
            <option value="">Seleccionar...</option>
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={!canEdit}
            placeholder={field.placeholder}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none disabled:opacity-60"
          />
        )}
        
        {field.description && (
          <p className="text-[10px] text-zinc-600">{field.description}</p>
        )}
      </div>
    );
  }
  
  // Card style for textarea and JSON fields
  return (
    <button
      onClick={onEdit}
      className={`
        w-full text-left p-3 rounded-xl border transition-all group
        ${isEmpty 
          ? 'bg-zinc-900/30 border-dashed border-white/5 hover:border-white/10' 
          : 'bg-black/30 border-white/5 hover:border-violet-500/30 hover:bg-black/40'
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
              {field.label}
            </span>
            {isRestricted && <Lock className="w-3 h-3 text-amber-500" />}
          </div>
          
          <p className={`text-xs ${isEmpty ? 'text-zinc-600 italic' : 'text-zinc-400'} line-clamp-2`}>
            {preview}
          </p>
          
          {field.description && !isEmpty && (
            <p className="text-[10px] text-zinc-600 mt-1">{field.description}</p>
          )}
        </div>
        
        <div className={`
          p-2 rounded-lg transition-colors shrink-0
          ${canEdit 
            ? 'bg-zinc-800/50 text-zinc-500 group-hover:bg-violet-500/20 group-hover:text-violet-400' 
            : 'bg-zinc-800/30 text-zinc-600'
          }
        `}>
          {canEdit ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </div>
      </div>
    </button>
  );
};
