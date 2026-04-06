'use client';

import { useState } from 'react';
import { Search, User, FileText, Loader2, CheckCircle, XCircle, ChevronDown, BookMarked, ExternalLink, Code2, GitBranch, Image as ImageIcon, Terminal, Sparkles } from 'lucide-react';
import type { ToolPart } from '@/hooks/useChatReliable';
import { useArtifactStore } from '@/store/artifactStore';

interface ToolExecutionCardProps {
  toolPart: ToolPart;
}

const TOOL_CONFIG: Record<string, { icon: typeof Search; label: string; color: string; bgColor: string }> = {
  // New camelCase names
  searchContacts: {
    icon: Search,
    label: 'Búsqueda CRM',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10'
  },
  getContactContext: {
    icon: User,
    label: 'Contexto',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10'
  },
  createNote: {
    icon: FileText,
    label: 'Nota',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10'
  },
  countContacts: {
    icon: Search,
    label: 'Conteo',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10'
  },
  createArtifact: {
    icon: FileText,
    label: 'Artifact',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10'
  },
  updateArtifact: {
    icon: FileText,
    label: 'Editar Artifact',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10'
  },
  // Legacy names for backwards compatibility
  search_contacts_deep: {
    icon: Search,
    label: 'Búsqueda CRM',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10'
  },
  get_full_contact_context: {
    icon: User,
    label: 'Contexto',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10'
  },
  create_note: {
    icon: FileText,
    label: 'Nota',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10'
  }
};

