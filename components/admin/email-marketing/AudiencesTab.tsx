'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Target, 
  Filter,
  Loader2,
  Clock,
  Trash2,
  Edit2,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Zap
} from 'lucide-react';
import { useEmailMarketingStore, selectAudiences, selectIsLoading } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { MarketingAudience } from '../../../types/marketing';
import { EditAudienceModal } from './EditAudienceModal';

interface AudiencesTabProps {
  onCreateNew: () => void;
}

interface ContactPreview {
  id: number;
  nombre: string;
  apellido: string;
}

export const AudiencesTab: React.FC<AudiencesTabProps> = ({ onCreateNew }) => {
  const [editingAudience, setEditingAudience] = useState<MarketingAudience | null>(null);
  const [contactPreviews, setContactPreviews] = useState<Record<number, ContactPreview[]>>({});
  
  const audiences = useEmailMarketingStore(selectAudiences);
  const isLoading = useEmailMarketingStore(selectIsLoading);
  const deleteAudience = useEmailMarketingStore(state => state.deleteAudience);
  const previewAudienceContacts = useEmailMarketingStore(state => state.previewAudienceContacts);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  // Load contact previews for dynamic audiences
  useEffect(() => {
    if (!selectedEnterpriseId) return;
    
    const loadPreviews = async () => {
      const dynamicAudiences = audiences.filter(a => 
        a.tipo === 'dinamica' && 
        a.filtros_json?.conditions?.length > 0 &&
        !contactPreviews[a.id]
      );
      
      for (const audience of dynamicAudiences) {
        const contacts = await previewAudienceContacts(
          selectedEnterpriseId, 
          audience.filtros_json as any, 
          3
        );
        setContactPreviews(prev => ({ ...prev, [audience.id]: contacts }));
      }
    };
    
    loadPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audiences, selectedEnterpriseId, previewAudienceContacts]); // contactPreviews excluded - used for comparison only

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const handleDelete = async (e: React.MouseEvent, audience: MarketingAudience) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar la audiencia "${audience.nombre}"? Las campañas vinculadas perderán su audiencia.`)) {
      await deleteAudience(audience.id);
    }
  };

  if (isLoading && audiences.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (audiences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] md:h-64 text-center px-4">
        <div className="p-4 bg-violet-500/10 rounded-full mb-4">
          <Users className="w-10 h-10 text-violet-400" />
        </div>
        <h3 className="text-lg font-medium text-zinc-200 mb-2">
          No hay audiencias
        </h3>
        <p className="text-zinc-500 text-sm mb-6 max-w-[280px] md:max-w-sm mx-auto">
          Crea tu primera audiencia para segmentar contactos y usarla en múltiples campañas
        </p>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 px-6 py-3 md:px-4 md:py-2 text-sm font-medium rounded-lg
                     bg-violet-500 text-white hover:bg-violet-600 transition-colors shadow-lg shadow-violet-500/20 active:scale-95"
        >
          <Target className="w-4 h-4" />
          Crear Audiencia
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-3">
      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4">
        <div className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-xl p-2 md:p-3">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1">
            <Target className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[10px] md:text-xs text-violet-300/70 truncate">Total</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-violet-300 leading-none">{audiences.length}</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-xl p-2 md:p-3">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] md:text-xs text-cyan-300/70 truncate">Dinam.</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-cyan-300 leading-none">{audiences.filter(a => a.tipo === 'dinamica').length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-xl p-2 md:p-3">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] md:text-xs text-amber-300/70 truncate">Contac.</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-amber-300 leading-none">
            {audiences.reduce((sum, a) => sum + (a.contact_count || 0), 0)}
          </p>
        </div>
      </div>

      {audiences.map((audience, index) => (
        <div
          key={audience.id}
          onClick={() => setEditingAudience(audience)}
          style={{ animationDelay: `${index * 50}ms` }}
          className="group bg-zinc-900/50 border border-white/5 rounded-xl p-3 md:p-4
                     hover:border-violet-500/30 hover:bg-zinc-800/50 
                     transition-all duration-300 cursor-pointer
                     hover:shadow-lg hover:shadow-violet-500/5 active:scale-[0.98] md:active:scale-100"
        >
          <div className="flex items-start justify-between gap-3 md:gap-4">
            {/* Left: Icon */}
            <div className={`
              w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0
              ${audience.tipo === 'dinamica' 
                ? 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20' 
                : 'bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20'
              }
            `}>
              {audience.tipo === 'dinamica' ? (
                <Zap className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
              ) : (
                <Users className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
              )}
            </div>

            {/* Middle: Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <h3 className="font-medium text-[13px] md:text-base text-zinc-100 truncate group-hover:text-white transition-colors">
                  {audience.nombre}
                </h3>
                <span className={`
                  inline-flex items-center gap-1 px-2 py-0.5 text-[9px] md:text-[10px] font-medium rounded-full
                  transition-all duration-300 group-hover:scale-105
                  ${audience.tipo === 'dinamica' 
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }
                `}>
                  {audience.tipo === 'dinamica' ? 'Dinámica' : 'Estática'}
                </span>
              </div>
              
              {audience.descripcion && (
                <p className="text-xs md:text-sm text-zinc-500 truncate mb-1.5">
                  {audience.descripcion}
                </p>
              )}

              <div className="flex items-center gap-2.5 md:gap-3 text-[10px] md:text-xs text-zinc-500">
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-lg border border-white/[0.03]">
                  <Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-violet-400" />
                  <span className="font-medium text-zinc-300">{audience.contact_count || 0}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  {formatDate(audience.created_at)}
                </span>
              </div>

              {/* Contact preview for dynamic audiences */}
              {audience.tipo === 'dinamica' && contactPreviews[audience.id]?.length > 0 && (
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex -space-x-1.5 md:-space-x-2">
                    {contactPreviews[audience.id].slice(0, 3).map((contact) => (
                      <div
                        key={contact.id}
                        className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-br from-cyan-600 to-cyan-800 
                                   flex items-center justify-center text-[8px] md:text-[9px] font-medium text-white
                                   border-2 border-zinc-900"
                        title={`${contact.nombre} ${contact.apellido || ''}`}
                      >
                        {contact.nombre?.[0]?.toUpperCase() || '?'}
                      </div>
                    ))}
                    {(audience.contact_count || 0) > 3 && (
                      <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-zinc-800 flex items-center justify-center 
                                      text-[8px] md:text-[9px] font-medium text-zinc-400 border-2 border-zinc-900">
                        +{(audience.contact_count || 0) - 3}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] md:text-[10px] text-zinc-600">
                    {(audience.filtros_json as any)?.conditions?.length || 0} filtros
                  </span>
                </div>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-0.5 md:gap-1 md:opacity-0 group-hover:opacity-100 transition-all duration-300">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingAudience(audience);
                }}
                className="p-1.5 md:p-2 text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
                title="Editar"
              >
                <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
              <button
                onClick={(e) => handleDelete(e, audience)}
                className="p-1.5 md:p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
              <ChevronRight className="hidden md:block w-5 h-5 text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all duration-300" />
            </div>
          </div>
        </div>
      ))}

      {/* Edit Modal */}
      {editingAudience && (
        <EditAudienceModal
          audience={editingAudience}
          onClose={() => setEditingAudience(null)}
        />
      )}
    </div>
  );
};

export default AudiencesTab;
