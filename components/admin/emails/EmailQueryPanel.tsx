'use client';

/**
 * EmailQueryPanel - Preguntas al Correo con IA
 * 
 * Permite hacer preguntas en lenguaje natural sobre los correos.
 * Ejemplo: "¿Qué facturas llegaron este mes?"
 * 
 * El sistema busca en los correos cargados y responde usando Gemini.
 */

import React, { useState, useCallback } from 'react';
import {
  Search,
  Sparkles,
  X,
  Loader2,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  History,
  Send
} from 'lucide-react';
import { useEmailStore } from '@/store/emailStore';
import ReactMarkdown from 'react-markdown';

interface EmailQueryPanelProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const EXAMPLE_QUERIES = [
  '¿Qué facturas llegaron este mes?',
  '¿Hay correos urgentes pendientes?',
  'Resume los correos de ventas',
  '¿Quién me escribió sobre pagos?',
];

export const EmailQueryPanel: React.FC<EmailQueryPanelProps> = ({
  isExpanded,
  onToggleExpand
}) => {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  
  const queryEmails = useEmailStore(state => state.queryEmails);
  const searchHistory = useEmailStore(state => state.searchHistory);
  const addToSearchHistory = useEmailStore(state => state.addToSearchHistory);
  const emails = useEmailStore(state => state.emails);

  const handleQuery = useCallback(async (questionText?: string) => {
    const questionToAsk = questionText || query;
    if (!questionToAsk.trim() || emails.length === 0) return;
    
    setIsQuerying(true);
    setAnswer(null);
    
    try {
      const result = await queryEmails(questionToAsk);
      if (result) {
        setAnswer(result);
        addToSearchHistory(questionToAsk);
      }
    } finally {
      setIsQuerying(false);
    }
  }, [query, queryEmails, addToSearchHistory, emails.length]);

  const handleExampleClick = (example: string) => {
    setQuery(example);
    handleQuery(example);
  };

  const handleClear = () => {
    setQuery('');
    setAnswer(null);
  };

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-gradient-to-br from-violet-500/5 to-transparent">
      {/* Header - Always visible */}
      <button
        onClick={onToggleExpand}
        className="w-full p-3 flex items-center justify-between text-sm font-medium text-violet-300 hover:bg-violet-500/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/20">
            <MessageSquare className="w-4 h-4" />
          </div>
          Preguntas al Correo
          {emails.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 rounded text-violet-400">
              {emails.length} correos
            </span>
          )}
        </span>
        <div className="p-1 rounded-md bg-white/5 text-violet-400">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-2 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Input Area */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isQuerying && handleQuery()}
              placeholder="Pregunta sobre tus correos..."
              disabled={isQuerying || emails.length === 0}
              className="w-full pl-10 pr-20 py-3 bg-zinc-900 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query && (
                <button
                  onClick={handleClear}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => handleQuery()}
                disabled={!query.trim() || isQuerying || emails.length === 0}
                className="p-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isQuerying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Example Queries */}
          {!answer && !isQuerying && (
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map((example, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(example)}
                  disabled={emails.length === 0}
                  className="px-2.5 py-1 text-xs bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 rounded-lg border border-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {/* Loading State */}
          {isQuerying && (
            <div className="flex items-center gap-3 p-4 bg-zinc-900/50 rounded-lg border border-white/5">
              <div className="relative">
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                <Sparkles className="w-3 h-3 text-violet-300 absolute -top-0.5 -right-0.5 animate-pulse" />
              </div>
              <div>
                <p className="text-sm text-zinc-300 font-medium">Analizando correos...</p>
                <p className="text-xs text-zinc-500">Buscando información relevante</p>
              </div>
            </div>
          )}

          {/* Answer Display */}
          {answer && !isQuerying && (
            <div className="bg-zinc-900/80 rounded-xl p-4 border border-violet-500/20">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-semibold text-violet-300 uppercase tracking-wide">
                  Respuesta IA
                </span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_p]:mb-2 [&_ul]:pl-4 [&_li]:mb-1 [&_strong]:text-zinc-200 [&_a]:text-violet-400">
                <ReactMarkdown>{answer}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* No emails warning */}
          {emails.length === 0 && (
            <div className="text-center py-4 text-zinc-500 text-sm">
              <p>Carga correos primero para hacer preguntas</p>
            </div>
          )}

          {/* Recent History */}
          {searchHistory.length > 0 && !answer && !isQuerying && (
            <div className="pt-3 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-2">
                <History className="w-3 h-3" />
                Búsquedas recientes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {searchHistory.slice(0, 5).map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(h)}
                    className="px-2 py-0.5 text-[10px] bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded transition-colors truncate max-w-[150px]"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailQueryPanel;
