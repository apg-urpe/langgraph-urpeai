'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, 
  X, 
  Check, 
  Loader2,
  Users,
  MessageSquare,
  Database,
  Sparkles,
  Phone,
  Mail
} from 'lucide-react';
import { Contact, SearchScope } from '@/types/contact';
import { useContactStore } from '@/store/contactStore';
import { normalizePhone, looksLikePhone } from '@/lib/ui-helpers';
import { supabase } from '@/lib/supabase-client';

interface ContactSearchInputProps {
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact | null) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxResults?: number;
  className?: string;
}

interface SearchResult extends Contact {
  matchSource?: 'basic' | 'messages' | 'metadata' | 'notes';
  matchPreview?: string;
  score?: number;
}

const searchScopeOptions: { value: SearchScope; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'all', label: 'Super Búsqueda', icon: <Sparkles className="w-3.5 h-3.5" />, desc: 'Contactos, mensajes, metadata' },
  { value: 'basic', label: 'Básica', icon: <Users className="w-3.5 h-3.5" />, desc: 'Nombre, teléfono, email' },
  { value: 'messages', label: 'Mensajes', icon: <MessageSquare className="w-3.5 h-3.5" />, desc: 'Contenido de conversaciones' },
  { value: 'metadata', label: 'Metadata', icon: <Database className="w-3.5 h-3.5" />, desc: 'Datos personalizados' },
];

