'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquareText, Pencil, Plus, RefreshCw, Send, Shield, Trash2 } from 'lucide-react';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '../../../store/contactStore';
import { ContactDetailModal } from '../ContactDetailModal';
import {
  useWhatsAppTemplatesStore,
  selectWhatsAppSendsError,
  selectWhatsAppSendsLoading,
  selectWhatsAppTemplateSends,
  selectWhatsAppTemplates,
  selectWhatsAppTemplatesError,
  selectWhatsAppTemplatesLoading,
  selectWhatsAppIsSubmitting,
  selectWhatsAppShowFormModal
} from '../../../store/whatsappTemplatesStore';
import { TemplateFormModal } from './TemplateFormModal';
import { WhatsAppTemplateRecord } from '../../../types/whatsapp-template';
import { useAdminStore, selectFocusedTemplateId } from '../../../store/adminStore';

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
};

const normalizeText = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, ' ').trim();
};

const templateStatusStyles: Record<string, string> = {
  approved: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  pending: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  rejected: 'bg-red-500/10 border-red-500/20 text-red-400',
  disabled: 'bg-zinc-800 border-white/5 text-zinc-400',
  paused: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  draft: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  archived: 'bg-zinc-800 border-white/5 text-zinc-400',
  deleted: 'bg-zinc-800 border-white/5 text-zinc-500'
};

const sendStatusStyles: Record<string, string> = {
  read: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  delivered: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  sent: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  accepted: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  queued: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  failed: 'bg-red-500/10 border-red-500/20 text-red-400',
  rejected: 'bg-red-500/10 border-red-500/20 text-red-400',
  cancelled: 'bg-zinc-800 border-white/5 text-zinc-400'
};

const tabStyles = (active: boolean) =>
  active
    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10';

