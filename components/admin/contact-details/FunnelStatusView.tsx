import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GitMerge, ArrowRight, AlertCircle, ChevronDown, Check, Info } from 'lucide-react';
import { FunnelStatus, FunnelStage, FunnelStageDescripcion } from '../../../types/contact';
import { useContactStore, selectFunnelStages, selectIsObservationMode } from '../../../store/contactStore';

interface FunnelStatusViewProps {
  status: FunnelStatus | null;
  contactId?: number;
}

// Renders emoji as plain text inside a span with translate="no" to prevent
// browser extensions (translators, spell-checkers) from mutating the text node,
// which causes React's removeChild/insertBefore DOM reconciliation errors.
const SafeEmoji = ({ emoji, className }: { emoji: string; className?: string }) => (
  <span className={className} translate="no" aria-hidden="true">{emoji}</span>
);

// Safe parser for descripcion field (could be string, object, or null from DB)
const safeGetDescripcion = (desc: unknown): FunnelStageDescripcion | null => {
  if (!desc) return null;
  if (typeof desc === 'object' && !Array.isArray(desc)) return desc as FunnelStageDescripcion;
  if (typeof desc === 'string') {
    try { 
      const parsed = JSON.parse(desc);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch { return null; }
  }
  return null;
};

export const FunnelStatusView: React.FC<FunnelStatusViewProps> = ({ status, contactId }) => {
  const funnelStages = useContactStore(selectFunnelStages);
  const isObservationMode = useContactStore(selectIsObservationMode);
  const updateContactStage = useContactStore(state => state.updateContactStage);
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showInfo, setShowInfo] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getStageColor = (stage?: FunnelStage | null): string => {
    if (!stage) return '#6366f1';
    const desc = safeGetDescripcion(stage.descripcion);
    return desc?.color || '#6366f1';
  };

  const getStageIcon = (stage?: FunnelStage | null): string => {
    if (!stage) return '📌';
    const desc = safeGetDescripcion(stage.descripcion);
    return desc?.icono || '📌';
  };

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 208; // w-52 = 13rem = 208px
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Align dropdown to the left edge of the button, then adjust if needed
      let left = rect.left;
      
      // If it would go off-screen right, align to right edge instead
      if (left + dropdownWidth > viewportWidth - 8) {
        left = rect.right - dropdownWidth;
      }
      
      // Final bounds check
      if (left < 8) left = 8;
      
      // Check if dropdown fits below, otherwise show above
      const dropdownHeight = 224; // max-h-56 = 14rem = 224px
      let top = rect.bottom + 8;
      if (top + dropdownHeight > viewportHeight - 8) {
        top = rect.top - dropdownHeight - 8;
      }
      
      setDropdownPosition({ top, left });
    }
  }, [isDropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleStageChange = async (newStageId: number) => {
    if (!contactId || isUpdating) return;
    if (newStageId === status?.etapa_actual) {
      setIsDropdownOpen(false);
      return;
    }
    
    setIsUpdating(true);
    try {
      await updateContactStage(contactId, newStageId);
    } finally {
      setIsUpdating(false);
      setIsDropdownOpen(false);
    }
  };

  const getStage = (stageId?: number | null) => {
    if (!stageId) return null;
    return funnelStages.find(s => s.id === stageId);
  };

  // Handler for initial stage assignment (when status is null)
  const handleInitialStageAssignment = async (stageId: number) => {
    if (!contactId || isUpdating) return;
    
    setIsUpdating(true);
    try {
      await updateContactStage(contactId, stageId);
    } finally {
      setIsUpdating(false);
      setIsDropdownOpen(false);
    }
  };

  // When no funnel status exists, show selector to assign initial stage
  if (!status) {
    return (
      <div className="bg-zinc-900/40 border border-white/5 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <GitMerge className="w-3 h-3 text-primary-400" />
            Embudo
          </h3>
        </div>
        
        <div className="flex flex-col items-center justify-center py-3 text-zinc-500 rounded-lg border border-white/5 border-dashed">
          <span className="text-[10px] mb-2">Sin etapa</span>
          
          {contactId && funnelStages.length > 0 && (
            <button
              ref={buttonRef}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isUpdating}
              className={`flex items-center gap-1.5 px-2 py-1 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/30 rounded text-[10px] font-medium text-primary-400 transition-all ${
                isUpdating ? 'opacity-50 cursor-wait' : 'cursor-pointer'
              }`}
            >
              {isUpdating ? (
                <div className="w-2.5 h-2.5 border border-primary-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <GitMerge className="w-2.5 h-2.5" />
              )}
              Asignar
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          
          {funnelStages.length === 0 && (
            <span className="text-[9px] text-zinc-600">Sin etapas</span>
          )}
          
        </div>
        
        {/* Dropdown for initial assignment */}
        {isDropdownOpen && createPortal(
          <div 
            ref={dropdownRef}
            className="fixed w-52 bg-[#0a0a0c] border border-white/10 rounded-lg shadow-xl z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          >
            <div className="px-2.5 py-1.5 border-b border-white/5 bg-white/5">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Seleccionar Etapa</span>
            </div>
            <div className="max-h-56 overflow-y-auto py-0.5 custom-scrollbar">
              {funnelStages.map(stage => {
                const stageColor = getStageColor(stage);
                return (
                  <button
                    key={stage.id}
                    onClick={() => handleInitialStageAssignment(stage.id)}
                    className="w-full px-2.5 py-2 text-left flex items-center gap-2 transition-all hover:bg-white/5"
                  >
                    <SafeEmoji emoji={getStageIcon(stage)} className="text-sm" />
                    <span className="text-[10px] font-medium truncate text-zinc-400 flex-1">
                      {stage.nombre_etapa}
                    </span>
                    <span className="text-[9px] text-zinc-600">#{stage.orden_etapa}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  const prevStage = getStage(status.etapa_anterior);
  const currentStage = getStage(status.etapa_actual);

  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-lg p-3">
      {/* Header compacto */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
          <GitMerge className="w-3 h-3 text-primary-400" />
          Embudo
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600">
            {status.fecha_ultimo_cambio ? new Date(status.fecha_ultimo_cambio).toLocaleDateString() : '-'}
          </span>
          {currentStage && (
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`p-0.5 rounded transition-all ${showInfo ? 'text-primary-400' : 'text-zinc-600 hover:text-zinc-400'}`}
              title="Info"
            >
              <Info className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Stage Flow - Compacto horizontal */}
      <div className="flex items-center gap-2 py-1 overflow-hidden">
        {/* Previous Stage - Mini */}
        {prevStage && (
          <>
            <div className="flex items-center gap-1.5 text-zinc-500">
              <SafeEmoji emoji={getStageIcon(prevStage)} className="text-sm opacity-50" />
              <span className="text-[10px] truncate max-w-[60px]">{prevStage.nombre_etapa}</span>
            </div>
            <ArrowRight className="w-3 h-3 text-zinc-700 shrink-0" />
          </>
        )}

        {/* Current Stage - Clickable */}
        <button
          ref={buttonRef}
          onClick={() => contactId && setIsDropdownOpen(!isDropdownOpen)}
          disabled={!contactId || isUpdating}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all min-w-0 max-w-full overflow-hidden ${
            contactId ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
          } ${isUpdating ? 'opacity-50' : ''}`}
          style={{ 
            backgroundColor: currentStage ? `${getStageColor(currentStage)}10` : 'transparent',
            borderColor: currentStage ? `${getStageColor(currentStage)}30` : 'rgba(255,255,255,0.1)'
          }}
        >
          {isUpdating ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: getStageColor(currentStage) }} />
          ) : (
            <>
              <SafeEmoji emoji={currentStage ? getStageIcon(currentStage) : '?'} className="text-base" />
              <span 
                className="text-[11px] font-medium truncate max-w-[100px] min-w-0"
                style={{ color: getStageColor(currentStage) }}
              >
                {currentStage ? currentStage.nombre_etapa : `ID: ${status.etapa_actual}`}
              </span>
              <span 
                className="text-[9px] font-bold px-1 py-0.5 rounded"
                style={{ 
                  backgroundColor: `${getStageColor(currentStage)}20`,
                  color: getStageColor(currentStage)
                }}
              >
                #{currentStage?.orden_etapa || '?'}
              </span>
            </>
          )}
          {contactId && !isUpdating && (
            <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          )}
        </button>
      </div>

      {/* Stage Info Panel - Colapsable */}
      {showInfo && currentStage && (() => {
        const desc = safeGetDescripcion(currentStage.descripcion);
        return (
          <div className="mt-2 pt-2 border-t border-white/5 animate-in fade-in duration-150">
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              {desc?.que_es || 'Sin descripción.'}
            </p>
            {desc?.nota_importante && (
              <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-amber-400/80">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{desc.nota_importante}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Dropdown de etapas - Portal to body for correct positioning */}
      {isDropdownOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-64 bg-[#0a0a0c] border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
        >
          <div className="px-3 py-2 border-b border-white/5 bg-white/5">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cambiar Etapa</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1 custom-scrollbar">
            {funnelStages.map(stage => {
              const stageColor = getStageColor(stage);
              const isSelected = stage.id === status.etapa_actual;
              return (
                <button
                  key={stage.id}
                  onClick={() => handleStageChange(stage.id)}
                  className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-all ${
                    isSelected
                      ? 'bg-white/5'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div 
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-all ${
                      isSelected ? 'scale-110' : 'opacity-70'
                    }`}
                    style={{ 
                      backgroundColor: isSelected ? `${stageColor}20` : 'rgba(255,255,255,0.05)',
                      borderColor: isSelected ? `${stageColor}40` : 'transparent',
                      color: isSelected ? stageColor : '#71717a'
                    }}
                  >
                    <SafeEmoji emoji={getStageIcon(stage)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold truncate ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`}>
                        {stage.nombre_etapa}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-bold">#{stage.orden_etapa}</span>
                    </div>
                    {isSelected && (
                      <p className="text-[9px] text-primary-400 font-medium">Etapa Actual</p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-primary-500/20 flex items-center justify-center border border-primary-500/30">
                      <Check className="w-3 h-3 text-primary-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
      
      {/* Notes */}
      {status.notas && (
        <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-zinc-500 italic">
          &quot;{status.notas}&quot;
        </div>
      )}
    </div>
  );
};
