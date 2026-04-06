'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Target, 
  Users, 
  Filter,
  Loader2,
  Save
} from 'lucide-react';
import { useEmailMarketingStore, selectPreviewCount, AudienceFilters } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { MarketingAudience } from '../../../types/marketing';
import { FilterBuilder } from './FilterBuilder';
import { ContactSelector } from './ContactSelector';

interface EditAudienceModalProps {
  audience: MarketingAudience;
  onClose: () => void;
}

interface ContactPreview {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  email: string | null;
}

export const EditAudienceModal: React.FC<EditAudienceModalProps> = ({ audience, onClose }) => {
  const [nombre, setNombre] = useState(audience.nombre);
  const [descripcion, setDescripcion] = useState(audience.descripcion || '');
  const [filters, setFilters] = useState<AudienceFilters>(() => {
    const saved = audience.filtros_json as AudienceFilters | null;
    return saved?.conditions ? { logic: saved.logic || 'AND', conditions: saved.conditions } : { logic: 'AND', conditions: [] };
  });
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'content' | 'preview'>('info');
  
  // Contact preview state
  const [previewContacts, setPreviewContacts] = useState<ContactPreview[]>([]);
  const [previewPage, setPreviewPage] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const PREVIEW_LIMIT = 10;
  
  const updateAudience = useEmailMarketingStore(state => state.updateAudience);
  const previewCount = useEmailMarketingStore(selectPreviewCount);
  const previewAudienceContacts = useEmailMarketingStore(state => state.previewAudienceContacts);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  // Load contact previews for dynamic audiences
  useEffect(() => {
    if (audience.tipo === 'dinamica' && selectedEnterpriseId && activeSection === 'preview') {
      loadPreviewContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, selectedEnterpriseId, activeSection, previewPage, filters]); // loadPreviewContacts excluded - defined below

  const loadPreviewContacts = async () => {
    if (!selectedEnterpriseId) return;
    setIsLoadingPreview(true);
    try {
      const contacts = await previewAudienceContacts(
        selectedEnterpriseId,
        filters,
        PREVIEW_LIMIT
      );
      setPreviewContacts(contacts);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Load existing contacts for static audiences
  useEffect(() => {
    if (audience.tipo === 'estatica') {
      // TODO: Load existing audience contacts
    }
  }, [audience]);

  const handleSave = async () => {
    if (!selectedEnterpriseId || !nombre.trim()) return;

    setIsSubmitting(true);

    try {
      await updateAudience(audience.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        filtros_json: audience.tipo === 'dinamica' ? filters : undefined
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSave = nombre.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <Target className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="font-semibold text-zinc-100">
                Editar Audiencia
              </h2>
              <span className={`
                inline-flex items-center gap-1 text-[10px] font-medium
                ${audience.tipo === 'dinamica' ? 'text-cyan-400' : 'text-amber-400'}
              `}>
                {audience.tipo === 'dinamica' ? (
                  <><Filter className="w-3 h-3" /> Dinámica</>
                ) : (
                  <><Users className="w-3 h-3" /> Estática</>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
          <button
            onClick={() => setActiveSection('info')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              activeSection === 'info'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Información
          </button>
          <button
            onClick={() => setActiveSection('content')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              activeSection === 'content'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {audience.tipo === 'dinamica' ? 'Filtros' : 'Contactos'}
          </button>
          {audience.tipo === 'dinamica' && (
            <button
              onClick={() => setActiveSection('preview')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeSection === 'preview'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Vista Previa
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'info' ? (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Nombre de la audiencia
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Clientes VIP, Leads fríos..."
                  className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                             text-zinc-100 placeholder-zinc-500
                             focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Descripción (opcional)
                </label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe el propósito de esta audiencia..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                             text-zinc-100 placeholder-zinc-500 resize-none
                             focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Stats */}
              <div className="p-3 bg-zinc-800/30 rounded-lg border border-white/5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Contactos actuales:</span>
                  <span className="font-medium text-zinc-200">
                    {audience.contact_count || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-zinc-500">Creada:</span>
                  <span className="text-zinc-400">
                    {new Date(audience.created_at).toLocaleDateString('es-PE')}
                  </span>
                </div>
              </div>
            </div>
          ) : activeSection === 'content' ? (
            audience.tipo === 'dinamica' ? (
              <FilterBuilder
                filters={filters}
                onChange={setFilters}
                previewCount={previewCount}
              />
            ) : (
              <ContactSelector
                selectedIds={selectedContactIds}
                onChange={setSelectedContactIds}
              />
            )
          ) : (
            /* Preview section for dynamic audiences */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">
                  Contactos que coinciden con los filtros:
                </p>
                <span className="text-sm font-medium text-cyan-400">
                  {previewCount ?? audience.contact_count ?? 0} total
                </span>
              </div>

              {isLoadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                </div>
              ) : previewContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="w-10 h-10 text-zinc-600 mb-2" />
                  <p className="text-zinc-500 text-sm">No hay contactos que coincidan</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {previewContacts.map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-white/5 rounded-lg"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-600 to-cyan-800 
                                      flex items-center justify-center text-sm font-medium text-white">
                        {(contact.nombre?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {contact.nombre} {contact.apellido || ''}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">
                          {contact.email || contact.telefono || 'Sin contacto'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={loadPreviewContacts}
                disabled={isLoadingPreview}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm 
                           bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg
                           hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
              >
                <Loader2 className={`w-4 h-4 ${isLoadingPreview ? 'animate-spin' : 'hidden'}`} />
                Actualizar vista previa
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5 shrink-0">
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
    </div>,
    document.body
  );
};

export default EditAudienceModal;
