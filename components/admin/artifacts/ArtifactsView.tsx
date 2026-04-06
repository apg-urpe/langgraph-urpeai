'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  BookMarked,
  RefreshCw,
  Search,
  X,
  Code2,
  FileText,
  Image,
  Table,
  BarChart2,
  FileCode,
  Star,
  ExternalLink,
  Clock,
  Loader2,
  Filter,
  FolderOpen,
  Sparkles
} from 'lucide-react';
import { useArtifactStore, selectArtifacts, selectFilters } from '@/store/artifactStore';
import { useContactStore, selectUserContext } from '@/store/contactStore';
import { useAdminStore, DASHBOARD_CONTENT_MIN_WIDTH, DASHBOARD_CONTENT_MAX_WIDTH_NORMAL, DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED } from '@/store/adminStore';
import { Artifact, ArtifactType, ARTIFACT_TYPE_LABELS, ARTIFACT_TYPE_COLORS } from '@/types/artifact';

const TYPE_ICONS: Record<ArtifactType, React.ElementType> = {
  'html': Code2,
  'react': FileCode,
  'markdown': FileText,
  'svg': Image,
  'mermaid': BarChart2,
  'code': Code2,
  'research': Sparkles,
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Hace un momento';
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} horas`;
  if (diff < 604800000) return `Hace ${Math.floor(diff / 86400000)} días`;
  
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

export const ArtifactsView: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selectedType, setSelectedType] = useState<ArtifactType | 'all'>('all');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  
  // Stores
  const artifacts = useArtifactStore(selectArtifacts);
  const filters = useArtifactStore(selectFilters);
  const isLoading = useArtifactStore(state => state.isLoading);
  const error = useArtifactStore(state => state.error);
  const starredIds = useArtifactStore(state => state.starredIds);
  const fetchArtifacts = useArtifactStore(state => state.fetchArtifacts);
  const fetchStarredIds = useArtifactStore(state => state.fetchStarredIds);
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);
  const toggleStar = useArtifactStore(state => state.toggleStar);
  const clearError = useArtifactStore(state => state.clearError);
  
  const userContext = useContactStore(selectUserContext);
  const isMaximized = useAdminStore(state => state.isMaximized);
  
  const userId = userContext?.authUid;

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch artifacts on mount
  useEffect(() => {
    if (userId) {
      fetchArtifacts(userId);
      fetchStarredIds(userId);
    }
  }, [userId, fetchArtifacts, fetchStarredIds]);

  // Handlers
  const handleRefresh = useCallback(() => {
    if (userId) {
      fetchArtifacts(userId, true);
    }
  }, [userId, fetchArtifacts]);

  const handleOpenArtifact = useCallback((artifactId: string) => {
    openExistingArtifact(artifactId);
  }, [openExistingArtifact]);

  const handleToggleStar = useCallback(async (e: React.MouseEvent, artifactId: string) => {
    e.stopPropagation();
    if (userId) {
      await toggleStar(userId, artifactId);
    }
  }, [userId, toggleStar]);

  // Filter artifacts
  const filteredArtifacts = artifacts.filter(artifact => {
    if (searchInput) {
      const search = searchInput.toLowerCase();
      if (!artifact.title.toLowerCase().includes(search) && 
          !artifact.content.toLowerCase().includes(search)) {
        return false;
      }
    }
    if (selectedType !== 'all' && artifact.type !== selectedType) {
      return false;
    }
    if (showStarredOnly && !starredIds.has(artifact.id)) {
      return false;
    }
    return true;
  });

  // Container width
  const containerMaxWidth = isMobile 
    ? '100%' 
    : isMaximized 
      ? DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED 
      : DASHBOARD_CONTENT_MAX_WIDTH_NORMAL;

  // No user
  if (!userId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <BookMarked className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">
          Usuario no autenticado
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Inicia sesión para ver tus artefactos guardados.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'pb-24' : 'pb-6'}`}>
        <div 
          className="mx-auto px-4 md:px-6 py-4 md:py-6"
          style={{ 
            maxWidth: containerMaxWidth,
            minWidth: isMobile ? 'auto' : DASHBOARD_CONTENT_MIN_WIDTH 
          }}
        >
          {/* Header */}
          <div className="flex flex-col gap-3 mb-6">
            {/* Title Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <BookMarked className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-base md:text-xl font-semibold text-zinc-100">
                    Mis Artefactos
                  </h1>
                  <p className="text-xs text-zinc-500">
                    {filteredArtifacts.length} de {artifacts.length} artefactos
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg bg-zinc-800/50 border border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors disabled:opacity-50"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar artefactos..."
                  className="w-full h-9 pl-9 pr-8 bg-zinc-800/50 border border-white/5 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30 transition-colors"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              
              {/* Type Filter */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as ArtifactType | 'all')}
                className="h-9 px-3 bg-zinc-800/50 border border-white/5 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-violet-500/30"
              >
                <option value="all">Todos los tipos</option>
                {Object.entries(ARTIFACT_TYPE_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
              
              {/* Starred Filter */}
              <button
                onClick={() => setShowStarredOnly(!showStarredOnly)}
                className={`h-9 px-3 rounded-lg border text-sm flex items-center gap-1.5 transition-colors ${
                  showStarredOnly
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                    : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${showStarredOnly ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">Favoritos</span>
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <span className="text-red-400 text-sm flex-1">{error}</span>
              <button onClick={clearError} className="text-red-400 hover:text-red-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && artifacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin mb-3" />
              <p className="text-sm text-zinc-500">Cargando artefactos...</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredArtifacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium text-zinc-400 mb-2">
                {searchInput || selectedType !== 'all' || showStarredOnly
                  ? 'Sin resultados'
                  : 'Sin artefactos'}
              </h3>
              <p className="text-sm text-zinc-600 max-w-sm">
                {searchInput || selectedType !== 'all' || showStarredOnly
                  ? 'Intenta con otros filtros de búsqueda'
                  : 'Los artefactos que generes con Monica aparecerán aquí'}
              </p>
            </div>
          )}

          {/* Artifacts Grid */}
          {filteredArtifacts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredArtifacts.map((artifact) => {
                const TypeIcon = TYPE_ICONS[artifact.type] || FileText;
                const colorClasses = ARTIFACT_TYPE_COLORS[artifact.type];
                const isStarred = starredIds.has(artifact.id);
                
                return (
                  <div
                    key={artifact.id}
                    onClick={() => handleOpenArtifact(artifact.id)}
                    className="group relative bg-zinc-900/50 border border-white/5 rounded-xl p-4 hover:border-violet-500/30 hover:bg-zinc-800/50 transition-all cursor-pointer"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${colorClasses}`}>
                        <TypeIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                          {artifact.title}
                        </h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colorClasses}`}>
                          {ARTIFACT_TYPE_LABELS[artifact.type]}
                        </span>
                      </div>
                      
                      {/* Star Button */}
                      <button
                        onClick={(e) => handleToggleStar(e, artifact.id)}
                        className={`p-1.5 rounded-md transition-colors ${
                          isStarred 
                            ? 'text-amber-400 bg-amber-500/10' 
                            : 'text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    
                    {/* Preview */}
                    <div className="h-16 overflow-hidden rounded-lg bg-zinc-950/50 border border-white/5 mb-3">
                      <pre className="text-[10px] text-zinc-600 p-2 overflow-hidden">
                        {artifact.content.slice(0, 200)}...
                      </pre>
                    </div>
                    
                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(artifact.updated_at)}</span>
                      </div>
                      
                      {artifact.is_public && (
                        <div className="flex items-center gap-1 text-emerald-400">
                          <ExternalLink className="w-3 h-3" />
                          <span>Público</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Version Badge */}
                    {(artifact.version_count ?? 0) > 1 && (
                      <div className="absolute top-3 right-12 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 border border-white/5">
                        v{artifact.version_count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
