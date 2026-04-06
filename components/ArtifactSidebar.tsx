'use client';

import React, { useEffect, useState } from 'react';
import { 
  useArtifactStore, 
  selectArtifacts, 
  selectFilteredArtifacts,
  selectFilters,
  selectIsLoading,
  selectPanel
} from '../store/artifactStore';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import {
  BookMarked,
  Search,
  X,
  Code2,
  FileText,
  Image as ImageIcon,
  GitBranch,
  Component,
  Terminal,
  Star,
  StarOff,
  Pin,
  Trash2,
  ExternalLink,
  Clock,
  ChevronRight,
  Loader2,
  Filter,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { 
  Artifact, 
  ArtifactType, 
  ARTIFACT_TYPE_LABELS, 
  ARTIFACT_TYPE_COLORS,
  formatArtifactSize 
} from '../types/artifact';

interface ArtifactSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_ICONS: Record<ArtifactType, React.ReactNode> = {
  html: <Code2 className="w-4 h-4" />,
  markdown: <FileText className="w-4 h-4" />,
  svg: <ImageIcon className="w-4 h-4" />,
  mermaid: <GitBranch className="w-4 h-4" />,
  react: <Component className="w-4 h-4" />,
  code: <Terminal className="w-4 h-4" />,
  research: <Sparkles className="w-4 h-4" />
};

export const ArtifactSidebar: React.FC<ArtifactSidebarProps> = ({ isOpen, onClose }) => {
  const user = useAuthStore(state => state.user);
  const activeSessionId = useChatStore(state => state.activeSessionId);
  
  // Artifact store
  const artifacts = useArtifactStore(selectFilteredArtifacts);
  const filters = useArtifactStore(selectFilters);
  const isLoading = useArtifactStore(selectIsLoading);
  const panel = useArtifactStore(selectPanel);
  const starredIds = useArtifactStore(state => state.starredIds);
  
  const fetchArtifacts = useArtifactStore(state => state.fetchArtifacts);
  const fetchStarredIds = useArtifactStore(state => state.fetchStarredIds);
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);
  const deleteArtifact = useArtifactStore(state => state.deleteArtifact);
  const toggleStar = useArtifactStore(state => state.toggleStar);
  const setFilters = useArtifactStore(state => state.setFilters);
  const resetFilters = useArtifactStore(state => state.resetFilters);
  
  // Local state
  const [showFilters, setShowFilters] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  
  // Fetch artifacts on mount
  useEffect(() => {
    if (user && isOpen) {
      fetchArtifacts(user.id);
      fetchStarredIds(user.id);
    }
  }, [user, isOpen, fetchArtifacts, fetchStarredIds]);
  
  // Handle artifact click
  const handleArtifactClick = (artifact: Artifact) => {
    openExistingArtifact(artifact.id);
    onClose();
  };
  
  // Handle delete
  const handleDelete = async (artifactId: string) => {
    await deleteArtifact(artifactId);
    setConfirmDelete(null);
  };
  
  // Handle star toggle
  const handleToggleStar = async (e: React.MouseEvent, artifactId: string) => {
    e.stopPropagation();
    if (user) {
      await toggleStar(user.id, artifactId);
    }
  };
  
  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  };
  
  // Get session artifacts
  const sessionArtifacts = artifacts.filter(a => a.session_id === activeSessionId);
  const otherArtifacts = artifacts.filter(a => a.session_id !== activeSessionId);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="relative ml-auto w-full max-w-md h-full bg-[#0c0c0e] border-l border-white/5 flex flex-col animate-slide-in-right">
        
        {/* Header */}
        <div className="h-14 shrink-0 border-b border-white/5 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-primary-400" />
            <span className="font-bold text-zinc-100">Mis Artefactos</span>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {artifacts.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Search & Filters */}
        <div className="p-3 border-b border-white/5 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar artefactos..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>
          
          {/* Filter toggles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilters({ is_starred: !filters.is_starred })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filters.is_starred 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:bg-zinc-800'
              }`}
            >
              <Star className="w-3 h-3" />
              Favoritos
            </button>
            
            <button
              onClick={() => setFilters({ is_pinned: !filters.is_pinned })}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filters.is_pinned 
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' 
                  : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:bg-zinc-800'
              }`}
            >
              <Pin className="w-3 h-3" />
              Fijados
            </button>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showFilters || filters.type
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' 
                  : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:bg-zinc-800'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Tipo
            </button>
            
            {(filters.search || filters.is_starred || filters.is_pinned || filters.type) && (
              <button
                onClick={resetFilters}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
              >
                Limpiar
              </button>
            )}
          </div>
          
          {/* Type filter dropdown */}
          {showFilters && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {(Object.keys(ARTIFACT_TYPE_LABELS) as ArtifactType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setFilters({ type: filters.type === type ? null : type })}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    filters.type === type
                      ? ARTIFACT_TYPE_COLORS[type]
                      : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {TYPE_ICONS[type]}
                  {ARTIFACT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <BookMarked className="w-12 h-12 text-zinc-700 mb-3" />
              <p className="text-zinc-400 font-medium">No hay artefactos</p>
              <p className="text-xs text-zinc-600 mt-1">
                Los artefactos que crees aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-4">
              {/* Session artifacts */}
              {sessionArtifacts.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Esta sesión
                  </div>
                  <div className="space-y-1">
                    {sessionArtifacts.map(artifact => (
                      <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        isActive={panel.activeArtifactId === artifact.id}
                        isStarred={starredIds.has(artifact.id)}
                        onToggleStar={handleToggleStar}
                        onClick={() => handleArtifactClick(artifact)}
                        onDelete={() => setConfirmDelete(artifact.id)}
                        confirmDelete={confirmDelete === artifact.id}
                        onConfirmDelete={() => handleDelete(artifact.id)}
                        onCancelDelete={() => setConfirmDelete(null)}
                        formatTime={formatRelativeTime}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Other artifacts */}
              {otherArtifacts.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Otras sesiones
                  </div>
                  <div className="space-y-1">
                    {otherArtifacts.map(artifact => (
                      <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        isActive={panel.activeArtifactId === artifact.id}
                        isStarred={starredIds.has(artifact.id)}
                        onToggleStar={handleToggleStar}
                        onClick={() => handleArtifactClick(artifact)}
                        onDelete={() => setConfirmDelete(artifact.id)}
                        confirmDelete={confirmDelete === artifact.id}
                        onConfirmDelete={() => handleDelete(artifact.id)}
                        onCancelDelete={() => setConfirmDelete(null)}
                        formatTime={formatRelativeTime}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

// Artifact Card Component
interface ArtifactCardProps {
  artifact: Artifact;
  isActive: boolean;
  isStarred: boolean;
  onToggleStar: (e: React.MouseEvent, id: string) => void;
  onClick: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  formatTime: (date: string) => string;
}

const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  isActive,
  isStarred,
  onToggleStar,
  onClick,
  onDelete,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
  formatTime
}) => {
  return (
    <div
      onClick={onClick}
      className={`
        group relative p-3 rounded-lg cursor-pointer transition-all
        ${isActive 
          ? 'bg-primary-500/10 border border-primary-500/30' 
          : 'bg-zinc-900/50 border border-white/5 hover:bg-zinc-800/50 hover:border-white/10'
        }
      `}
    >
      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div 
          className="absolute inset-0 bg-red-500/10 backdrop-blur-sm rounded-lg flex items-center justify-center gap-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onConfirmDelete}
            className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600"
          >
            Eliminar
          </button>
          <button
            onClick={onCancelDelete}
            className="px-3 py-1.5 bg-zinc-700 text-white text-xs font-bold rounded-lg hover:bg-zinc-600"
          >
            Cancelar
          </button>
        </div>
      )}
      
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`
          w-9 h-9 rounded-lg flex items-center justify-center shrink-0
          ${ARTIFACT_TYPE_COLORS[artifact.type]}
        `}>
          {TYPE_ICONS[artifact.type]}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-zinc-100 truncate">
              {artifact.title}
            </span>
            {artifact.is_pinned && (
              <Pin className="w-3 h-3 text-primary-400 shrink-0" />
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
            <span className="uppercase tracking-wider">
              {ARTIFACT_TYPE_LABELS[artifact.type]}
            </span>
            <span>•</span>
            <span>{formatArtifactSize(artifact.content)}</span>
            <span>•</span>
            <Clock className="w-3 h-3" />
            <span>{formatTime(artifact.updated_at)}</span>
          </div>
          
          {/* Tags */}
          {artifact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {artifact.tags.slice(0, 3).map(tag => (
                <span 
                  key={tag}
                  className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] rounded"
                >
                  {tag}
                </span>
              ))}
              {artifact.tags.length > 3 && (
                <span className="text-[9px] text-zinc-600">
                  +{artifact.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => onToggleStar(e, artifact.id)}
            className={`p-1.5 rounded transition-colors ${
              isStarred 
                ? 'text-amber-400 hover:text-amber-300' 
                : 'text-zinc-500 hover:text-amber-400'
            }`}
            title={isStarred ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          >
            {isStarred ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-zinc-500 hover:text-red-400 rounded transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Chevron indicator */}
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

export default ArtifactSidebar;