export const ContactSearchInput: React.FC<ContactSearchInputProps> = ({
  selectedContact,
  onSelectContact,
  placeholder = 'Buscar contacto...',
  disabled = false,
  autoFocus = false,
  maxResults = 8,
  className = ''
}) => {
  const contacts = useContactStore(s => s.contacts);
  const selectedEnterpriseId = useContactStore(s => s.selectedEnterpriseId);
  
  const [searchInput, setSearchInput] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [serverResults, setServerResults] = useState<SearchResult[]>([]);
  const [currentSearchScope, setCurrentSearchScope] = useState<SearchScope>('basic');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const basicSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const deepSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const lastServerSearchRef = useRef<string>('');

  const currentScope = searchScopeOptions.find(s => s.value === currentSearchScope) || searchScopeOptions[1];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update input when selectedContact changes externally
  useEffect(() => {
    if (selectedContact) {
      setSearchInput(`${selectedContact.nombre || ''} ${selectedContact.apellido || ''}`.trim());
    }
  }, [selectedContact]);

  // Local filter for instant feedback
  const localFilteredContacts = useMemo((): SearchResult[] => {
    if (!searchInput || searchInput.length < 2) return [];
    
    const term = searchInput.toLowerCase().trim().replace(/\s+/g, ' ');
    const searchWords = term.split(' ').filter(w => w.length >= 2);
    const isMultiWordSearch = searchWords.length > 1;
    
    return contacts
      .filter(contact => {
        const nombre = (contact.nombre || '').toLowerCase();
        const apellido = (contact.apellido || '').toLowerCase();
        const telefono = (contact.telefono || '').toLowerCase();
        const email = (contact.email || '').toLowerCase();
        const fullName = `${nombre} ${apellido}`;
        
        // Phone normalization
        const isPhoneSearch = looksLikePhone(term);
        const normalizedTerm = isPhoneSearch ? normalizePhone(term) : '';
        const normalizedTelefono = isPhoneSearch ? normalizePhone(telefono) : '';
        const phoneMatch = isPhoneSearch && normalizedTelefono.includes(normalizedTerm);
        
        // For multi-word search, check if ANY word matches
        if (isMultiWordSearch) {
          const matchesAnyWord = searchWords.some(word => 
            nombre.includes(word) || apellido.includes(word) || fullName.includes(word)
          );
          if (matchesAnyWord) return true;
        }
        
        return nombre.includes(term) ||
               apellido.includes(term) ||
               telefono.includes(term) ||
               phoneMatch ||
               email.includes(term) ||
               fullName.includes(term);
      })
      .map(contact => {
        let score = 0;
        const nombre = (contact.nombre || '').toLowerCase();
        const apellido = (contact.apellido || '').toLowerCase();
        const fullName = `${nombre} ${apellido}`;
        
        // ============ MULTI-WORD SEARCH SCORING ============
        if (isMultiWordSearch) {
          const matchedWords = searchWords.filter(word => 
            nombre.includes(word) || apellido.includes(word)
          );
          const matchRatio = matchedWords.length / searchWords.length;
          
          if (matchRatio === 1) {
            score += 500; // All words match
            if (fullName.includes(term)) score += 200;
            if (searchWords.every(w => nombre.includes(w))) score += 100;
          } else if (matchRatio >= 0.5) {
            score += 100 * matchedWords.length;
          } else {
            score += 30 * matchedWords.length;
          }
          
          // Word order bonus
          const nameWords = fullName.split(' ');
          let lastIndex = -1;
          for (const searchWord of searchWords) {
            const idx = nameWords.findIndex((nw, i) => i > lastIndex && nw.includes(searchWord));
            if (idx > lastIndex) {
              score += 20;
              lastIndex = idx;
            }
          }
        } else {
          // ============ SINGLE WORD SEARCH SCORING ============
          if (nombre.startsWith(term) || apellido.startsWith(term)) score += 100;
          else if (fullName.includes(term)) score += 80;
        }
        
        if (contact.telefono?.includes(term)) score += 60;
        if (contact.email?.toLowerCase().includes(term)) score += 40;
        
        return { ...contact, score, matchSource: 'basic' as const };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, maxResults);
  }, [contacts, searchInput, maxResults]);

  // Deep search function - Uses optimized RPC
  const performDeepSearch = useCallback(async (term: string, scope: SearchScope) => {
    if (!selectedEnterpriseId || term.length < 2) return;
    
    setIsSearching(true);

    try {
      // Use optimized RPC function for deep search
      const { data: rpcResults, error } = await supabase
        .rpc('super_search_contacts', {
          p_enterprise_id: selectedEnterpriseId,
          p_search_query: term,
          p_search_scope: scope,
          p_limit: maxResults
        });
      
      if (error) {
        // Fallback to basic search if RPC not available
        console.warn('[ContactSearch] RPC not available, falling back to basic:', error.message);
        const { data: basicResults } = await supabase
          .from('wp_contactos')
          .select('*')
          .eq('empresa_id', selectedEnterpriseId)
          .or(`nombre.ilike.%${term}%,apellido.ilike.%${term}%,telefono.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(maxResults);
        
        const results: SearchResult[] = (basicResults || []).map(c => ({
          ...c,
          score: 50,
          matchSource: 'basic' as const
        }));
        setServerResults(results);
        return;
      }

      // Map RPC results to SearchResult format
      const results: SearchResult[] = (rpcResults || []).map((r: any) => ({
        ...r,
        score: r.relevance_score || 0,
        matchSource: r.match_source as 'basic' | 'messages' | 'metadata' | 'notes',
        matchPreview: r.match_preview
      }));

      setServerResults(results);
    } catch (error) {
      console.error('[ContactSearch] Deep search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [selectedEnterpriseId, maxResults]);

  // Progressive search effect - AUTOMATIC SCOPE
  useEffect(() => {
    if (basicSearchTimer.current) clearTimeout(basicSearchTimer.current);
    if (deepSearchTimer.current) clearTimeout(deepSearchTimer.current);
    
    if (!searchInput || searchInput.length < 2) {
      setIsSearching(false);
      setServerResults([]);
      setCurrentSearchScope('basic');
      return;
    }
    
    // Skip if we already sent this exact search to server
    if (searchInput === lastServerSearchRef.current) {
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    
    // Detect if user is searching for a phrase (longer text = likely looking in messages)
    const isPhrase = searchInput.length > 10;
    
    // LEVEL 1: Basic search (100ms) - Fast results for short queries
    if (!isPhrase) {
      basicSearchTimer.current = setTimeout(() => {
        if (searchInput !== lastServerSearchRef.current) {
          lastServerSearchRef.current = searchInput;
          setCurrentSearchScope('basic');
        }
      }, 100);
    }
    
    // LEVEL 2: Deep search - Faster for phrases (300ms), normal for words (800ms)
    // For phrases like "Puede ser Miércoles, jueves o viernes", search immediately in messages
    const deepSearchDelay = isPhrase ? 300 : 800;
    deepSearchTimer.current = setTimeout(() => {
      lastServerSearchRef.current = searchInput;
      setCurrentSearchScope('all');
      performDeepSearch(searchInput, 'all');
    }, deepSearchDelay);
    
    return () => {
      if (basicSearchTimer.current) clearTimeout(basicSearchTimer.current);
      if (deepSearchTimer.current) clearTimeout(deepSearchTimer.current);
    };
  }, [searchInput, performDeepSearch]);

  // Combine local and server results
  const displayResults = useMemo(() => {
    if (currentSearchScope === 'basic' || serverResults.length === 0) {
      return localFilteredContacts;
    }
    
    // Merge server results with local, prioritizing server
    const serverIds = new Set(serverResults.map(r => r.id));
    const localOnly = localFilteredContacts.filter(c => !serverIds.has(c.id));
    
    return [...serverResults, ...localOnly].slice(0, maxResults);
  }, [localFilteredContacts, serverResults, currentSearchScope, maxResults]);

  const handleSelectContact = (contact: SearchResult) => {
    onSelectContact(contact);
    setSearchInput(`${contact.nombre || ''} ${contact.apellido || ''}`.trim());
    setShowResults(false);
  };

  const handleClear = () => {
    setSearchInput('');
    onSelectContact(null);
    setServerResults([]);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative flex items-center bg-zinc-900 border border-white/5 rounded-xl overflow-hidden focus-within:border-primary-500/50 transition-colors">
        {/* Minimalist Scope Icon Indicator */}
        <div
          className={`flex items-center justify-center w-9 h-9 shrink-0 transition-all duration-500 ${
            currentSearchScope === 'all' 
              ? 'text-primary-400 drop-shadow-[0_0_8px_rgba(var(--primary-500),0.5)]' 
              : 'text-zinc-500'
          }`}
          title={currentScope.desc}
        >
          <div className={`${currentSearchScope === 'all' ? 'animate-pulse-slow' : ''}`}>
            {currentScope.icon}
          </div>
        </div>

        {/* Search Icon (Conditional or Fixed) */}
        <div className="pl-1">
          {selectedContact ? (
            <Check className="w-4 h-4 text-emerald-500 transition-all duration-300 scale-110" />
          ) : null}
        </div>

        {/* Input */}
        <input 
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          className="w-full bg-transparent border-none text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-0 py-2.5 px-2"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setShowResults(true);
            if (!e.target.value) onSelectContact(null);
          }}
          onFocus={() => setShowResults(true)}
          disabled={disabled}
          autoFocus={autoFocus}
        />

        {/* Loading/Clear */}
        {isSearching && (
          <Loader2 className="w-4 h-4 text-primary-400 animate-spin mr-2" />
        )}
        {searchInput && !isSearching && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>


      {/* Results Dropdown */}
      {showResults && searchInput.length >= 2 && displayResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {displayResults.map(contact => (
            <button
              key={contact.id}
              type="button"
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 text-left transition-colors border-b border-white/5 last:border-0"
              onClick={() => handleSelectContact(contact)}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary-500/10 flex items-center justify-center text-[11px] font-bold text-primary-400 shrink-0">
                {contact.nombre?.[0] || '?'}{contact.apellido?.[0] || ''}
              </div>
              
              {/* Contact Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {contact.nombre} {contact.apellido}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  {contact.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {contact.telefono}
                    </span>
                  )}
                  {contact.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3" />
                      {contact.email}
                    </span>
                  )}
                </div>
                
                {/* Match Preview for deep search */}
                {contact.matchSource && contact.matchSource !== 'basic' && contact.matchPreview && (
                  <div className="mt-1 text-[9px] text-zinc-600 line-clamp-1 italic">
                    &ldquo;{contact.matchPreview.substring(0, 60)}...&rdquo;
                  </div>
                )}
              </div>
              
              {/* Match Source Badge */}
              {contact.matchSource && contact.matchSource !== 'basic' && (
                <div className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
                  contact.matchSource === 'messages' ? 'bg-green-500/10 text-green-400' :
                  contact.matchSource === 'metadata' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-zinc-500/10 text-zinc-400'
                }`}>
                  {contact.matchSource === 'messages' ? 'Mensaje' :
                   contact.matchSource === 'metadata' ? 'Data' :
                   contact.matchSource}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {showResults && searchInput.length >= 2 && displayResults.length === 0 && !isSearching && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50 p-4 text-center">
          <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No se encontraron contactos</p>
          {currentSearchScope === 'basic' && isSearching && (
            <p className="mt-2 text-[10px] text-zinc-600">
              Buscando en mensajes y metadata...
            </p>
          )}
        </div>
      )}
    </div>
  );
};
