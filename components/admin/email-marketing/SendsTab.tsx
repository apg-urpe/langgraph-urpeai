'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Send, 
  Mail, 
  Target, 
  Clock,
  XCircle,
  Loader2,
  ChevronDown,
  Search,
  User,
  MousePointer,
  Inbox,
  Eye,
  X
} from 'lucide-react';
import { useEmailMarketingStore, selectCampaigns } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { supabase } from '../../../lib/supabase-client';
import { ContactDetailModal } from '../ContactDetailModal';
import { isMarketingEmailMetadata, MARKETING_EMAIL_OR_FILTER } from '../../../lib/email-metadata';

interface EmailSend {
  id: number;
  campana_id: number | null;
  contacto_id: number;
  secuencia: number;
  estado: 'pendiente' | 'programado' | 'enviado' | 'abierto' | 'clic' | 'fallido' | 'cancelado';
  asunto: string | null;
  cuerpo_html?: string | null;
  enviado_en: string | null;
  abierto_en: string | null;
  created_at: string;
  metadata?: unknown;
  contacto?: {
    nombre: string;
    apellido: string;
    email: string;
    telefono?: string;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pendiente: { label: 'Pendiente', color: 'text-zinc-400 bg-zinc-500/10', icon: Clock },
  programado: { label: 'Programado', color: 'text-amber-400 bg-amber-500/10', icon: Clock },
  enviado: { label: 'Enviado', color: 'text-blue-400 bg-blue-500/10', icon: Send },
  abierto: { label: 'Abierto', color: 'text-cyan-400 bg-cyan-500/10', icon: Mail },
  clic: { label: 'Click', color: 'text-violet-400 bg-violet-500/10', icon: MousePointer },
  fallido: { label: 'Fallido', color: 'text-rose-400 bg-rose-500/10', icon: XCircle },
  cancelado: { label: 'Cancelado', color: 'text-zinc-500 bg-zinc-600/10', icon: XCircle },
};

export const SendsTab: React.FC = () => {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterCampaign, setFilterCampaign] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');  
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [selectedSend, setSelectedSend] = useState<EmailSend | null>(null);

