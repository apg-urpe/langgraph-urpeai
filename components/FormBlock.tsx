'use client';


import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, CheckCircle2, CircuitBoard, ChevronDown, Check, Sparkles, BoxSelect } from 'lucide-react';
import * as Icons from 'lucide-react';
import { FormField } from '../types/chat';
import { BlockActions } from './BlockActions';

// Type for options that can be string or {label, value} object
type OptionItem = string | { label: string; value: string | number };

interface FormBlockProps {
  title: string;
  fields: FormField[];
  submitLabel?: string;
  submit?: {
    label?: string;
    icon?: string;
  };
  formId?: string;
  onSubmit: (data: any) => void;
  disabled?: boolean;
  actions?: Array<{
    id: string;
    label: string;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    payload?: any;
  }>;
}

// Normalize options to consistent format
function normalizeOptions(options: OptionItem[] | undefined): { label: string; value: string }[] {
  if (!options || !Array.isArray(options)) return [];
  
  return options.map((opt) => {
    if (typeof opt === 'string') {
      return { label: opt, value: opt };
    }
    if (opt && typeof opt === 'object') {
      // Handle {label, value} objects
      const label = String(opt.label ?? opt.value ?? '');
      const value = String(opt.value ?? opt.label ?? '');
      return { label, value };
    }
    // Fallback for any other type
    return { label: String(opt), value: String(opt) };
  });
}

const CustomSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder,
  label,
  helpText
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: OptionItem[]; 
  placeholder?: string;
  label: string;
  helpText?: string;
}) => {
  // Normalize options to handle both string[] and {label, value}[]
  const normalizedOptions = normalizeOptions(options);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 288
  });

  const updateDropdownPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const preferredHeight = 288;
    const minHeight = 160;
    const gutter = 12;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let maxHeight = Math.min(preferredHeight, viewportHeight - rect.bottom - gutter - 8);
    let top = rect.bottom + 8;

    if ((maxHeight < minHeight && spaceAbove > spaceBelow) || (spaceBelow < gutter && spaceAbove > 0)) {
      maxHeight = Math.min(preferredHeight, rect.top - gutter - 8);
      top = rect.top - Math.max(minHeight, maxHeight) - 8;
    }

    const clampedMaxHeight = Math.max(minHeight, Math.min(preferredHeight, maxHeight));
    const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, viewportWidth - rect.width - gutter));

    setDropdownPosition({
      top: Math.max(gutter, top),
      left,
      width: rect.width,
      maxHeight: clampedMaxHeight
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();

    const handleWindowChange = () => updateDropdownPosition();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <div className="flex items-center justify-between px-1">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          {label}
        </label>
        {helpText && (
          <span className="text-[10px] text-zinc-500 font-medium italic opacity-80">
            {helpText}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left px-5 py-4 rounded-xl border flex items-center justify-between transition-all duration-300 outline-none min-h-[56px] ${
          isOpen 
            ? 'bg-zinc-900 border-primary-500 shadow-[0_0_20px_rgba(34,211,238,0.2)] ring-1 ring-primary-500/30 text-zinc-100' 
            : 'bg-zinc-950/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-900 hover:border-zinc-500 hover:text-zinc-100'
        }`}
      >
        <div className="flex items-center gap-3 w-full overflow-hidden">
            {value ? (
               <span className="text-sm font-medium text-zinc-100 truncate">
                 {normalizedOptions.find(o => o.value === value)?.label || value}
               </span>
            ) : (
               <span className="text-sm text-zinc-500 italic truncate">{placeholder || 'Select an option...'}</span>
            )}
        </div>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary-400' : ''}`} />
      </button>

      {isOpen && createPortal(
        <>
          {/* Backdrop to intercept clicks and keep dropdown above other controls */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 2147483646 }}
            onMouseDown={() => setIsOpen(false)}
          />
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              zIndex: 2147483647
            }}
            className="pointer-events-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.7)] overflow-hidden animate-pop-in ring-1 ring-white/10"
          >
            <div
              className="overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent"
              style={{ maxHeight: dropdownPosition.maxHeight }}
            >
               <div className="px-4 py-3 text-[10px] font-bold text-zinc-500 border-b border-zinc-800 bg-zinc-950/50 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                   {placeholder || "Available Options"}
               </div>
              {normalizedOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-5 py-3.5 text-sm transition-all duration-200 flex items-center justify-between group border-l-[3px] ${
                    value === opt.value 
                      ? 'bg-primary-500/10 text-primary-400 border-primary-500 font-semibold' 
                      : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100 border-transparent hover-border-zinc-500'
                  }`}
                >
                  <span className="truncate pr-2">{opt.label}</span>
                  {value === opt.value && <Check className="w-4 h-4 text-primary-400" />}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export const FormBlock: React.FC<FormBlockProps> = ({ 
  title, 
  fields, 
  submitLabel = "Submit Data", 
  formId,
  onSubmit,
  disabled = false,
  actions
}) => {
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    if (Array.isArray(fields)) {
      fields.forEach(f => {
        const key = f.name || f.id;
        if (key && f.defaultValue) initial[key] = f.defaultValue;
      });
    }
    return initial;
  });

  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAction = (actionData: any) => {
    if (disabled) return;
    
    const payload = {
      type: 'FORM_SUBMISSION',
      formId: formId || title,
      actionId: actionData.action?.id || 'submit',
      timestamp: new Date().toISOString(),
      values: formData,
      action: actionData.action
    };
    
    onSubmit(payload);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsSubmitted(true);
    
    const payload = {
      type: 'FORM_SUBMISSION',
      formId: formId || title,
      timestamp: new Date().toISOString(),
      values: formData
    };
    
    onSubmit(payload);
  };

  if (isSubmitted) {
    return (
      <div className="bg-zinc-950/60 border border-emerald-500/30 rounded-2xl p-10 flex flex-col items-center justify-center text-center animate-pop-in shadow-[0_0_40px_rgba(16,185,129,0.1)] backdrop-blur-xl w-full mx-auto">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 relative group">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          <CheckCircle2 className="w-10 h-10 text-emerald-400 relative z-10" />
        </div>
        <h3 className="text-zinc-100 font-bold text-xl tracking-tight mb-2">Data Transmitted</h3>
        <p className="text-zinc-500 text-sm max-w-sm leading-relaxed mb-8">The system has successfully verified and encrypted your input for processing.</p>
        
        <div className="p-4 bg-zinc-900/80 rounded-xl border border-zinc-800 w-full max-w-sm shadow-inner">
           <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-3 border-b border-zinc-800 pb-2">
             <CircuitBoard className="w-3.5 h-3.5" />
             <span>Secure Payload Payload</span>
           </div>
           <div className="text-left space-y-2">
             {Object.entries(formData).slice(0, 4).map(([key, val]) => (
               <div key={key} className="flex items-center justify-between text-xs group">
                 <span className="text-zinc-500 capitalize font-medium group-hover:text-zinc-400 transition-colors">{key}</span>
                 <span className="text-primary-400/80 font-mono truncate max-w-[180px] bg-primary-500/5 px-1.5 py-0.5 rounded">{String(val)}</span>
               </div>
             ))}
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-3xl w-full backdrop-blur-2xl relative group shadow-2xl transition-all hover:border-white/20 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      
      {/* Decorative Gradient Line */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary-500/0 via-primary-500/50 to-primary-500/0 opacity-50"></div>

      {/* Header */}
      <div className="bg-zinc-900/30 border-b border-white/5 px-6 md:px-8 py-5 flex items-center justify-between relative overflow-hidden rounded-t-3xl">
        {/* Subtle noise texture header */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05]"></div>
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 border border-white/10 text-primary-400 shadow-lg">
             <BoxSelect className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-primary-500/80 uppercase tracking-widest leading-none mb-1">Input Required</span>
            <span className="block text-lg font-bold text-zinc-100 tracking-tight">{title}</span>
          </div>
        </div>
        <div className="relative">
           <div className="h-2 w-2 rounded-full bg-primary-500 shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse"></div>
           <div className="absolute inset-0 h-2 w-2 rounded-full bg-primary-500 animate-ping opacity-50"></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {(fields || []).map((field, idx) => {
          const fieldKey = field.name || field.id || `field_${idx}`;
          // Intelligent Layout Logic
          const isLastItem = idx === fields.length - 1;
          const isOddTotal = fields.length % 2 !== 0;
          const colSpanClass = (isLastItem && isOddTotal) ? "md:col-span-2" : "md:col-span-1";

          return (
            <div key={field.name || idx} className={colSpanClass}>
              {field.type === 'select' ? (
                <CustomSelect
                  label={`${field.label}${field.required ? '*' : ''}`}
                  value={formData[fieldKey] || ''}
                  options={field.options || []}
                  placeholder={field.placeholder}
                  helpText={field.helpText}
                  onChange={(val) => handleChange(fieldKey, val)}
                />
              ) : (
                <div className="space-y-1.5 group/input">
                  <div className="flex items-center justify-between px-1">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest transition-colors group-focus-within/input:text-primary-400">
                      {field.label} {field.required && <span className="text-primary-500">*</span>}
                    </label>
                    {field.helpText && (
                      <span className="text-[10px] text-zinc-500 font-medium italic opacity-80">
                        {field.helpText}
                      </span>
                    )}
                  </div>
                  <input
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formData[fieldKey] || ''}
                    onChange={(e) => handleChange(fieldKey, e.target.value)}
                    className="w-full bg-zinc-950/50 border border-zinc-700/50 rounded-xl px-5 py-4 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:shadow-[0_0_20px_rgba(34,211,238,0.1)] transition-all min-h-[56px]"
                  />
                </div>
              )}
            </div>
          );
        })}
        </div>

        <div className="pt-8 mt-4 border-t border-white/5">
          {actions && actions.length > 0 ? (
            <BlockActions
              actions={actions}
              onInteract={handleAction}
              disabled={disabled}
            />
          ) : (
            <button
              type="submit"
              disabled={disabled}
              className={`w-full relative group overflow-hidden rounded-xl p-[2px] focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:ring-offset-zinc-950 transition-transform ${
                disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'active:scale-[0.99]'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600 via-cyan-400 to-primary-600 opacity-80 group-hover:opacity-100 transition-opacity animate-shimmer bg-[length:200%_100%]"></div>
              <div className="relative bg-zinc-950 hover:bg-zinc-900 transition-colors rounded-[10px] px-6 py-4 flex items-center justify-center gap-3">
                <span className="text-sm font-bold text-white tracking-widest uppercase">{submitLabel}</span>
                <div className="bg-primary-500/20 p-1 rounded-full group-hover:bg-primary-500/30 transition-colors">
                   <Send className="w-4 h-4 text-primary-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            </button>
          )}
          
          <div className="mt-4 flex items-center justify-center gap-2 opacity-50 hover:opacity-80 transition-opacity">
             <Sparkles className="w-3.5 h-3.5 text-primary-500" />
             <span className="text-[10px] text-zinc-400 font-medium tracking-wide">End-to-End Encrypted Transmission</span>
          </div>
        </div>
      </form>
    </div>
  );
};

