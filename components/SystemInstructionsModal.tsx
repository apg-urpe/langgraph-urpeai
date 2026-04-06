'use client';


import React, { useState, useEffect } from 'react';
import { X, Save, ShieldCheck } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';

interface SystemInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInstructions: string;
  onSave: (instructions: string) => void;
}

export const SystemInstructionsModal: React.FC<SystemInstructionsModalProps> = ({
  isOpen,
  onClose,
  currentInstructions,
  onSave
}) => {
  const [text, setText] = useState(currentInstructions || '');
  
  // Localization
  const { language } = useLanguageStore();
  const t = translations[language].modal;

  useEffect(() => {
    setText(currentInstructions || '');
  }, [currentInstructions, isOpen]);

  if (!isOpen) return null;

  const MAX_CHARS = 500;

  const handleSave = () => {
    // Sanitization Logic
    let safeText = text.trim();
    
    // 1. Length Check
    if (safeText.length > MAX_CHARS) {
        safeText = safeText.substring(0, MAX_CHARS);
    }

    // 2. Anti-Injection (HTML Escaping)
    safeText = safeText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // 3. Script Block (Redundant due to escaping but good for explicit removal logic if needed)
    // The escaping turns <script> into &lt;script&gt; which renders harmlessly.

    onSave(safeText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-zinc-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-pop-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
             <div className="p-1 rounded bg-primary-500/10 border border-primary-500/20">
                 <ShieldCheck className="w-4 h-4 text-primary-400" />
             </div>
             <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">{t.title}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
           <p className="text-xs text-zinc-400 leading-relaxed">
             {t.description}
           </p>

           <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_CHARS}
                placeholder={t.placeholder}
                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 resize-none font-mono scrollbar-thin scrollbar-thumb-zinc-700"
              />
              <div className={`absolute bottom-3 right-3 text-[10px] font-mono transition-colors ${text.length >= MAX_CHARS ? 'text-rose-400' : 'text-zinc-600'}`}>
                 {text.length}/{MAX_CHARS}
              </div>
           </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-2">
           <button 
             onClick={onClose}
             className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
           >
             {t.cancel}
           </button>
           <button 
             onClick={handleSave}
             className="px-4 py-2 rounded-lg text-xs font-bold bg-primary-600 hover:bg-primary-500 text-zinc-950 transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]"
           >
             <Save className="w-3.5 h-3.5" />
             {t.save}
           </button>
        </div>
      </div>
    </div>
  );
};

