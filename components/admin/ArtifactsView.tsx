'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { 
  FileCode2, 
  FileText, 
  Image as ImageIcon, 
  Search, 
  Star, 
  Clock, 
  Eye, 
  GitFork,
  Pin,
  Loader2,
  Filter,
  X,
  Sparkles
} from 'lucide-react';
import { useArtifactStore } from '@/store/artifactStore';
import { useAuthStore } from '@/store/authStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { Artifact, ArtifactType } from '@/types/artifact';

// Type icons mapping
const typeIcons: Record<ArtifactType, React.ReactNode> = {
  html: <FileCode2 className="w-4 h-4" />,
  markdown: <FileText className="w-4 h-4" />,
  svg: <ImageIcon className="w-4 h-4" />,
  mermaid: <GitFork className="w-4 h-4" />,
  react: <FileCode2 className="w-4 h-4 text-cyan-400" />,
  code: <FileCode2 className="w-4 h-4 text-emerald-400" />,
  research: <Sparkles className="w-4 h-4 text-violet-400" />,
};

const typeLabels: Record<ArtifactType, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  svg: 'SVG',
  mermaid: 'Diagrama',
  react: 'React',
  code: 'Código',
  research: 'Investigación',
};

/**
 * PERFORMANCE: Memoized Artifact Card to improve list rendering.
 */
const ArtifactCard = React.memo(({ 
  artifact, 
  onOpen 
}: { 
  artifact: Artifact; 
  onOpen: (id: string) => void;
}) => (
  <button
    onClick={() => onOpen(artifact.id)}
    className="group p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-left hover:border-primary-500/50 hover:bg-zinc-900 transition-all h-full flex flex-col"
  >
    {/* Header */}
    <div className="flex items-start gap-3 mb-2">
      <div className="p-2 bg-zinc-800 rounded-lg shrink-0">
        {typeIcons[artifact.type]}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-zinc-100 truncate group-hover:text-primary-400 transition-colors text-sm">
          {artifact.title}
        </h3>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{typeLabels[artifact.type]}</span>
      </div>
      {artifact.is_pinned && (
        <Pin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
      )}
    </div>

    {/* Description */}
    {artifact.description && (
      <p className="text-xs text-zinc-400 line-clamp-2 mb-3 flex-1">
        {artifact.description}
      </p>
    )}

    {/* Tags */}
    {artifact.tags.length > 0 && (
      <div className="flex flex-wrap gap-1 mb-3">
        {artifact.tags.slice(0, 3).map((tag, i) => (
          <span key={i} className="px-1.5 py-0.5 bg-zinc-800/50 rounded text-[10px] text-zinc-500 border border-white/[0.03]">
            {tag}
          </span>
        ))}
        {artifact.tags.length > 3 && (
          <span className="px-1.5 py-0.5 text-[10px] text-zinc-600">
            +{artifact.tags.length - 3}
          </span>
        )}
      </div>
    )}

    {/* Footer */}
    <div className="flex items-center gap-4 text-[10px] text-zinc-600 mt-auto pt-2 border-t border-white/[0.02]">
      <span className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {new Date(artifact.updated_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
      </span>
      {artifact.view_count > 0 && (
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {artifact.view_count}
        </span>
      )}
    </div>
  </button>
));
ArtifactCard.displayName = 'ArtifactCard';

export const ArtifactsView: React.FC = () => {
  const user = useAuthStore(state => state.user);
  const { artifacts, isLoading, fetchArtifacts, openExistingArtifact } = useArtifactStore();
  
  // Engagement tracking
  usePageTracking('artifacts');
  const trackAction = useActionTracking('artifacts');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<ArtifactType | 'all'>('all');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchArtifacts(user.id);
    }
  }, [user?.id, fetchArtifacts]);

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter(artifact => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          artifact.title.toLowerCase().includes(query) ||
          artifact.description?.toLowerCase().includes(query) ||
          artifact.tags.some(tag => tag.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }
      
      // Type filter
      if (selectedType !== 'all' && artifact.type !== selectedType) return false;
      
      // Pinned filter
      if (showPinnedOnly && !artifact.is_pinned) return false;
      
      return true;
    });
  }, [artifacts, searchQuery, selectedType, showPinnedOnly]);

  const handleOpenArtifact = async (artifactId: string) => {
    trackAction('artifacts.open', { artifactId });
    await openExistingArtifact(artifactId);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">Artefactos</h2>
        
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar artefactos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-primary-500/50"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex gap-2">
            <select
              value={selectedType}
              onChange={(e) => {
                const type = e.target.value as ArtifactType | 'all';
                setSelectedType(type);
                trackAction('artifacts.filter_type', { type });
              }}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-primary-500/50"
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(typeLabels).map(([type, label]) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
            
            <button
              onClick={() => setShowPinnedOnly(!showPinnedOnly)}
              className={`p-2 rounded-lg border transition-colors ${
                showPinnedOnly 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Solo fijados"
            >
              <Pin className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
            <FileCode2 className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">
              {searchQuery || selectedType !== 'all' || showPinnedOnly 
                ? 'No se encontraron artefactos' 
                : 'No hay artefactos guardados'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                onOpen={handleOpenArtifact}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-3 border-t border-zinc-800/50 text-xs text-zinc-500 text-center">
        {filteredArtifacts.length} de {artifacts.length} artefactos
      </div>
    </div>
  );
};

export default ArtifactsView;