export const WhatsAppTemplatesSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'templates' | 'sends'>('templates');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);

  const templates = useWhatsAppTemplatesStore(selectWhatsAppTemplates);
  const sends = useWhatsAppTemplatesStore(selectWhatsAppTemplateSends);
  const isLoadingTemplates = useWhatsAppTemplatesStore(selectWhatsAppTemplatesLoading);
  const isLoadingSends = useWhatsAppTemplatesStore(selectWhatsAppSendsLoading);
  const templatesError = useWhatsAppTemplatesStore(selectWhatsAppTemplatesError);
  const sendsError = useWhatsAppTemplatesStore(selectWhatsAppSendsError);

  const isSubmitting = useWhatsAppTemplatesStore(selectWhatsAppIsSubmitting);
  const showFormModal = useWhatsAppTemplatesStore(selectWhatsAppShowFormModal);

  const fetchAllWhatsAppData = useWhatsAppTemplatesStore((s) => s.fetchAllWhatsAppData);
  const canViewWhatsAppTemplates = useWhatsAppTemplatesStore((s) => s.canViewWhatsAppTemplates);
  const clearTemplatesError = useWhatsAppTemplatesStore((s) => s.clearTemplatesError);
  const clearSendsError = useWhatsAppTemplatesStore((s) => s.clearSendsError);
  const resetStore = useWhatsAppTemplatesStore((s) => s.resetStore);
  const setSelectedTemplate = useWhatsAppTemplatesStore((s) => s.setSelectedTemplate);
  const setShowFormModal = useWhatsAppTemplatesStore((s) => s.setShowFormModal);
  const deleteTemplate = useWhatsAppTemplatesStore((s) => s.deleteTemplate);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const focusedTemplateId = useAdminStore(selectFocusedTemplateId);
  const clearFocusedTemplate = useAdminStore((s) => s.clearFocusedTemplateNavigation);

  const userRoleId = userContext?.roleId;
  const hasAccess = canViewWhatsAppTemplates(userRoleId);

  useEffect(() => {
    if (selectedEnterpriseId && hasAccess) {
      fetchAllWhatsAppData(selectedEnterpriseId, true);
      return;
    }

    resetStore();
  }, [selectedEnterpriseId, hasAccess, fetchAllWhatsAppData, resetStore]);

  // Auto-open template draft when navigated from chat
  useEffect(() => {
    if (!focusedTemplateId || templates.length === 0) return;
    const target = templates.find((t) => t.id === focusedTemplateId);
    if (target) {
      setSelectedTemplate(target);
      setShowFormModal(true);
    }
    clearFocusedTemplate();
  }, [focusedTemplateId, templates, setSelectedTemplate, setShowFormModal, clearFocusedTemplate]);

  const handleRefresh = () => {
    if (!selectedEnterpriseId || !hasAccess) return;
    fetchAllWhatsAppData(selectedEnterpriseId, true);
  };

  const handleCreateNew = () => {
    setSelectedTemplate(null);
    setShowFormModal(true);
  };

  const handleEdit = (template: WhatsAppTemplateRecord) => {
    setSelectedTemplate(template);
    setShowFormModal(true);
  };

  const handleDelete = async (templateId: number) => {
    await deleteTemplate(templateId);
    setConfirmDeleteId(null);
  };

  const handleCloseModal = () => {
    setShowFormModal(false);
    setSelectedTemplate(null);
  };

  const isLoading = isLoadingTemplates || isLoadingSends;
  const activeError = activeTab === 'templates' ? templatesError : sendsError;
  const activeItems = activeTab === 'templates' ? templates : sends;

  const summary = useMemo(() => {
    return `${templates.length} plantilla${templates.length !== 1 ? 's' : ''} · ${sends.length} envío${sends.length !== 1 ? 's' : ''}`;
  }, [templates.length, sends.length]);

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <Shield className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Acceso restringido</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          Solo administradores y líderes pueden ver plantillas y envíos de WhatsApp.
        </p>
      </div>
    );
  }

  if (!selectedEnterpriseId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquareText className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-zinc-400">Selecciona una empresa</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MessageSquareText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">WhatsApp</h3>
            <p className="text-xs text-zinc-500">{summary}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNew}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 border border-emerald-500/30 text-xs font-medium text-white hover:bg-emerald-500 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Plantilla
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('templates')}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs ${tabStyles(activeTab === 'templates')}`}
        >
          <MessageSquareText className="w-4 h-4" />
          Plantillas
        </button>
        <button
          onClick={() => setActiveTab('sends')}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs ${tabStyles(activeTab === 'sends')}`}
        >
          <Send className="w-4 h-4" />
          Envíos
        </button>
      </div>

      {activeError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-400/70 mt-0.5">{activeError}</p>
          </div>
          <button
            onClick={activeTab === 'templates' ? clearTemplatesError : clearSendsError}
            className="ml-auto text-red-400 hover:text-red-300"
            title="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {isLoading && activeItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
          <p className="text-sm text-zinc-400">
            Cargando {activeTab === 'templates' ? 'plantillas' : 'envíos'}...
          </p>
        </div>
      )}

      {!isLoading && activeItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
            {activeTab === 'templates' ? (
              <MessageSquareText className="w-7 h-7 text-zinc-500" />
            ) : (
              <Send className="w-7 h-7 text-zinc-500" />
            )}
          </div>
          <h4 className="text-lg font-semibold text-zinc-300 mb-2">
            Sin {activeTab === 'templates' ? 'plantillas' : 'envíos'} registrados
          </h4>
          <p className="text-sm text-zinc-500 max-w-xs">
            {activeTab === 'templates'
              ? 'Esta empresa aún no tiene plantillas de WhatsApp registradas en el sistema.'
              : 'Esta empresa aún no tiene envíos de plantillas registrados en el sistema.'}
          </p>
        </div>
      )}

      {activeTab === 'templates' && templates.length > 0 && (
        <div className="bg-[#131316] border border-white/5 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.5fr_1.1fr_0.7fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_0.6fr] gap-3 px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            <div>Plantilla</div>
            <div>Número</div>
            <div>Idioma</div>
            <div>Categoría</div>
            <div>Estado</div>
            <div>Proveedor</div>
            <div>Clasificación</div>
            <div>Actualizado</div>
            <div>Acciones</div>
          </div>

          <div className="divide-y divide-white/5">
            {templates.map((item) => {
              const statusClass = templateStatusStyles[item.status] || 'bg-zinc-800 border-white/5 text-zinc-400';
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-1 md:grid-cols-[1.5fr_1.1fr_0.7fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_0.6fr] gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Plantilla</div>
                    <div className="text-sm font-medium text-zinc-200 truncate">{item.template_name}</div>
                    {item.rejection_reason && item.status === 'rejected' && (
                      <div className="text-[11px] text-red-400/80 truncate mt-1">{item.rejection_reason}</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Número</div>
                    <div className="text-sm text-zinc-300 truncate">{item.number?.telefono || 'Sin número'}</div>
                    <div className="text-[11px] text-zinc-500 truncate mt-1">{item.number?.nombre || 'Sin alias'}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Idioma</div>
                    <div className="text-sm text-zinc-300 uppercase">{item.language_code}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Categoría</div>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-white/5 capitalize">
                      {normalizeText(item.meta_category, '—')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Estado</div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium border capitalize ${statusClass}`}>
                      {normalizeText(item.status, '—')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Proveedor</div>
                    <div className="text-sm text-zinc-300 capitalize">{normalizeText(item.provider, '—')}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Clasificación</div>
                    <div className="text-sm text-zinc-400 truncate">{item.clasificacion_interna || '—'}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Actualizado</div>
                    <div className="text-sm text-zinc-400">{formatDate(item.updated_at)}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Acciones</div>
                    <div className="flex items-center gap-1">
                      {['draft', 'rejected'].includes(item.status) && (
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={isSubmitting}
                            className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-[10px] font-medium text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg bg-zinc-800 border border-white/5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-all"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'sends' && sends.length > 0 && (
        <div className="bg-[#131316] border border-white/5 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[0.8fr_1fr_1.3fr_1fr_0.8fr_0.7fr_0.7fr_1.2fr] gap-3 px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            <div>Fecha</div>
            <div>Número</div>
            <div>Template</div>
            <div>Destino</div>
            <div>Estado</div>
            <div>Contacto</div>
            <div>Proveedor</div>
            <div>Error</div>
          </div>

          <div className="divide-y divide-white/5">
            {sends.map((item) => {
              const statusClass = sendStatusStyles[item.estado] || 'bg-zinc-800 border-white/5 text-zinc-400';
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-1 md:grid-cols-[0.8fr_1fr_1.3fr_1fr_0.8fr_0.7fr_0.7fr_1.2fr] gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Fecha</div>
                    <div className="text-sm text-zinc-300">{formatDate(item.created_at)}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Número</div>
                    <div className="text-sm text-zinc-300 truncate">{item.number?.telefono || 'Sin número'}</div>
                    <div className="text-[11px] text-zinc-500 truncate mt-1">{item.number?.nombre || 'Sin alias'}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Template</div>
                    <div className="text-sm font-medium text-zinc-200 truncate">{item.template_name}</div>
                    <div className="text-[11px] text-zinc-500 uppercase mt-1">{item.language_code}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Destino</div>
                    <div className="text-sm text-zinc-300 truncate">{item.telefono_destino}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Estado</div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium border capitalize ${statusClass}`}>
                      {normalizeText(item.estado, '—')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Contacto</div>
                    {item.contacto_id ? (
                      <button
                        type="button"
                        onClick={() => setSelectedContactId(item.contacto_id as number)}
                        className="block max-w-full truncate rounded text-left text-sm text-cyan-400 transition-colors hover:text-cyan-300 hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                        title={`Abrir contacto ${item.contacto_id}`}
                      >
                        {`ID ${item.contacto_id}`}
                      </button>
                    ) : (
                      <div className="text-sm text-zinc-400 truncate">—</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Proveedor</div>
                    <div className="text-sm text-zinc-300 capitalize">{normalizeText(item.provider, '—')}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Error</div>
                    <div className="text-sm text-zinc-400 truncate">{item.error_message || item.error_code || '—'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {selectedContactId !== null && (
        <ContactDetailModal
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}

      {showFormModal && selectedEnterpriseId && (
        <TemplateFormModal
          enterpriseId={selectedEnterpriseId}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