  const campaigns = useEmailMarketingStore(selectCampaigns);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  useEffect(() => {
    if (selectedEnterpriseId) {
      loadSends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnterpriseId, filterCampaign, filterStatus]); // loadSends excluded - defined below

  const loadSends = async () => {
    if (!selectedEnterpriseId) return;
    setIsLoading(true);

    try {
      let query = supabase
        .from('wp_email_envio')
        .select(`
          id, campana_id, contacto_id, secuencia, estado, asunto, cuerpo_html, metadata,
          enviado_en, abierto_en, created_at,
          contacto:contacto_id!inner(nombre, apellido, email, telefono, empresa_id)
        `)
        .eq('contacto.empresa_id', selectedEnterpriseId)
        .or(MARKETING_EMAIL_OR_FILTER)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filterCampaign) {
        query = query.eq('campana_id', filterCampaign);
      }
      if (filterStatus) {
        query = query.eq('estado', filterStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      // Transform contacto from array to object (Supabase inner join returns array)
      const transformed = (data || []).map(row => ({
        ...row,
        contacto: Array.isArray(row.contacto) ? row.contacto[0] : row.contacto
      })).filter(row => isMarketingEmailMetadata(row.metadata));
      setSends(transformed as EmailSend[]);
    } catch (err) {
      console.error('Error loading sends:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCampaignName = (id: number | null) => {
    if (!id) {
      return 'Email libre';
    }

    return campaigns.find(c => c.id === id)?.nombre || `Campaña #${id}`;
  };

  const filteredSends = sends.filter(send => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const contactName = `${send.contacto?.nombre || ''} ${send.contacto?.apellido || ''}`.toLowerCase();
    return contactName.includes(search) || 
           send.contacto?.email?.toLowerCase().includes(search) ||
           send.contacto?.telefono?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 md:gap-3 p-2 md:p-3 bg-zinc-900/30 rounded-xl border border-white/5">
        {/* Search */}
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full pl-9 md:pl-10 pr-4 py-2 md:py-2.5 text-xs md:text-sm bg-zinc-800/70 border border-white/10 rounded-xl
                       text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50
                       transition-all focus:bg-zinc-800"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {/* Campaign Filter */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterCampaign || ''}
              onChange={(e) => setFilterCampaign(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full appearance-none px-3 py-2 md:py-2.5 pr-8 text-[11px] md:text-sm bg-zinc-800/70 border border-white/10 rounded-xl
                         text-zinc-300 focus:outline-none focus:border-violet-500/50 cursor-pointer transition-all"
            >
              <option value="">Campañas</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterStatus || ''}
              onChange={(e) => setFilterStatus(e.target.value || null)}
              className="w-full appearance-none px-3 py-2 md:py-2.5 pr-8 text-[11px] md:text-sm bg-zinc-800/70 border border-white/10 rounded-xl
                         text-zinc-300 focus:outline-none focus:border-violet-500/50 cursor-pointer transition-all"
            >
              <option value="">Estados</option>
              {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-500">
        {filteredSends.length} envío{filteredSends.length !== 1 ? 's' : ''}
      </p>

      {/* Sends List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : filteredSends.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="p-4 bg-zinc-800/50 rounded-full mb-4">
            <Send className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-400 mb-2">
            No hay envíos
          </h3>
          <p className="text-zinc-500 text-sm max-w-sm">
            {filterCampaign || filterStatus
              ? 'No se encontraron envíos con los filtros seleccionados'
              : 'Los envíos de campañas aparecerán aquí'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSends.map(send => {
            const statusConfig = STATUS_CONFIG[send.estado] || STATUS_CONFIG.enviado;
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={send.id}
                className="group bg-zinc-900/50 border border-white/5 rounded-xl p-3 md:p-4
                           hover:border-violet-500/20 hover:bg-zinc-800/50 
                           transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/5 active:scale-[0.98] md:active:scale-100"
              >
                <div className="flex items-start gap-3 md:gap-4">
                  {/* Status Icon */}
                  <div className={`
                    w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl flex items-center justify-center shrink-0
                    ${send.estado === 'clic' ? 'bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20' :
                      send.estado === 'abierto' ? 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20' :
                      send.estado === 'enviado' ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20' :
                      send.estado === 'programado' ? 'bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20' :
                      send.estado === 'fallido' ? 'bg-gradient-to-br from-rose-500/20 to-rose-600/10 border border-rose-500/20' :
                      'bg-gradient-to-br from-zinc-500/20 to-zinc-600/10 border border-zinc-500/20'
                    }
                  `}>
                    <StatusIcon className={`w-4 h-4 md:w-5 md:h-5 ${statusConfig.color.split(' ')[0]}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <p className="text-[13px] md:text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                        {[send.contacto?.nombre, send.contacto?.apellido].filter(Boolean).join(' ') || send.contacto?.email || 'Contacto sin nombre'}
                      </p>
                      <span className={`
                        inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] md:text-[10px] font-medium rounded-full
                        border transition-all group-hover:scale-105
                        ${statusConfig.color} border-current/20
                      `}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {statusConfig.label}
                      </span>
                    </div>
                    
                    <p className="text-[11px] md:text-xs text-zinc-500 truncate mb-2">
                      {send.contacto?.email} {send.contacto?.telefono && `• ${send.contacto.telefono}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[9px] md:text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-lg border border-white/[0.03]">
                        <Mail className="w-3 h-3 text-violet-400" />
                        <span className="text-zinc-300 truncate max-w-[100px] md:max-w-none">{getCampaignName(send.campana_id)}</span>
                      </span>
                      {send.secuencia > 1 && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-lg border border-white/[0.03]">
                          <Target className="w-3 h-3 text-cyan-400" />
                          <span className="text-zinc-300">#{send.secuencia}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-zinc-600 whitespace-nowrap">
                        <Clock className="w-3 h-3" />
                        {formatDate(send.enviado_en || send.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 md:gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedContactId(send.contacto_id)}
                      className="p-1.5 md:p-2 rounded-lg bg-white/5 hover:bg-violet-500/20 border border-white/10 
                                 hover:border-violet-500/30 transition-all group/btn"
                      title="Ver contacto"
                    >
                      <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400 group-hover/btn:text-violet-400 transition-colors" />
                    </button>
                    <button
                      onClick={() => setSelectedSend(send)}
                      className="p-1.5 md:p-2 rounded-lg bg-white/5 hover:bg-cyan-500/20 border border-white/10 
                                 hover:border-cyan-500/30 transition-all group/btn"
                      title="Ver correo"
                    >
                      <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400 group-hover/btn:text-cyan-400 transition-colors" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contact Detail Modal */}
      {selectedContactId && (
        <ContactDetailModal
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}

      {/* Email Detail Modal - Rendered via Portal to escape parent overflow */}
      {selectedSend && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setSelectedSend(null)}
        >
          <div 
            className="w-full max-w-2xl max-h-[85vh] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="shrink-0 p-5 border-b border-white/5 flex items-start gap-4 bg-gradient-to-b from-white/5 to-transparent">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-zinc-100 pr-8 leading-tight">
                  {selectedSend.asunto || '(Sin asunto)'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-800/50 border border-white/5 text-zinc-300">
                    Para: {[selectedSend.contacto?.nombre, selectedSend.contacto?.apellido].filter(Boolean).join(' ') || selectedSend.contacto?.email || 'Sin nombre'} ({selectedSend.contacto?.email})
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {formatDate(selectedSend.enviado_en || selectedSend.created_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedSend(null)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {selectedSend.cuerpo_html ? (
                <div 
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedSend.cuerpo_html }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Mail className="w-12 h-12 text-zinc-700 mb-3" />
                  <p className="text-zinc-500">Contenido del email no disponible</p>
                  <p className="text-zinc-600 text-xs mt-1">El cuerpo del mensaje no fue almacenado</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="shrink-0 p-4 border-t border-white/5 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <span className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                  ${STATUS_CONFIG[selectedSend.estado]?.color || 'text-zinc-400 bg-zinc-500/10'}
                `}>
                  {STATUS_CONFIG[selectedSend.estado]?.label || selectedSend.estado}
                </span>
                <span className="text-xs text-zinc-500">
                  Campaña: {getCampaignName(selectedSend.campana_id)}
                </span>
              </div>
              <button
                onClick={() => setSelectedContactId(selectedSend.contacto_id)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-violet-400 
                           bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 
                           rounded-lg transition-all"
              >
                <User className="w-3.5 h-3.5" />
                Ver contacto
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SendsTab;
