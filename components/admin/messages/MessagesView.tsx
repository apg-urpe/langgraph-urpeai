import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Phone, Globe, Clock, ChevronRight, Search, X, Loader2 } from 'lucide-react';
import {
  useContactStore,
  selectRecentConversations,
  selectIsLoading,
  selectIsLoadingRecentConversations,
  selectIsLoadingMoreRecentConversations,
  selectRecentConversationsHasMore,
  selectRecentConversationsTotalCount,
} from '../../../store/contactStore';
import { ConversationMessages } from '../contact-details/ConversationMessages';

export const MessagesView: React.FC = () => {
  const recentConversations = useContactStore(selectRecentConversations);
  const isLoadingGlobal = useContactStore(selectIsLoading);
  const isLoadingRecent = useContactStore(selectIsLoadingRecentConversations);
  const isLoadingMore = useContactStore(selectIsLoadingMoreRecentConversations);
  const hasMore = useContactStore(selectRecentConversationsHasMore);
  const totalCount = useContactStore(selectRecentConversationsTotalCount);
  const isLoading = isLoadingGlobal || isLoadingRecent;

  const fetchRecentConversations = useContactStore(state => state.fetchRecentConversations);
  const fetchMoreRecentConversations = useContactStore(state => state.fetchMoreRecentConversations);
  const setRecentSearch = useContactStore(state => state.setRecentConversationsSearch);

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRecentConversations();
  }, [fetchRecentConversations]);

  // Debounced search for conversations
  useEffect(() => {
    const timer = setTimeout(() => {
      setRecentSearch(searchInput);
      fetchRecentConversations(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, setRecentSearch, fetchRecentConversations]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          void fetchMoreRecentConversations();
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, fetchMoreRecentConversations]);

  const handleRefresh = () => {
    fetchRecentConversations(true);
  };

  if (selectedConversationId) {
    return (
      <div className="h-full flex flex-col">
        <ConversationMessages
          conversationId={selectedConversationId}
          onBack={() => setSelectedConversationId(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-4 pb-4 border-b border-white/5">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary-400" />
              Centro de Mensajes
            </h2>
            <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider font-medium">
              {searchInput
                ? 'Resultados de búsqueda'
                : `${recentConversations.length}${totalCount > 0 ? ` de ${totalCount}` : ''} conversaciones`}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-colors"
            title="Actualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <div className="absolute inset-0 bg-primary-500/10 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center bg-[#131316] border border-white/10 rounded-xl overflow-hidden focus-within:border-primary-500/50 transition-colors">
            <Search className="w-4 h-4 text-zinc-500 ml-3 shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar en resúmenes o nombres de contacto..."
              className="w-full bg-transparent border-none text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-0 py-2.5 px-3"
            />
            {isLoading && searchInput && (
              <Loader2 className="w-4 h-4 text-primary-400 animate-spin mr-3" />
            )}
            {searchInput && !isLoading && (
              <button
                onClick={() => setSearchInput('')}
                className="p-2 text-zinc-500 hover:text-zinc-300 mr-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2 space-y-2">
        {isLoading && recentConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-2" />
            <span className="text-xs">Cargando conversaciones...</span>
          </div>
        ) : recentConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <MessageSquare className="w-10 h-10 mb-3 opacity-20" />
            <span className="text-sm">No hay conversaciones recientes</span>
          </div>
        ) : (
          <>
            {recentConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversationId(conv.id)}
                className="bg-zinc-900/40 border border-white/5 rounded-lg p-3 hover:border-white/10 hover:bg-white/[0.02] transition-colors cursor-pointer group active:scale-[0.99]"
              >
                <div className="flex justify-between items-start gap-3">
                  {/* Icon & Info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      conv.canal === 'whatsapp' ? 'bg-green-500/10 text-green-400' :
                      conv.canal === 'web' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {conv.canal === 'whatsapp' ? <Phone className="w-4 h-4" /> :
                       conv.canal === 'web' ? <Globe className="w-4 h-4" /> :
                       <MessageSquare className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-zinc-200 truncate">
                          {conv.contact
                            ? `${conv.contact.nombre || ''} ${conv.contact.apellido || ''}`.trim() || 'Contacto sin nombre'
                            : 'Usuario Desconocido'}
                        </h3>
                        {conv.contact?.telefono && (
                          <span className="text-xs text-zinc-500 hidden sm:inline-block">
                            {conv.contact.telefono}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-500">
                          ID: {conv.id}
                        </span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-xs text-zinc-500 capitalize">
                          {conv.canal}
                        </span>
                        {conv.estado && (
                          <>
                            <span className="text-zinc-700">•</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              conv.estado === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {conv.estado}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Time & Arrow */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(conv.fecha_inicio).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </div>

                {/* Summary or Intelligence preview if available */}
                {(conv.resumen || (conv.metadata as any)?.summary) && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {conv.resumen || (conv.metadata as any)?.summary}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={scrollSentinelRef} className="py-1">
              {isLoadingMore && (
                <div className="flex items-center justify-center py-4 text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-xs">Cargando más conversaciones...</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
