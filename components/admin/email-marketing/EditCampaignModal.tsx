'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Mail, 
  Target,
  Loader2,
  Save,
  Check,
  Sparkles,
  Play,
  Pause,
  Edit2
} from 'lucide-react';
import { useEmailMarketingStore, selectAudiences } from '../../../store/emailMarketingStore';
import { MarketingCampaignV2 } from '../../../types/marketing';

interface EditCampaignModalProps {
  campaign: MarketingCampaignV2;
  onClose: () => void;
}

export const EditCampaignModal: React.FC<EditCampaignModalProps> = ({ campaign, onClose }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'audience' | 'settings'>('info');
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [nombre, setNombre] = useState(campaign.nombre);
  const [descripcion, setDescripcion] = useState(campaign.descripcion || '');
  const [estado, setEstado] = useState(campaign.estado);
  const [audienciaId, setAudienciaId] = useState<number | null>(campaign.audiencia_id);
  const [cadenciaDias, setCadenciaDias] = useState(campaign.cadencia_dias);
  const [totalToques, setTotalToques] = useState<number | null>(campaign.total_toques);
  const [instruccionesAi, setInstruccionesAi] = useState(campaign.instrucciones_ai || '');
  
  const updateCampaign = useEmailMarketingStore(state => state.updateCampaign);
  const audiences = useEmailMarketingStore(selectAudiences);

  const handleSave = async () => {
    if (!nombre.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await updateCampaign(campaign.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        estado,
        audiencia_id: audienciaId ?? undefined,
        cadencia_dias: cadenciaDias,
        total_toques: totalToques ?? undefined,
        instrucciones_ai: instruccionesAi.trim() || undefined
      });
      
      if (result) {
        onClose();
      } else {
        setError('Error al actualizar la campaña. Verifica que tienes permisos para editar esta campaña.');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSave = nombre.trim().length >= 3;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
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
                placeholder="Ej: Bienvenida nuevos clientes..."
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
                rows={4}
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500 resize-y min-h-[80px] max-h-[200px]
                           focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Estado de la campaña */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Estado de la campaña
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'borrador', label: 'Borrador', icon: Edit2, color: 'zinc' },
                  { value: 'activa', label: 'Activa', icon: Play, color: 'emerald' },
                  { value: 'pausada', label: 'Pausada', icon: Pause, color: 'amber' }
                ].map(({ value, label, icon: Icon, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEstado(value as any)}
                    className={`
                      flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all
                      ${estado === value 
                        ? `bg-${color}-500/20 border-${color}-500/50 text-${color}-400` 
                        : 'bg-zinc-800/50 border-white/10 text-zinc-400 hover:border-white/20'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="p-3 bg-zinc-800/30 rounded-lg border border-white/5">
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-zinc-500">Creada:</span>
                <span className="text-zinc-400">
                  {new Date(campaign.created_at).toLocaleDateString('es-PE')}
                </span>
              </div>
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
                Tiempo mínimo entre cada toque
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
                Dejar vacío para continuar hasta respuesta
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                Instrucciones para IA
              </label>
              <textarea
                value={instruccionesAi}
                onChange={(e) => setInstruccionesAi(e.target.value)}
                placeholder="Ej: Mantén un tono profesional pero cercano. Enfócate en los beneficios del producto. Usa viñetas para listar características..."
                rows={6}
                className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                           text-zinc-100 placeholder-zinc-500 resize-y min-h-[120px] max-h-[300px]
                           focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <Mail className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="font-semibold text-zinc-100">
              Editar Campaña
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
          {(['info', 'audience', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab === 'info' ? 'Información' : tab === 'audience' ? 'Audiencia' : 'Configuración'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderTabContent()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 shrink-0 space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
              <span className="text-rose-400 text-sm">{error}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                       bg-violet-500 text-white hover:bg-violet-600 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar cambios
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditCampaignModal;
