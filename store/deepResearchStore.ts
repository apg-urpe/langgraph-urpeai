import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../lib/logger';
import {
  DeepResearchJob,
  ResearchStatus,
  CreateResearchPayload,
  DeepResearchPanelState,
  DEFAULT_PANEL_STATE,
  formatResearchDataAsMarkdown
} from '../types/deep-research';
import { useArtifactStore } from './artifactStore';
import { useNotificationsStore } from './notificationsStore';
import { useContactStore } from './contactStore';
import { useAuthStore } from './authStore';

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface DeepResearchState {
  // Jobs
  jobs: DeepResearchJob[];
  activeJobId: string | null;
  
  // UI State
  panel: DeepResearchPanelState;
  
  // Loading
  isSubmitting: boolean;
  error: string | null;
  
  // Polling
  pollingIntervals: Map<string, NodeJS.Timeout>;
  
  // ========== JOB ACTIONS ==========
  startResearch: (userId: string, payload: CreateResearchPayload) => Promise<string | null>;
  cancelResearch: (jobId: string) => void;
  pollJobStatus: (jobId: string) => Promise<void>;
  clearCompletedJobs: () => void;
  
  // ========== UI ACTIONS ==========
  setPanel: (updates: Partial<DeepResearchPanelState>) => void;
  toggleExpanded: () => void;
  setInputValue: (value: string) => void;
  
  // ========== INITIALIZATION ==========
  initialize: () => void;
  
  // ========== UTILITY ==========
  getActiveJobs: () => DeepResearchJob[];
  getCompletedJobs: () => DeepResearchJob[];
  clearError: () => void;
}

// Polling interval (30 seconds - webhook handles most completions, this is fallback)
const POLL_INTERVAL_MS = 30000;
// Max polling attempts (2 hours max: 240 * 30s = 7200s)
// Jobs can run longer; webhook will handle completion even after polling stops
const MAX_POLL_ATTEMPTS = 240;

// ============================================================================
// SELECTORS
// ============================================================================

export const selectJobs = (state: DeepResearchState) => state.jobs;
export const selectActiveJobId = (state: DeepResearchState) => state.activeJobId;
export const selectPanel = (state: DeepResearchState) => state.panel;
export const selectIsSubmitting = (state: DeepResearchState) => state.isSubmitting;
export const selectError = (state: DeepResearchState) => state.error;

export const selectActiveJobs = (state: DeepResearchState) => 
  state.jobs.filter(j => j.status === 'processing' || j.status === 'queued');

export const selectCompletedJobs = (state: DeepResearchState) => 
  state.jobs.filter(j => j.status === 'completed');

export const selectRecentJobs = (state: DeepResearchState) => 
  state.jobs.slice(0, 10);

export const selectHasActiveJobs = (state: DeepResearchState) => 
  state.jobs.some(j => j.status === 'processing' || j.status === 'queued');

// ============================================================================
// STORE
// ============================================================================

