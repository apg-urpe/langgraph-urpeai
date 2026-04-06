'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Target, 
  Users, 
  Filter,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  Check
} from 'lucide-react';
import { useEmailMarketingStore, CreateAudiencePayload, AudienceFilters } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { FilterBuilder } from './FilterBuilder';
import { ContactSelector } from './ContactSelector';

interface CreateAudienceModalProps {
  onClose: () => void;
}

type Step = 'name' | 'type' | 'filters' | 'contacts';

export const CreateAudienceModal: React.FC<CreateAudienceModalProps> = ({ onClose }) => {
  const [step, setStep] = useState<Step>('name');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form data
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<'estatica' | 'dinamica' | null>(null);
  const [filters, setFilters] = useState<AudienceFilters>({ logic: 'AND', conditions: [] });
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);

  const createAudience = useEmailMarketingStore(state => state.createAudience);
  const previewCount = useEmailMarketingStore(state => state.previewCount);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  const canProceedFromName = nombre.trim().length > 0;
  const canProceedFromType = tipo !== null;
  const canCreate = tipo === 'dinamica' 
    ? filters.conditions.length > 0 
    : selectedContactIds.length > 0 || true; // Allow empty static for now

  const handleNext = () => {
    if (step === 'name' && canProceedFromName) {
      setStep('type');
    } else if (step === 'type' && canProceedFromType) {
      setStep(tipo === 'dinamica' ? 'filters' : 'contacts');
    }
  };

  const handleBack = () => {
    if (step === 'type') setStep('name');
    else if (step === 'filters' || step === 'contacts') setStep('type');
  };

  const handleCreate = async () => {
    if (!selectedEnterpriseId || !tipo) return;

    setIsSubmitting(true);

    try {
      const payload: CreateAudiencePayload = {
        empresa_id: selectedEnterpriseId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        tipo,
        filtros_json: tipo === 'dinamica' ? filters : undefined,
        contacto_ids: tipo === 'estatica' ? selectedContactIds : undefined
      };

      const result = await createAudience(payload);
      if (result) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = tipo === 'dinamica' 
      ? ['Nombre', 'Tipo', 'Filtros']
      : ['Nombre', 'Tipo', 'Contactos'];
    
    const currentIndex = step === 'name' ? 0 : step === 'type' ? 1 : 2;

    return (
      <div className="flex items-center gap-2 mb-6">
        {steps.map((label, index) => (
          <React.Fragment key={label}>
            <div className={`
              flex items-center gap-2
              ${index <= currentIndex ? 'text-violet-400' : 'text-zinc-600'}
            `}>
              <div className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${index < currentIndex 
                  ? 'bg-violet-500 text-white' 
                  : index === currentIndex 
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50'
                    : 'bg-zinc-800 text-zinc-600'
                }
              `}>
                {index < currentIndex ? <Check className="w-3.5 h-3.5" /> : index + 1}
              </div>
              <span className="text-sm hidden sm:inline">{label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-px ${index < currentIndex ? 'bg-violet-500' : 'bg-zinc-800'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    switch (step) {
      case 'name':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                ¿Cómo quieres llamar a esta audiencia?
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Leads de Enero 2025"
                autoFocus
                className="w-full px-4 py-3 text-base bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Descripción breve (opcional)
              </label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe el propósito de esta audiencia..."
                rows={2}
                className="w-full px-4 py-3 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500 resize-none
                           focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
        );

      case 'type':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 mb-4">
              ¿Cómo quieres construir <span className="text-zinc-200">&quot;{nombre}&quot;</span>?
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Dynamic Option */}
              <button
                onClick={() => setTipo('dinamica')}
                className={`
                  relative p-5 rounded-xl border-2 text-left transition-all
                  ${tipo === 'dinamica' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-white/10 hover:border-white/20 bg-zinc-900/50'
                  }
                `}
              >
                {tipo === 'dinamica' && (
                  <div className="absolute top-3 right-3">
                    <Check className="w-5 h-5 text-cyan-400" />
                  </div>
                )}
                <div className="p-3 bg-cyan-500/10 rounded-lg w-fit mb-3">
                  <Filter className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="font-semibold text-zinc-100 mb-1">Dinámica</h3>
                <p className="text-sm text-zinc-500">
                  Se actualiza automáticamente según tus filtros
                </p>
                <p className="text-xs text-cyan-400 mt-2">
                  &quot;Todos los leads calificados&quot;
                </p>
              </button>

              {/* Static Option */}
              <button
                onClick={() => setTipo('estatica')}
                className={`
                  relative p-5 rounded-xl border-2 text-left transition-all
                  ${tipo === 'estatica' 
                    ? 'border-amber-500 bg-amber-500/10' 
                    : 'border-white/10 hover:border-white/20 bg-zinc-900/50'
                  }
                `}
              >
                {tipo === 'estatica' && (
                  <div className="absolute top-3 right-3">
                    <Check className="w-5 h-5 text-amber-400" />
                  </div>
                )}
                <div className="p-3 bg-amber-500/10 rounded-lg w-fit mb-3">
                  <Users className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="font-semibold text-zinc-100 mb-1">Estática</h3>
                <p className="text-sm text-zinc-500">
                  Lista fija de contactos seleccionados
                </p>
                <p className="text-xs text-amber-400 mt-2">
                  &quot;Estos 50 contactos específicos&quot;
                </p>
              </button>
            </div>
          </div>
        );

      case 'filters':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Define quién entra en esta audiencia:
            </p>
            
            <FilterBuilder
              filters={filters}
              onChange={setFilters}
              previewCount={previewCount}
            />
          </div>
        );

      case 'contacts':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Selecciona los contactos para esta audiencia:
            </p>
            
            <ContactSelector
              selectedIds={selectedContactIds}
              onChange={setSelectedContactIds}
            />
          </div>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <Target className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="font-semibold text-zinc-100">
              Nueva Audiencia
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {renderStepIndicator()}
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/5">
          <div>
            {step !== 'name' && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Atrás
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            
            {(step === 'filters' || step === 'contacts') ? (
              <button
                onClick={handleCreate}
                disabled={isSubmitting || !canCreate}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                           bg-violet-500 text-white hover:bg-violet-600
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Crear Audiencia
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={step === 'name' ? !canProceedFromName : !canProceedFromType}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg
                           bg-violet-500 text-white hover:bg-violet-600
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CreateAudienceModal;
