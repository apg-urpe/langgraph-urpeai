'use client';

import React, { useEffect, useState } from 'react';
import { Bot, Plus, Shield, AlertTriangle, RefreshCw, Settings2, Archive, Eye, EyeOff } from 'lucide-react';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '../../../store/contactStore';
import { 
  useAgentsStore, 
  selectAgents, 
  selectActiveAgents,
  selectArchivedAgents,
  selectShowArchived,
  selectSelectedAgentId, 
  selectIsLoadingAgents, 
  selectAgentsError 
} from '../../../store/agentsStore';
import { AgentsList } from './AgentsList';
import { AgentConfigPanel } from './AgentConfigPanel';
import { AgentRolesSection } from './AgentRolesSection';
import { CreateAgentModal } from './CreateAgentModal';

type AgentViewMode = 'list' | 'config' | 'roles';

export const AgentsSection: React.FC = () => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);
  const allAgents = useAgentsStore(selectAgents);
  const activeAgents = useAgentsStore(selectActiveAgents);
  const archivedAgents = useAgentsStore(selectArchivedAgents);
  const showArchived = useAgentsStore(selectShowArchived);
  const selectedAgentId = useAgentsStore(selectSelectedAgentId);
  const isLoading = useAgentsStore(selectIsLoadingAgents);
  const error = useAgentsStore(selectAgentsError);
  const setShowArchived = useAgentsStore(s => s.setShowArchived);
  
  const fetchAgents = useAgentsStore(s => s.fetchAgents);
  const selectAgent = useAgentsStore(s => s.selectAgent);
  const canViewAgents = useAgentsStore(s => s.canViewAgents);
  const canEditAgents = useAgentsStore(s => s.canEditAgents);
  const canEditRoles = useAgentsStore(s => s.canEditRoles);
  
  const [viewMode, setViewMode] = useState<AgentViewMode>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const userRoleId = userContext?.roleId;
  const hasAccess = canViewAgents(userRoleId);
  const canEdit = canEditAgents(userRoleId);
  const canManageRoles = canEditRoles(userRoleId);
  
  // Fetch agents on enterprise change (force refresh to avoid stale cache)
  useEffect(() => {
    if (selectedEnterpriseId && hasAccess) {
      selectAgent(null);
      setViewMode('list');
      fetchAgents(selectedEnterpriseId, true);
    }
  }, [selectedEnterpriseId, hasAccess, fetchAgents, selectAgent]);
  
  // Switch to config view when agent is selected
  useEffect(() => {
    if (selectedAgentId && viewMode === 'list') {
      setViewMode('config');
    }
  }, [selectedAgentId, viewMode]);
  
  // No access
  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <Shield className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Acceso Restringido</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          Solo los administradores pueden acceder a la configuración de agentes.
        </p>
      </div>
    );
  }
  
  // Loading state
  if (isLoading && allAgents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-primary-500/20 border-t-primary-500 animate-spin" />
          <Bot className="w-5 h-5 text-primary-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm text-zinc-400 mt-4">Cargando agentes...</p>
      </div>
    );
  }
  
  const handleRefresh = () => {
    if (selectedEnterpriseId) {
      fetchAgents(selectedEnterpriseId, true);
    }
  };
  
  const handleBackToList = () => {
    selectAgent(null);
    setViewMode('list');
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {viewMode === 'roles' ? 'Roles de Agentes' : 'Agentes IA'}
            </h2>
            <p className="text-xs text-zinc-500">
              {viewMode === 'roles' 
                ? 'Gestión de roles personalizados'
                : showArchived 
                  ? `${archivedAgents.length} archivado${archivedAgents.length !== 1 ? 's' : ''}`
                  : `${activeAgents.length} activo${activeAgents.length !== 1 ? 's' : ''}${archivedAgents.length > 0 ? ` · ${archivedAgents.length} archivado${archivedAgents.length !== 1 ? 's' : ''}` : ''}`
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Toggle archived view */}
          {viewMode === 'list' && archivedAgents.length > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`p-2 rounded-lg border transition-all ${
                showArchived 
                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' 
                  : 'border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
              }`}
              title={showArchived ? 'Ver agentes activos' : 'Ver archivados'}
            >
              {showArchived ? <Eye className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
          )}
          
          {/* Roles button (only for role 1) */}
          {canManageRoles && viewMode !== 'roles' && (
            <button
              onClick={() => setViewMode('roles')}
              className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all"
              title="Gestionar Roles"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          {/* Create agent */}
          {canEdit && viewMode === 'list' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all text-xs font-medium"
            >
              <Plus className="w-4 h-4" />
              Nuevo Agente
            </button>
          )}
        </div>
      </div>
      
      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
          </div>
        </div>
      )}
      
      {/* Read-only banner */}
      {!canEdit && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 mb-4">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Modo solo lectura</p>
            <p className="text-xs text-amber-300/70 mt-0.5">
              Solo puedes ver la configuración de agentes.
            </p>
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'roles' ? (
          <AgentRolesSection onBack={() => setViewMode('list')} />
        ) : viewMode === 'config' && selectedAgentId ? (
          <AgentConfigPanel onBack={handleBackToList} />
        ) : (
          <AgentsList onSelectAgent={(id: number) => {
            selectAgent(id);
            setViewMode('config');
          }} />
        )}
      </div>
      
      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          enterpriseId={selectedEnterpriseId!}
        />
      )}
    </div>
  );
};
