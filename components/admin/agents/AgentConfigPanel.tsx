'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  Bot, 
  ChevronDown, 
  ChevronRight,
  User,
  Brain,
  FileText,
  ShieldAlert,
  Settings2,
  Archive,
  RotateCcw,
  History,
  AlertTriangle,
  Radio
} from 'lucide-react';
import { useContactStore, selectUserContext } from '../../../store/contactStore';
import { 
  useAgentsStore, 
  selectIsSaving, 
  selectSaveError,
  selectUnsavedChanges
} from '../../../store/agentsStore';
import { 
  Agent, 
  AgentFieldCategory, 
  AGENT_CATEGORIES,
  getFieldsByCategory,
  isFieldVisibleForRole
} from '../../../types/agent';
import { AgentFieldCard } from './AgentFieldCard';
import { AgentFieldEditor } from './AgentFieldEditor';
import { AgentHistoryViewer } from './AgentHistoryViewer';

interface AgentConfigPanelProps {
  onBack: () => void;
}

const CATEGORY_ICONS: Record<AgentFieldCategory, React.ElementType> = {
  identidad: User,
  comportamiento: Brain,
  instrucciones: FileText,
  restricciones: ShieldAlert,
  avanzado: Settings2
};

export const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({ onBack }) => {
  const userContext = useContactStore(selectUserContext);
  const isSaving = useAgentsStore(selectIsSaving);
  const saveError = useAgentsStore(selectSaveError);
  const unsavedChanges = useAgentsStore(selectUnsavedChanges);
  
  const getSelectedAgent = useAgentsStore(s => s.getSelectedAgent);
  const updateAgent = useAgentsStore(s => s.updateAgent);
  const archiveAgent = useAgentsStore(s => s.archiveAgent);
  const unarchiveAgent = useAgentsStore(s => s.unarchiveAgent);
  const canEditAgents = useAgentsStore(s => s.canEditAgents);
  const setUnsavedChanges = useAgentsStore(s => s.setUnsavedChanges);
  const discardChanges = useAgentsStore(s => s.discardChanges);
  
  const agent = getSelectedAgent();
  const userRoleId = userContext?.roleId ?? 999;
  const canEdit = canEditAgents(userRoleId);
  
  // Start with all categories collapsed when selecting a new agent
  const [expandedCategories, setExpandedCategories] = useState<Set<AgentFieldCategory>>(new Set());
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  
  // Merge agent with unsaved changes for display
  const displayAgent: Agent | null = agent ? {
    ...agent,
    ...unsavedChanges
  } : null;
  
  const hasChanges = unsavedChanges && Object.keys(unsavedChanges).length > 0;
  
  const toggleCategory = (category: AgentFieldCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  
  const handleFieldChange = (key: keyof Agent, value: string | number | null | Record<string, unknown>) => {
    setUnsavedChanges({
      ...unsavedChanges,
      [key]: value
    });
  };
  
  const handleSaveWithConfirm = () => {
    setShowSaveConfirm(true);
  };
  
  const handleSave = async () => {
    if (!agent || !unsavedChanges) return;
    setShowSaveConfirm(false);
    
    const success = await updateAgent(agent.id, unsavedChanges);
    if (success) {
      // Changes are cleared automatically in store
    }
  };
  
  const handleArchive = async () => {
    if (!agent) return;
    const success = await archiveAgent(agent.id);
    if (success) {
      onBack();
    }
  };
  
  const handleUnarchive = async () => {
    if (!agent) return;
    await unarchiveAgent(agent.id);
  };
  
  const handleDiscard = () => {
    if (confirm('¿Descartar cambios sin guardar?')) {
      discardChanges();
    }
  };
  
  if (!agent || !displayAgent) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-zinc-500">Selecciona un agente</p>
      </div>
    );
  }
  
  // Filter categories based on user role
  const visibleCategories = AGENT_CATEGORIES.filter(cat => {
    // Avanzado only for role 1
    if (cat.id === 'avanzado' && userRoleId > 1) return false;
    return true;
  });
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center relative overflow-hidden">
            {displayAgent.url_imagen_agente ? (
              <Image 
                src={displayAgent.url_imagen_agente} 
                alt={displayAgent.nombre_agente}
                fill
                className="rounded-xl object-cover"
              />
            ) : (
              <Bot className="w-5 h-5 text-violet-400" />
            )}
          </div>
          
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{displayAgent.nombre_agente}</h2>
            <p className="text-xs text-zinc-500">
              {displayAgent.role?.nombre_rol || 'Sin rol asignado'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* History button */}
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
            title="Ver historial"
          >
            <History className="w-4 h-4" />
          </button>
          
          {/* Archive/Unarchive button */}
          {canEdit && (
            agent?.archivado ? (
              <button
                onClick={handleUnarchive}
                disabled={isSaving}
                className="p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 transition-all"
                title="Restaurar agente"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 transition-all"
                title="Archivar agente"
              >
                <Archive className="w-4 h-4" />
              </button>
            )
          )}
          
          {/* Discard button */}
          {hasChanges && (
            <button
              onClick={handleDiscard}
              className="px-3 py-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 text-xs"
            >
              Descartar
            </button>
          )}
          
          {/* Save button */}
          <button
            onClick={handleSaveWithConfirm}
            disabled={!canEdit || !hasChanges || isSaving}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-xs font-medium
              ${hasChanges && canEdit
                ? 'bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20'
                : 'bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed'
              }
            `}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
      
      {/* Warning banner - Changes affect live channels */}
      <div className="mt-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-start gap-2">
        <Radio className="w-4 h-4 text-violet-400 shrink-0 mt-0.5 animate-pulse" />
        <div>
          <p className="text-xs text-violet-300 font-medium">Agente en producción</p>
          <p className="text-[10px] text-violet-400/70 mt-0.5">
            Los cambios aquí afectan directamente las respuestas del agente en WhatsApp y otros canales.
          </p>
        </div>
      </div>
      
      {/* Archived banner */}
      {agent?.archivado && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-zinc-500/10 border border-zinc-500/20 flex items-start gap-2">
          <Archive className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-zinc-300 font-medium">Agente archivado</p>
            <p className="text-[10px] text-zinc-400/70 mt-0.5">
              Este agente está inactivo y no responde mensajes. Restaura para reactivarlo.
            </p>
          </div>
        </div>
      )}
      
      {/* Unsaved changes indicator */}
      {hasChanges && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          ⚠️ Tienes cambios sin guardar ({Object.keys(unsavedChanges!).length} campo{Object.keys(unsavedChanges!).length !== 1 ? 's' : ''})
        </div>
      )}
      
      {/* Save error */}
      {saveError && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          Error: {saveError}
        </div>
      )}
      
      {/* Content - Collapsible sections */}
      <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
        {visibleCategories.map(category => {
          const Icon = CATEGORY_ICONS[category.id];
          const isExpanded = expandedCategories.has(category.id);
          const fields = getFieldsByCategory(category.id, userRoleId);
          
          // Skip empty categories
          if (fields.length === 0) return null;
          
          return (
            <div 
              key={category.id}
              className="bg-[#131316] border border-white/5 rounded-xl overflow-hidden"
            >
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center
                    ${isExpanded ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800/50 text-zinc-500'}
                  `}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-sm font-medium ${isExpanded ? 'text-zinc-200' : 'text-zinc-400'}`}>
                    {category.label}
                  </span>
                  <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded-full">
                    {fields.length} campo{fields.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                )}
              </button>
              
              {/* Category content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {fields.map(field => (
                    <AgentFieldCard
                      key={field.key}
                      field={field}
                      value={(displayAgent as any)[field.key]}
                      canEdit={canEdit && isFieldVisibleForRole(field, userRoleId)}
                      onEdit={() => setEditingFieldKey(field.key)}
                      onChange={(value: string | number | null | Record<string, unknown>) => handleFieldChange(field.key, value)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Field Editor Modal */}
      {editingFieldKey && displayAgent && (
        <AgentFieldEditor
          agent={displayAgent}
          fieldKey={editingFieldKey}
          onClose={() => setEditingFieldKey(null)}
          onSave={(value: string | number | null | Record<string, unknown>) => {
            handleFieldChange(editingFieldKey as keyof Agent, value);
            setEditingFieldKey(null);
          }}
          canEdit={canEdit}
        />
      )}
      
      {/* History Modal */}
      {showHistory && agent && (
        <AgentHistoryViewer
          agentId={agent.id}
          onClose={() => setShowHistory(false)}
        />
      )}
      
      {/* Archive Confirmation */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#131316] border border-amber-500/20 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Archive className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Archivar Agente</h3>
                <p className="text-sm text-zinc-500">El agente dejará de responder mensajes</p>
              </div>
            </div>
            
            <p className="text-sm text-zinc-400 mb-6">
              ¿Estás seguro de que deseas archivar <strong className="text-zinc-200">{agent?.nombre_agente}</strong>? 
              El agente dejará de estar activo en los canales de comunicación. Podrás restaurarlo en cualquier momento.
            </p>
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="px-4 py-2 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleArchive}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 text-sm font-medium flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                Archivar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Save Confirmation - Warning about live changes */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#131316] border border-violet-500/20 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Confirmar Cambios</h3>
                <p className="text-sm text-zinc-500">Los cambios se aplicarán inmediatamente</p>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
              <p className="text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Importante:</strong> Estos cambios afectarán inmediatamente las respuestas 
                  del agente en WhatsApp y otros canales de comunicación conectados.
                </span>
              </p>
            </div>
            
            <p className="text-sm text-zinc-400 mb-6">
              Estás a punto de modificar {Object.keys(unsavedChanges || {}).length} campo{Object.keys(unsavedChanges || {}).length !== 1 ? 's' : ''} 
              de <strong className="text-zinc-200">{agent?.nombre_agente}</strong>.
            </p>
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-4 py-2 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-sm"
              >
                Revisar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 text-sm font-medium flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Confirmar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
