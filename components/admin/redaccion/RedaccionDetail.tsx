'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  useRedaccionStore,
  selectSelectedRedaccion,
  selectDetalles,
  selectIsLoadingDetalles,
} from '@/store/redaccionStore';
import { useContactStore, selectSelectedEnterpriseId, selectEnterpriseProfile } from '@/store/contactStore';
import { useAdminStore } from '@/store/adminStore';
import { ESTADO_CONFIG, RedaccionDetalle } from '@/types/redaccion';
import { TiposBadge } from './TiposBadge';
import { DocumentRenderer } from './DocumentRenderer';
import { SectionEditor } from './SectionEditor';
import { ContactPicker } from './ContactPicker';

// ============================================================================
// REDACCION DETAIL VIEW
// ============================================================================

export const RedaccionDetail: React.FC = () => {
  const redaccion = useRedaccionStore(selectSelectedRedaccion);
  const detalles = useRedaccionStore(selectDetalles);
  const isLoading = useRedaccionStore(selectIsLoadingDetalles);
  const goToList = useRedaccionStore(state => state.goToList);
  const updateDetalle = useRedaccionStore(state => state.updateDetalle);
  const updateRedaccion = useRedaccionStore(state => state.updateRedaccion);
  const enterpriseId = useContactStore(selectSelectedEnterpriseId);
  const enterpriseProfile = useContactStore(selectEnterpriseProfile);
  const selectContact = useContactStore(state => state.selectContact);
  const setActiveView = useAdminStore(state => state.setActiveView);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingSection, setEditingSection] = useState<RedaccionDetalle | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // PDF download handler
  const handleDownloadPDF = useCallback(async () => {
    if (isGeneratingPDF || !redaccion || detalles.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      const { generateRedaccionPDFClient, downloadRedaccionPDF } = await import('@/lib/redaccion-pdf');

      const contactName = redaccion.contacto
        ? [redaccion.contacto.nombre, redaccion.contacto.apellido].filter(Boolean).join(' ') || redaccion.contacto.telefono
        : null;

      const templateData = {
        empresa: {
          nombre: enterpriseProfile?.nombre || 'Empresa',
          logoUrl: enterpriseProfile?.logo_url || null,
        },
        documento: {
          nombre: redaccion.nombre,
          descripcion: redaccion.descripcion,
          tipo: redaccion.tipo?.nombre || null,
          estado: redaccion.estado,
          contacto: contactName,
          fecha: new Date(redaccion.updated_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }),
        },
        secciones: detalles,
      };

      const { blob } = await generateRedaccionPDFClient(templateData);
      const safeName = redaccion.nombre.replace(/[^a-zA-Z0-9\s\-_áéíóúñÁÉÍÓÚÑ]/g, '').substring(0, 50);
      downloadRedaccionPDF(blob, `${safeName}.pdf`);
    } catch (err: any) {
      console.error('[RedaccionDetail] PDF error:', err);
      alert(`Error generando PDF: ${err.message}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [isGeneratingPDF, redaccion, detalles, enterpriseProfile]);

  // Total word count
  const totalWords = useMemo(() => {
    return detalles.reduce((sum, d) => {
      if (!d.contenido) return sum;
      return sum + d.contenido.trim().split(/\s+/).length;
    }, 0);
  }, [detalles]);

  // Average evaluation
  const avgEval = useMemo(() => {
    const evaled = detalles.filter(d => d.evaluacion !== null);
    if (evaled.length === 0) return null;
    return evaled.reduce((sum, d) => sum + (d.evaluacion || 0), 0) / evaled.length;
  }, [detalles]);

  // Handle save from SectionEditor
  const handleSaveSection = useCallback(async (id: number, changes: { titulo?: string; contenido?: string }) => {
    const success = await updateDetalle(id, changes);
    if (success) {
      setEditingSection(null);
    }
    return success;
  }, [updateDetalle]);

  if (!redaccion) return null;

  const estadoConfig = ESTADO_CONFIG[redaccion.estado] || ESTADO_CONFIG.borrador;

  // ── Fullscreen wrapper ──
  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-[90] bg-[#0a0a0c]'
    : 'h-full bg-[#0a0a0c]';

  return (
    <div className={`${containerClasses} flex flex-col`}>
      {/* ═══════════════════ COMPACT HEADER (1 row) ═══════════════════ */}
      <div className="shrink-0 border-b border-white/[0.04] bg-[#0d0d0f]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
          {/* Back */}
          <button
            onClick={goToList}
            className="p-1.5 rounded-lg hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300 transition-all shrink-0"
            title="Volver a la lista"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Título */}
          <h1
            className="text-sm font-semibold text-zinc-100 truncate max-w-[200px]"
            title={redaccion.descripcion || redaccion.nombre}
          >
            {redaccion.nombre}
          </h1>

          {/* Separador */}
          <span className="w-px h-4 bg-white/5 shrink-0" />

          {/* Badges inline */}
          <div className="flex items-center gap-2 text-[11px] shrink-0">
            <span className={`px-2 py-0.5 rounded-full font-medium ${estadoConfig.color} ${estadoConfig.bg}`}>
              {estadoConfig.label}
            </span>

            {redaccion.tipo && <TiposBadge tipo={redaccion.tipo} compact />}

            <span className="text-zinc-600">{detalles.length} sec</span>

            {totalWords > 0 && (
              <span className="text-zinc-600">{totalWords.toLocaleString()} pal</span>
            )}

            {avgEval !== null && (
              <span className="flex items-center gap-1 text-zinc-500">
                <div className="w-6 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(avgEval / 10) * 100}%`,
                      backgroundColor: avgEval >= 7 ? '#34d399' : avgEval >= 4 ? '#fbbf24' : '#f87171',
                    }}
                  />
                </div>
                <span className="font-mono text-[10px]">{avgEval.toFixed(1)}</span>
              </span>
            )}
          </div>

          {/* Separador */}
          <span className="w-px h-4 bg-white/5 shrink-0" />

          {/* Contacto */}
          <div className="shrink-0">
            <ContactPicker
              empresaId={enterpriseId}
              selectedContactId={redaccion.contacto_id}
              selectedContactName={
                redaccion.contacto
                  ? [redaccion.contacto.nombre, redaccion.contacto.apellido].filter(Boolean).join(' ') || redaccion.contacto.telefono
                  : null
              }
              onSelect={(contactId) => {
                updateRedaccion(redaccion.id, { contacto_id: contactId });
              }}
              onNavigate={(contactId) => {
                selectContact(contactId);
                setActiveView('contacts');
              }}
              compact
            />
          </div>

          {/* Fecha */}
          <span className="flex items-center gap-1 text-zinc-600 text-[11px] shrink-0">
            <Clock className="w-3 h-3" />
            {new Date(redaccion.updated_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
          </span>

          {/* Link externo */}
          {redaccion.url_doc && (
            <a
              href={redaccion.url_doc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors text-[11px] shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              Doc
            </a>
          )}

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Download PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF || detalles.length === 0}
            className="p-1.5 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Descargar PDF"
          >
            {isGeneratingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-all shrink-0"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ═══════════════════ CONTENT ═══════════════════ */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
              <span className="text-xs text-zinc-600">Cargando documento...</span>
            </div>
          </div>
        ) : detalles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-sm text-zinc-500">Sin secciones en este documento</p>
          </div>
        ) : (
          /* ── Vista Documento ── */
          <div className="p-3 h-full">
            <DocumentRenderer
              detalles={detalles}
              onEditSection={(d) => setEditingSection(d)}
              showToc
              logoUrl={enterpriseProfile?.logo_url}
              empresaNombre={enterpriseProfile?.nombre}
            />
          </div>
        )}
      </div>

      {/* ═══════════════════ SECTION EDITOR MODAL ═══════════════════ */}
      {editingSection && (
        <SectionEditor
          detalle={editingSection}
          onSave={handleSaveSection}
          onClose={() => setEditingSection(null)}
          empresaId={enterpriseId}
        />
      )}
    </div>
  );
};
