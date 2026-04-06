/**
 * Email Intelligence Store
 * 
 * Zustand store con persistencia local para correos y análisis IA.
 * Usa localStorage para cache offline.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { 
  EmailStoreState, 
  EmailStoreActions, 
  LocalEmail,
  EmailAnalysis,
  EmailSummary,
  EmailSearchParams 
} from '../types/email';

// ============================================
// CONSTANTS
// ============================================

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos
const MAX_SEARCH_HISTORY = 10;
const DEFAULT_FETCH_LIMIT = 20;

// ============================================
// INITIAL STATE
// ============================================

const initialState: EmailStoreState = {
  emails: [],
  analyses: {},
  lastSummary: null,
  selectedEmailId: null,
  searchQuery: '',
  searchHistory: [],
  isLoading: false,
  isAnalyzing: false,
  isSummarizing: false,
  lastFetchTime: null,
  grantId: null,
  error: null,
};

// ============================================
// SELECTORS
// ============================================

export const selectEmails = (state: EmailStoreState & EmailStoreActions) => state.emails;
export const selectSelectedEmail = (state: EmailStoreState & EmailStoreActions) => 
  state.emails.find(e => e.id === state.selectedEmailId) || null;
export const selectEmailAnalysis = (emailId: string) => 
  (state: EmailStoreState & EmailStoreActions) => state.analyses[emailId] || null;
export const selectLastSummary = (state: EmailStoreState & EmailStoreActions) => state.lastSummary;
export const selectIsLoading = (state: EmailStoreState & EmailStoreActions) => state.isLoading;
export const selectIsAnalyzing = (state: EmailStoreState & EmailStoreActions) => state.isAnalyzing;
export const selectSearchQuery = (state: EmailStoreState & EmailStoreActions) => state.searchQuery;
export const selectSearchHistory = (state: EmailStoreState & EmailStoreActions) => state.searchHistory;
export const selectError = (state: EmailStoreState & EmailStoreActions) => state.error;

// Selector para verificar si el cache está fresco
export const selectIsCacheFresh = (state: EmailStoreState & EmailStoreActions) => {
  if (!state.lastFetchTime) return false;
  return Date.now() - state.lastFetchTime < CACHE_DURATION_MS;
};

// Selector para correos no leídos
export const selectUnreadCount = (state: EmailStoreState & EmailStoreActions) => 
  state.emails.filter(e => e.unread).length;

// Selector para últimos N correos
export const selectLatestEmails = (count: number) => 
  (state: EmailStoreState & EmailStoreActions) => 
    [...state.emails].sort((a, b) => b.date - a.date).slice(0, count);

// ============================================
// STORE
// ============================================

export const useEmailStore = create<EmailStoreState & EmailStoreActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ----------------------------------------
      // FETCH EMAILS FROM NYLAS
      // ----------------------------------------
      fetchEmails: async (grantId: string, enterpriseId: number, userId: string, params?: EmailSearchParams) => {
        const state = get();
        
        // Si es el mismo grant y el cache está fresco, no refetch
        if (state.grantId === grantId && !params?.query && selectIsCacheFresh(state)) {
          console.log('[EmailStore] Using cached emails');
          return;
        }

        set({ isLoading: true, error: null, grantId });

        try {
          const queryParams = new URLSearchParams();
          queryParams.set('grant_id', grantId);
          queryParams.set('enterprise_id', String(enterpriseId));
          queryParams.set('user_id', userId);
          queryParams.set('limit', String(params?.limit || DEFAULT_FETCH_LIMIT));
          
          if (params?.query) queryParams.set('query', params.query);
          if (params?.unread !== undefined) queryParams.set('unread', String(params.unread));
          if (params?.after) queryParams.set('received_after', String(params.after));
          if (params?.before) queryParams.set('received_before', String(params.before));
          if (params?.pageToken) queryParams.set('page_token', params.pageToken);

          const response = await fetch(`/api/emails?${queryParams.toString()}`);
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.success && Array.isArray(data.emails)) {
            // Si es búsqueda, no reemplazar cache principal
            if (params?.query) {
              set({ 
                emails: data.emails,
                isLoading: false 
              });
            } else {
              // Merge con emails existentes, manteniendo análisis previos
              const existingAnalyses = get().analyses;
              set({ 
                emails: data.emails,
                lastFetchTime: Date.now(),
                isLoading: false,
                analyses: existingAnalyses // Preservar análisis
              });
            }
          } else {
            throw new Error(data.error || 'Invalid response format');
          }
        } catch (error) {
          console.error('[EmailStore] Fetch error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Error fetching emails',
            isLoading: false 
          });
        }
      },

      // ----------------------------------------
      // FETCH FULL EMAIL BODY
      // ----------------------------------------
      fetchEmailBody: async (emailId: string) => {
        const { grantId, emails } = get();
        if (!grantId) return null;

        // Verificar si ya tenemos el body
        const email = emails.find(e => e.id === emailId);
        if (email?.body) return email.body;

        try {
          const response = await fetch(`/api/emails/${emailId}?grant_id=${grantId}`);
          if (!response.ok) return null;

          const data = await response.json();
          if (data.success && data.body) {
            // Actualizar email con body
            set(state => ({
              emails: state.emails.map(e => 
                e.id === emailId ? { ...e, body: data.body, bodyText: data.bodyText } : e
              )
            }));
            return data.body;
          }
          return null;
        } catch (error) {
          console.error('[EmailStore] Fetch body error:', error);
          return null;
        }
      },

      // ----------------------------------------
      // ANALYZE EMAIL WITH GEMINI
      // ----------------------------------------
      analyzeEmail: async (emailId: string) => {
        const { emails, analyses, grantId } = get();
        
        // Si ya existe análisis, retornarlo
        if (analyses[emailId]) {
          return analyses[emailId];
        }

        const email = emails.find(e => e.id === emailId);
        if (!email) return null;

        set({ isAnalyzing: true, error: null });

        try {
          // Asegurar que tenemos el body
          let body = email.body || email.bodyText || email.snippet;
          if (!email.body && grantId) {
            const fetchedBody = await get().fetchEmailBody(emailId);
            if (fetchedBody) body = fetchedBody;
          }

          const response = await fetch('/api/emails/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email_id: emailId,
              subject: email.subject,
              body: body,
              from: email.from[0]?.email || 'unknown'
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.success && data.analysis) {
            const analysis: EmailAnalysis = {
              ...data.analysis,
              emailId,
              analyzedAt: Date.now()
            };

            set(state => ({
              analyses: { ...state.analyses, [emailId]: analysis },
              isAnalyzing: false
            }));

            return analysis;
          } else {
            throw new Error(data.error || 'Analysis failed');
          }
        } catch (error) {
          console.error('[EmailStore] Analyze error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Error analyzing email',
            isAnalyzing: false 
          });
          return null;
        }
      },

      // ----------------------------------------
      // GENERATE SUMMARY OF LATEST EMAILS
      // ----------------------------------------
      generateSummary: async (count = 5) => {
        const emails = get().emails;
        if (emails.length === 0) return null;

        set({ isSummarizing: true, error: null });

        try {
          const latestEmails = [...emails]
            .sort((a, b) => b.date - a.date)
            .slice(0, count);

          const response = await fetch('/api/emails/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emails: latestEmails.map(e => ({
                id: e.id,
                subject: e.subject,
                snippet: e.snippet,
                from: e.from[0]?.name || e.from[0]?.email || 'Unknown',
                date: e.date
              }))
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.success && data.summary) {
            const summary: EmailSummary = {
              ...data.summary,
              generatedAt: Date.now(),
              emailIds: latestEmails.map(e => e.id)
            };

            set({ lastSummary: summary, isSummarizing: false });
            return summary;
          } else {
            throw new Error(data.error || 'Summary generation failed');
          }
        } catch (error) {
          console.error('[EmailStore] Summary error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Error generating summary',
            isSummarizing: false 
          });
          return null;
        }
      },

      // ----------------------------------------
      // MARK AS READ
      // ----------------------------------------
      markAsRead: async (emailId: string) => {
        const { grantId } = get();
        if (!grantId) return false;

        try {
          const response = await fetch(
            `/api/emails/${encodeURIComponent(emailId)}/mark-read?grant_id=${grantId}`,
            { method: 'PUT' }
          );

          if (!response.ok) {
            console.error('[EmailStore] Mark as read failed:', response.status);
            return false;
          }

          // Actualizar estado local
          set(state => ({
            emails: state.emails.map(e => 
              e.id === emailId ? { ...e, unread: false } : e
            )
          }));

          return true;
        } catch (error) {
          console.error('[EmailStore] Mark as read error:', error);
          return false;
        }
      },

      // ----------------------------------------
      // QUERY EMAILS (Búsqueda Inteligente en Nylas)
      // ----------------------------------------
      // Flujo: Pregunta → Gemini genera query → Nylas busca → Gemini responde
      queryEmails: async (question: string) => {
        const { grantId } = get();
        if (!grantId || !question.trim()) return null;

        set({ isAnalyzing: true, error: null });

        try {
          // Usar smart-search que busca directamente en Nylas
          const response = await fetch('/api/emails/smart-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question,
              grant_id: grantId
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const data = await response.json();
          set({ isAnalyzing: false });

          if (data.success && data.answer) {
            // Agregar info de correos encontrados al final si hay
            const footer = data.emailsFound > 0 
              ? `\n\n---\n*🔍 ${data.emailsFound} correos encontrados en tu bandeja*`
              : '';
            return data.answer + footer;
          } else {
            throw new Error(data.error || 'Query failed');
          }
        } catch (error) {
          console.error('[EmailStore] Smart search error:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Error en búsqueda inteligente',
            isAnalyzing: false 
          });
          return null;
        }
      },

      // ----------------------------------------
      // UI ACTIONS
      // ----------------------------------------
      selectEmail: (emailId) => set({ selectedEmailId: emailId }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      addToSearchHistory: (query) => {
        if (!query.trim()) return;
        set(state => {
          const history = [query, ...state.searchHistory.filter(q => q !== query)];
          return { searchHistory: history.slice(0, MAX_SEARCH_HISTORY) };
        });
      },

      clearSearchHistory: () => set({ searchHistory: [] }),

      // ----------------------------------------
      // CACHE MANAGEMENT
      // ----------------------------------------
      clearCache: () => set({
        emails: [],
        analyses: {},
        lastSummary: null,
        lastFetchTime: null,
        selectedEmailId: null,
        error: null
      }),

      setGrantId: (grantId) => {
        const currentGrantId = get().grantId;
        if (currentGrantId !== grantId) {
          // Limpiar cache si cambia el grant
          set({
            ...initialState,
            grantId,
            searchHistory: get().searchHistory // Mantener historial
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'email-intelligence-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Solo persistir estos campos
        emails: state.emails,
        analyses: state.analyses,
        lastSummary: state.lastSummary,
        searchHistory: state.searchHistory,
        lastFetchTime: state.lastFetchTime,
        grantId: state.grantId,
      }),
    }
  )
);