export function ToolExecutionCard({ toolPart }: ToolExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOpeningArtifact, setIsOpeningArtifact] = useState(false);
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);
  const isComplete = toolPart.state === 'complete';
  const isExecuting = toolPart.state === 'pending' || toolPart.state === 'executing';
  const isError = toolPart.state === 'error';
  
  const config = TOOL_CONFIG[toolPart.toolName] || {
    icon: Search,
    label: toolPart.toolName.replace(/_/g, ' '),
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/10'
  };
  
  const Icon = config.icon;
  
  // Helper to extract error message from error object or string
  const getErrorMessage = (error: any): string => {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error.message) return error.message;
    return 'Error desconocido';
  };
  
  // Helper to detect tool type (supports new camelCase and legacy names)
  const isSearchTool = ['searchContacts', 'search_contacts_deep', 'buscar_contactos'].includes(toolPart.toolName);
  const isContextTool = ['getContactContext', 'get_full_contact_context', 'ver_contacto_completo'].includes(toolPart.toolName);
  const isNoteTool = ['createNote', 'create_note', 'crear_nota'].includes(toolPart.toolName);
  const isCountTool = toolPart.toolName === 'countContacts';
  const isArtifactTool = toolPart.toolName === 'createArtifact' || toolPart.toolName === 'updateArtifact';
  
  // Get summary text for collapsed view
  const getSummary = () => {
    if (isExecuting) return 'Ejecutando...';
    if (isError) return getErrorMessage(toolPart.output?.error);
    
    const output = toolPart.output;
    if (!output) return 'Sin resultado';
    
    // Prefer resumen field from new tools
    if (output.resumen && typeof output.resumen === 'string') {
      const r = output.resumen;
      return r.length > 50 ? r.substring(0, 47) + '…' : r;
    }
    
    if (isSearchTool) {
      const total = output.total ?? output.contactos?.length ?? output.results?.length ?? 0;
      return `${total} contacto${total !== 1 ? 's' : ''}`;
    }
    if (isContextTool) {
      const c = output.contacto || output.contact;
      return c?.nombre || c?.nombreCompleto || 'Contacto cargado';
    }
    if (isNoteTool) {
      return output.success ? 'Creada' : 'Error';
    }
    if (isCountTool) {
      return `${output.total ?? 0} contactos`;
    }
    if (isArtifactTool) {
      const title = output?.title || output?.artifact?.title || 'Artifact';
      const type = output?.artifactType || output?.artifact?.type;
      return type ? `${title} (${type})` : `${title} creado`;
    }
    return 'Completado';
  };
  
  // Render expanded details
  const renderDetails = () => {
    if (!isComplete || !toolPart.output) return null;
    const output = toolPart.output;
    
    // Search tools (new and legacy)
    if (isSearchTool) {
      const contacts = output.contactos || output.results || [];
      if (contacts.length === 0) {
        return <div className="text-[11px] text-zinc-500">Sin resultados</div>;
      }
      return (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {contacts.slice(0, 4).map((contact: any) => (
            <div key={contact.id} className="flex items-center gap-2 text-[11px] text-zinc-400 bg-black/20 rounded px-2 py-1">
              <span className="text-[10px] text-zinc-600 font-mono">#{contact.id}</span>
              <span className="font-medium text-zinc-300 truncate max-w-[120px]">{contact.nombre}</span>
              <span className="text-zinc-600 truncate">{contact.telefono || '-'}</span>
            </div>
          ))}
          {contacts.length > 4 && (
            <div className="text-[10px] text-zinc-600 pl-2">+{contacts.length - 4} más</div>
          )}
        </div>
      );
    }
    
    // Context tools (new and legacy)
    if (isContextTool) {
      const c = output.contacto || output.contact;
      if (!c) {
        return <div className="text-[11px] text-zinc-500">Sin datos de contacto</div>;
      }
      return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {c.telefono && <div className="text-zinc-500">📞 {c.telefono}</div>}
          {c.email && <div className="text-zinc-500 truncate">✉️ {c.email}</div>}
          {c.estado && <div className="text-zinc-500">🏷️ {c.estado}</div>}
          {(c.etapa || c.etapa_embudo) && <div className="text-zinc-500">📊 {c.etapa || c.etapa_embudo}</div>}
          {output.totales && (
            <div className="col-span-2 text-zinc-600 text-[10px] mt-1">
              💬 {output.totales.conversaciones || 0} conv · 📅 {output.totales.citas || 0} citas · 📝 {output.totales.notas || 0} notas
            </div>
          )}
        </div>
      );
    }
    
    // Note tools (new and legacy)
    if (isNoteTool) {
      return (
        <div className={`text-[11px] ${output.success ? 'text-green-400' : 'text-red-400'}`}>
          {output.success 
            ? `✓ ${output.nota?.contacto ? `Guardada para ${output.nota.contacto}` : 'Nota guardada'}`
            : `✗ ${getErrorMessage(output.error)}`
          }
        </div>
      );
    }
    
    // Count tool
    if (isCountTool) {
      return (
        <div className="text-[11px] text-zinc-400">
          Total: <span className="font-medium text-zinc-300">{output.total ?? 0}</span>
          {output.filtros && output.filtros !== 'ninguno' && (
            <span className="text-zinc-600 ml-2">({output.filtros})</span>
          )}
        </div>
      );
    }

    // Artifact tool — handled separately with prominent card
    if (isArtifactTool) {
      return null;
    }
    
    // Error fallback
    if (output.success === false) {
      return <div className="text-[11px] text-red-400">{getErrorMessage(output.error)}</div>;
    }
    
    return null;
  };
  
  // ── ARTIFACT TOOL: Prominent inline card ──
  if (isArtifactTool) {
    const output = toolPart.output;
    const artifact = output?.artifact;
    const artifactId = artifact?.id || output?.artifactId;
    const artifactTitle = output?.title || artifact?.title || 'Artifact';
    const artifactType = output?.artifactType || artifact?.type || 'markdown';

    const ARTIFACT_TYPE_ICON: Record<string, React.ReactNode> = {
      html: <Code2 className="w-4 h-4" />,
      markdown: <FileText className="w-4 h-4" />,
      svg: <ImageIcon className="w-4 h-4" />,
      mermaid: <GitBranch className="w-4 h-4" />,
      react: <Code2 className="w-4 h-4" />,
      code: <Terminal className="w-4 h-4" />,
      research: <Sparkles className="w-4 h-4" />,
    };

    const ARTIFACT_TYPE_STYLE: Record<string, { color: string; border: string; bg: string }> = {
      html: { color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-500/10' },
      markdown: { color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
      svg: { color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
      mermaid: { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
      react: { color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10' },
      code: { color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
      research: { color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-500/10' },
    };

    const style = ARTIFACT_TYPE_STYLE[artifactType] || ARTIFACT_TYPE_STYLE.markdown;
    const typeIcon = ARTIFACT_TYPE_ICON[artifactType] || <FileText className="w-4 h-4" />;

    const handleOpenArtifact = async () => {
      if (!artifactId) return;
      try {
        setIsOpeningArtifact(true);
        await openExistingArtifact(artifactId);
      } finally {
        setIsOpeningArtifact(false);
      }
    };

    // Loading / executing state
    if (isExecuting) {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          <span className="text-[11px] font-medium text-amber-300">{toolPart.toolName === 'updateArtifact' ? 'Actualizando artifact...' : 'Creando artifact...'}</span>
        </div>
      );
    }

    // Error state
    if (isError || output?.success === false) {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
          <XCircle className="w-4 h-4 text-red-400" />
          <span className="text-[11px] text-red-300">{getErrorMessage(output?.error)}</span>
        </div>
      );
    }

    // Success: Prominent card
    return (
      <div
        className={`
          group relative flex items-center gap-3 px-3.5 py-3 rounded-xl
          bg-gradient-to-r from-white/[0.03] to-white/[0.06]
          border ${style.border} hover:border-opacity-60
          transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-black/20
          max-w-xs
        `}
        onClick={handleOpenArtifact}
      >
        {/* Type icon */}
        <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center shrink-0 ${style.color} group-hover:scale-105 transition-transform`}>
          {typeIcon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100 truncate">{artifactTitle}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>
              {artifactType}
            </span>
            <span className="text-[10px] text-zinc-600">•</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> {toolPart.toolName === 'updateArtifact' ? 'Actualizado' : 'Guardado'}
            </span>
          </div>
        </div>

        {/* Open button */}
        <div className="shrink-0">
          {isOpeningArtifact ? (
            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition-colors" />
          )}
        </div>
      </div>
    );
  }

  // ── DEFAULT: Generic collapsible card for other tools ──
  return (
    <div 
      className={`
        inline-flex flex-col rounded-lg border transition-all duration-200 overflow-hidden
        ${isExpanded ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}
        ${isError ? 'border-red-500/20' : ''}
      `}
    >
      {/* Compact header - always visible */}
      <button
        onClick={() => isComplete && setIsExpanded(!isExpanded)}
        disabled={!isComplete}
        className={`
          flex items-center gap-2 px-2.5 py-1.5 text-left w-full min-w-0
          ${isComplete ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}
        `}
      >
        {/* Icon */}
        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
          <Icon className={`w-3 h-3 ${config.color}`} />
        </div>
        
        {/* Label */}
        <span className="text-[11px] font-medium text-zinc-400 truncate">{config.label}</span>
        
        {/* Status/Summary */}
        <span className={`text-[10px] ml-auto flex items-center gap-1.5 flex-shrink-0 ${
          isExecuting ? 'text-zinc-500' : isError ? 'text-red-400' : 'text-zinc-500'
        }`}>
          {isExecuting && <Loader2 className="w-3 h-3 animate-spin" />}
          {isComplete && <CheckCircle className="w-3 h-3 text-green-500/70" />}
          {isError && <XCircle className="w-3 h-3" />}
          <span className="max-w-[100px] truncate">{getSummary()}</span>
        </span>
        
        {/* Expand indicator */}
        {isComplete && (
          <ChevronDown className={`w-3 h-3 text-zinc-600 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </button>
      
      {/* Expandable details */}
      {isExpanded && isComplete && (
        <div className="px-2.5 pb-2 pt-1 border-t border-white/5">
          {renderDetails()}
        </div>
      )}
    </div>
  );
}

export default ToolExecutionCard;
