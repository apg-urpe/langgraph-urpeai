'use client';

import React from 'react';
import Image from 'next/image';
import { Bot, ChevronRight, Calendar, Globe, Archive } from 'lucide-react';
import { 
  useAgentsStore, 
  selectActiveAgents, 
  selectArchivedAgents, 
  selectShowArchived, 
  selectSelectedAgentId 
} from '../../../store/agentsStore';
import { Agent } from '../../../types/agent';

interface AgentsListProps {
  onSelectAgent: (agentId: number) => void;
}

export const AgentsList: React.FC<AgentsListProps> = ({ onSelectAgent }) => {
  const activeAgents = useAgentsStore(selectActiveAgents);
  const archivedAgents = useAgentsStore(selectArchivedAgents);
  const showArchived = useAgentsStore(selectShowArchived);
  const selectedAgentId = useAgentsStore(selectSelectedAgentId);
  
  // Show archived agents or active agents based on toggle
  const agents = showArchived ? archivedAgents : activeAgents;
  
  if (agents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
          <Bot className="w-7 h-7 text-zinc-500" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Sin agentes</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          No hay agentes configurados para esta empresa. Crea uno nuevo para comenzar.
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {/* Archived section header */}
      {showArchived && agents.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1 mb-2">
          <Archive className="w-4 h-4 text-zinc-500" />
          <span className="text-xs text-zinc-500 font-medium">
            {agents.length} agente{agents.length !== 1 ? 's' : ''} archivado{agents.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          isSelected={agent.id === selectedAgentId}
          onClick={() => onSelectAgent(agent.id)}
        />
      ))}
    </div>
  );
};

interface AgentCardProps {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, isSelected, onClick }) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };
  
  // Get summary of instructions (first 100 chars)
  const instructionsSummary = agent.instrucciones 
    ? agent.instrucciones.slice(0, 100) + (agent.instrucciones.length > 100 ? '...' : '')
    : 'Sin instrucciones configuradas';
  
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded-xl border transition-all group
        ${isSelected 
          ? 'bg-violet-500/10 border-violet-500/30 shadow-lg shadow-violet-500/5' 
          : 'bg-[#131316] border-white/5 hover:border-white/10 hover:bg-zinc-900/50'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`
          w-12 h-12 rounded-xl flex items-center justify-center shrink-0
          ${isSelected 
            ? 'bg-violet-500/20 border border-violet-500/30' 
            : 'bg-zinc-800/50 border border-white/5'
          }
        `}>
          {agent.url_imagen_agente ? (
            <div className="relative w-full h-full">
              <Image 
                src={agent.url_imagen_agente} 
                alt={agent.nombre_agente}
                fill
                className="rounded-xl object-cover"
              />
            </div>
          ) : (
            <Bot className={`w-6 h-6 ${isSelected ? 'text-violet-400' : 'text-zinc-500'}`} />
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold truncate ${isSelected ? 'text-violet-200' : 'text-zinc-200'}`}>
              {agent.nombre_agente}
            </h3>
            {agent.role?.nombre_rol && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-800 text-zinc-400 border border-white/5">
                {agent.role.nombre_rol}
              </span>
            )}
          </div>
          
          <p className="text-xs text-zinc-500 line-clamp-2 mb-2">
            {instructionsSummary}
          </p>
          
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {agent.idioma?.toUpperCase() || 'ES'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(agent.fecha_actualizacion)}
            </span>
          </div>
        </div>
        
        {/* Arrow */}
        <ChevronRight className={`
          w-5 h-5 shrink-0 transition-transform
          ${isSelected ? 'text-violet-400' : 'text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5'}
        `} />
      </div>
    </button>
  );
};
