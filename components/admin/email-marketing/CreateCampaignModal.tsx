'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Mail, 
  Target,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  AlertCircle,
  Maximize2
} from 'lucide-react';
import { useEmailMarketingStore, CreateCampaignPayload, selectAudiences } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { FullscreenTextEditor } from '../settings/FullscreenTextEditor';

interface CreateCampaignModalProps {
  onClose: () => void;
}

type Step = 'name' | 'audience' | 'settings';

export const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({ onClose }) => {
  const [step, setStep] = useState<Step>('name');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  // Form state
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [audienciaId, setAudienciaId] = useState<number | null>(null);
  const [cadenciaDias, setCadenciaDias] = useState(7);
  const [totalToques, setTotalToques] = useState<number | null>(null);
  const [instruccionesAi, setInstruccionesAi] = useState('');
  const [showFullscreenEditor, setShowFullscreenEditor] = useState(false);
  
  const createCampaign = useEmailMarketingStore(state => state.createCampaign);
  const audiences = useEmailMarketingStore(selectAudiences);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  const handleCreate = async () => {
    if (!selectedEnterpriseId) {
      setCreateError('No hay empresa seleccionada');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    try {
      const payload: CreateCampaignPayload = {
        empresa_id: selectedEnterpriseId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        audiencia_id: audienciaId || undefined,
        cadencia_dias: cadenciaDias,
        total_toques: totalToques || undefined,
        instrucciones_ai: instruccionesAi.trim() || undefined
      };

      const result = await createCampaign(payload);
      if (result) {
        onClose();
      } else {
        const storeError = useEmailMarketingStore.getState().error;
        setCreateError(storeError || 'No se pudo crear la campaña. Verifica permisos o intenta de nuevo.');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Error inesperado al crear campaña');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'name': return nombre.trim().length >= 3;
      case 'audience': return true; // Audience is optional
      case 'settings': return true;
      default: return false;
    }
  };

  const goNext = () => {
    if (step === 'name') setStep('audience');
    else if (step === 'audience') setStep('settings');
    else if (step === 'settings') handleCreate();
  };

  const goBack = () => {
    if (step === 'audience') setStep('name');
    else if (step === 'settings') setStep('audience');
  };

  const renderStepIndicator = () => {
    const steps = ['Nombre', 'Audiencia', 'Configuración'];
    const currentIndex = step === 'name' ? 0 : step === 'audience' ? 1 : 2;

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
              <div className={`w-8 h-px ${index < currentIndex ? 'bg-violet-500' : 'bg-zinc-700'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 'name':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Nombre de la campaña
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Bienvenida nuevos clientes, Follow-up leads..."
                autoFocus
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Descripción (opcional)
              </label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe el objetivo de esta campaña..."
                rows={3}
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500 resize-none
                           focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
        );

      case 'audience':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Selecciona la audiencia que recibirá esta campaña:
            </p>
            
            {audiences.length === 0 ? (
              <div className="bg-zinc-800/50 border border-white/10 rounded-lg p-6 text-center">
                <Target className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-400 text-sm">No hay audiencias disponibles</p>
                <p className="text-zinc-500 text-xs mt-1">
                  Crea una audiencia primero para poder asignarla a esta campaña
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Option: No audience */}
                <button
                  onClick={() => setAudienciaId(null)}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors
                    ${!audienciaId 
                      ? 'bg-violet-500/10 border-violet-500/30' 
                      : 'bg-zinc-800/50 border-white/5 hover:border-white/10'
                    }
                  `}
                >
                  <div className={`
                    w-5 h-5 rounded-full border flex items-center justify-center
                    ${!audienciaId ? 'border-violet-500 bg-violet-500' : 'border-zinc-600'}
                  `}>
                    {!audienciaId && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Sin audiencia</p>
                    <p className="text-xs text-zinc-500">Asignar audiencia más tarde</p>
                  </div>
                </button>

                {audiences.map(audience => (
                  <button
                    key={audience.id}
                    onClick={() => setAudienciaId(audience.id)}
                    className={`
                      w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors
                      ${audienciaId === audience.id 
                        ? 'bg-violet-500/10 border-violet-500/30' 
                        : 'bg-zinc-800/50 border-white/5 hover:border-white/10'
                      }
                    `}
                  >
                    <div className={`
                      w-5 h-5 rounded-full border flex items-center justify-center
                      ${audienciaId === audience.id ? 'border-violet-500 bg-violet-500' : 'border-zinc-600'}
                    `}>
                      {audienciaId === audience.id && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{audience.nombre}</p>
                      <p className="text-xs text-zinc-500">
                        {audience.contact_count || 0} contactos • {audience.tipo}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Cadencia (días entre envíos)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={cadenciaDias}
                onChange={(e) => setCadenciaDias(parseInt(e.target.value) || 7)}
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 focus:outline-none focus:border-violet-500/50"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Tiempo mínimo entre cada toque de la campaña
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Total de toques (opcional)
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={totalToques || ''}
                onChange={(e) => setTotalToques(parseInt(e.target.value) || null)}
                placeholder="Ej: 5"
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500
                           focus:outline-none focus:border-violet-500/50"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Dejar vacío para continuar hasta que el contacto responda
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  Instrucciones para IA (opcional)
                </label>
                <button
                  type="button"
                  onClick={() => setShowFullscreenEditor(true)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 border border-transparent hover:border-violet-500/20 transition-all"
                  title="Editar en pantalla completa"
                >
                  <Maximize2 className="w-3 h-3" />
                  Expandir
                </button>
              </div>
              <textarea
                value={instruccionesAi}
                onChange={(e) => setInstruccionesAi(e.target.value)}
                placeholder="Ej: Mantén un tono profesional pero cercano. Enfócate en los beneficios del producto..."
                rows={3}
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500 resize-none
                           focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/10 rounded-lg">
                  <Mail className="w-5 h-5 text-violet-400" />
                </div>
                <h2 className="font-semibold text-zinc-100">
                  Nueva Campaña
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {renderStepIndicator()}
              {renderStepContent()}

              {createError && (
                <div className="mt-4 flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-300">{createError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-white/5">
              {step !== 'name' ? (
                <button
                  onClick={goBack}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Atrás
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={goNext}
                disabled={!canProceed() || isSubmitting}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg
                           bg-violet-500 text-white hover:bg-violet-600 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando...
                  </>
                ) : step === 'settings' ? (
                  <>
                    Crear Campaña
                    <Check className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Continuar
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fullscreen editor for AI instructions */}
      {showFullscreenEditor && createPortal(
        <FullscreenTextEditor
          label="Instrucciones para IA — Campaña"
          value={instruccionesAi}
          onChange={(v) => setInstruccionesAi(v)}
          onClose={() => setShowFullscreenEditor(false)}
          placeholder="Escribe las instrucciones detalladas para la IA...\n\nEj:\n- Tono profesional pero cercano\n- Enfócate en los beneficios del producto\n- Incluye un CTA claro en cada correo"
        />,
        document.body
      )}
    </>
  );
};

export default CreateCampaignModal;