export const useDeepResearchStore = create<DeepResearchState>()(
  persist(
    (set, get) => ({
      // Initial State
      jobs: [],
      activeJobId: null,
      panel: DEFAULT_PANEL_STATE,
      isSubmitting: false,
      error: null,
      pollingIntervals: new Map(),

      // ========================================================================
      // JOB ACTIONS
      // ========================================================================

      startResearch: async (userId, payload) => {
        set({ isSubmitting: true, error: null });
        
        try {
          const contactStore = useContactStore.getState();
          const empresaId = contactStore.selectedEnterpriseId;

          // Create local job immediately
          const jobId = `research-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const newJob: DeepResearchJob = {
            id: jobId,
            user_id: userId,
            prompt: payload.prompt,
            urls: payload.urls,
            schema: payload.schema,
            status: 'queued',
            created_at: new Date().toISOString()
          };
          
          // Add to state
          set(state => ({
            jobs: [newJob, ...state.jobs],
            activeJobId: jobId
          }));
          
          logger.info('[DeepResearch] Starting research job', { jobId, prompt: payload.prompt.substring(0, 50) });
          
          // Get access token for Authorization header
          const accessToken = useAuthStore.getState().session?.access_token;
          
          // Call API to start the research
          const response = await fetch('/api/deep-research', {
            method: 'POST',
            credentials: 'include',
            headers: { 
              'Content-Type': 'application/json',
              ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
            },
            body: JSON.stringify({
              prompt: payload.prompt,
              urls: payload.urls,
              schema: payload.schema,
              jobId,
              userId,
              empresaId
            })
          });
          
          // Read response once as text first to handle both success and error
          const responseText = await response.text().catch(() => '');
          
          if (!response.ok) {
            let errorMessage = 'Error al iniciar la investigación';
            let errorDetails = '';
            
            try {
              if (responseText) {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.error || errorMessage;
                errorDetails = errorData.details ? `: ${errorData.details}` : '';
                if (errorData.hint) errorDetails += ` (${errorData.hint})`;
              } else {
                errorMessage = `Error del servidor (${response.status})`;
              }
            } catch (e) {
              // Not JSON
              console.error('[DeepResearch] Server returned non-JSON error:', responseText);
              errorMessage = `Error del servidor (${response.status})`;
              errorDetails = `: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`;
            }
            
            throw new Error(`${errorMessage}${errorDetails}`);
          }
          
          // For successful response, parse the already read text
          const data = JSON.parse(responseText);
          
          // Update job with Firecrawl job ID
          set(state => ({
            jobs: state.jobs.map(j => 
              j.id === jobId 
                ? { 
                    ...j, 
                    status: 'processing' as ResearchStatus,
                    firecrawl_job_id: data.firecrawlJobId,
                    started_at: new Date().toISOString()
                  }
                : j
            )
          }));
          
          // Start polling for status
          get().pollJobStatus(jobId);
          
          logger.info('[DeepResearch] Research job started', { jobId, firecrawlJobId: data.firecrawlJobId });
          return jobId;
          
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error desconocido';
          set({ error: message });
          logger.error('[DeepResearch] Error starting research', err);
          
          // Mark job as failed if it was created
          const { activeJobId } = get();
          if (activeJobId) {
            set(state => ({
              jobs: state.jobs.map(j => 
                j.id === activeJobId 
                  ? { ...j, status: 'failed' as ResearchStatus, error: message }
                  : j
              )
            }));
          }
          
          return null;
        } finally {
          set({ isSubmitting: false });
        }
      },

      cancelResearch: (jobId) => {
        const { pollingIntervals } = get();
        const interval = pollingIntervals.get(jobId);
        
        if (interval) {
          clearInterval(interval);
          pollingIntervals.delete(jobId);
        }
        
        set(state => ({
          jobs: state.jobs.filter(j => j.id !== jobId),
          activeJobId: state.activeJobId === jobId ? null : state.activeJobId
        }));
        
        logger.info('[DeepResearch] Cancelled research job', { jobId });
      },

      pollJobStatus: async (jobId) => {
        const { pollingIntervals, jobs } = get();
        
        // Don't start duplicate polling
        if (pollingIntervals.has(jobId)) return;
        
        let attempts = 0;
        
        const poll = async () => {
          attempts++;
          
          try {
            const accessToken = useAuthStore.getState().session?.access_token;
            const response = await fetch(`/api/deep-research?jobId=${jobId}`, {
              credentials: 'include',
              headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}
            });
            
            if (!response.ok) {
              throw new Error('Error checking status');
            }
            
            const data = await response.json();
            
            // Update job status
            set(state => ({
              jobs: state.jobs.map(j => {
                if (j.id !== jobId) return j;
                
                return {
                  ...j,
                  status: data.status as ResearchStatus,
                  data: data.data,
                  credits_used: data.creditsUsed,
                  expires_at: data.expiresAt,
                  error: data.error,
                  completed_at: data.status === 'completed' || data.status === 'failed' 
                    ? new Date().toISOString() 
                    : undefined
                };
              })
            }));
            
            // If completed or failed, stop polling
            // Note: Webhook already handles artifact/notification creation server-side
            // This polling is just a fallback to update local UI state
            if (data.status === 'completed' || data.status === 'failed') {
              const interval = pollingIntervals.get(jobId);
              if (interval) {
                clearInterval(interval);
                pollingIntervals.delete(jobId);
              }
              
              // Check if webhook already created the artifact (artifact_id in response)
              if (data.artifactId) {
                // Webhook handled everything, just update local state with artifact ID
                set(state => ({
                  jobs: state.jobs.map(j => 
                    j.id === jobId ? { ...j, artifact_id: data.artifactId } : j
                  )
                }));
                
                logger.info('[DeepResearch] Job completed (webhook processed)', { jobId, artifactId: data.artifactId });
                
                // Trigger UI notification event for visual feedback
                window.dispatchEvent(new CustomEvent('deep-research-complete', {
                  detail: { jobId, artifactId: data.artifactId, prompt: get().jobs.find(j => j.id === jobId)?.prompt }
                }));
              }
              
              logger.info('[DeepResearch] Research job completed', { jobId, status: data.status });
            }
            
            // Stop polling if max attempts reached
            if (attempts >= MAX_POLL_ATTEMPTS) {
              const interval = pollingIntervals.get(jobId);
              if (interval) {
                clearInterval(interval);
                pollingIntervals.delete(jobId);
              }
              
              set(state => ({
                jobs: state.jobs.map(j => 
                  j.id === jobId && j.status === 'processing'
                    ? { ...j, status: 'failed' as ResearchStatus, error: 'Tiempo de espera agotado' }
                    : j
                )
              }));
              
              logger.warn('[DeepResearch] Research job timed out', { jobId });
            }
            
          } catch (err) {
            logger.error('[DeepResearch] Error polling job status', err);
            
            // Only fail after multiple consecutive errors
            if (attempts >= 3) {
              const interval = pollingIntervals.get(jobId);
              if (interval) {
                clearInterval(interval);
                pollingIntervals.delete(jobId);
              }
            }
          }
        };
        
        // Start polling
        const interval = setInterval(poll, POLL_INTERVAL_MS);
        pollingIntervals.set(jobId, interval);
        
        // Initial poll
        poll();
      },

      clearCompletedJobs: () => {
        set(state => ({
          jobs: state.jobs.filter(j => j.status === 'processing' || j.status === 'queued')
        }));
      },

      // ========================================================================
      // INITIALIZATION
      // ========================================================================

      initialize: () => {
        const { jobs, pollJobStatus } = get();
        
        // Resume polling for any processing jobs
        const processingJobs = jobs.filter(j => j.status === 'processing' || j.status === 'queued');
        
        if (processingJobs.length > 0) {
          logger.info('[DeepResearch] Resuming polling for active jobs', { count: processingJobs.length });
          processingJobs.forEach(job => {
            pollJobStatus(job.id);
          });
        }
      },

      // ========================================================================
      // UI ACTIONS
      // ========================================================================

      setPanel: (updates) => set(state => ({
        panel: { ...state.panel, ...updates }
      })),

      toggleExpanded: () => set(state => ({
        panel: { ...state.panel, isExpanded: !state.panel.isExpanded }
      })),

      setInputValue: (value) => set(state => ({
        panel: { ...state.panel, inputValue: value }
      })),

      // ========================================================================
      // UTILITY
      // ========================================================================

      getActiveJobs: () => get().jobs.filter(j => 
        j.status === 'processing' || j.status === 'queued'
      ),

      getCompletedJobs: () => get().jobs.filter(j => 
        j.status === 'completed'
      ),

      clearError: () => set({ error: null })
    }),
    {
      name: 'deep-research-store',
      partialize: (state) => ({
        jobs: state.jobs.slice(0, 20), // Only persist last 20 jobs
        panel: state.panel
      })
    }
  )
);
