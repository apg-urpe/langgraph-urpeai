import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Loader2, 
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Trash2,
  Globe,
  RefreshCw,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { 
  useDeepResearchStore, 
  selectJobs, 
  selectIsSubmitting, 
  selectError 
} from '../../../store/deepResearchStore';
import { useArtifactStore } from '../../../store/artifactStore';
import { useAuthStore } from '../../../store/authStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { useContactStore, selectUserContext, selectSelectedEnterpriseId } from '../../../store/contactStore';
import { 
  DeepResearchJob,
  RESEARCH_STATUS_LABELS, 
  RESEARCH_STATUS_COLORS,
  formatResearchDuration 
} from '../../../types/deep-research';
import { ResearchSearchCreate } from './ResearchSearchCreate';

// Job Card Component
interface JobCardProps {
  job: DeepResearchJob;
  onCancel?: () => void;
  onOpenResult?: (artifactId: string) => void;
  onRetry?: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, onCancel, onOpenResult, onRetry }) => {
  const isActive = job.status === 'processing' || job.status === 'queued';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  
  return (
    <div className={`
      p-4 rounded-xl border transition-all
      ${isActive ? 'bg-violet-500/5 border-violet-500/20' : ''}
      ${isCompleted ? 'bg-zinc-900/50 border-white/5 hover:border-emerald-500/30' : ''}
      ${isFailed ? 'bg-red-500/5 border-red-500/20' : ''}
    `}>
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center shrink-0
          ${isActive ? 'bg-violet-500/20' : ''}
          ${isCompleted ? 'bg-emerald-500/20' : ''}
          ${isFailed ? 'bg-red-500/20' : ''}
        `}>
          {isActive && <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />}
          {isCompleted && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {isFailed && <XCircle className="w-5 h-5 text-red-400" />}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 line-clamp-2 mb-1">
            {job.prompt}
          </p>
          
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {/* Status Badge */}
            <span className={`px-2 py-0.5 rounded-full ${RESEARCH_STATUS_COLORS[job.status]}`}>
              {RESEARCH_STATUS_LABELS[job.status]}
            </span>
            
            {/* Duration */}
            {job.started_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatResearchDuration(job.started_at, job.completed_at || undefined)}
              </span>
            )}
            
            {/* Credits */}
            {job.credits_used && (
              <span>{job.credits_used} créditos</span>
            )}
            
            {/* Date */}
            <span>
              {new Date(job.created_at).toLocaleDateString('es', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isCompleted && job.artifact_id && (
            <button
              onClick={() => onOpenResult?.(job.artifact_id!)}
              className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
              title="Ver resultado"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          
          {isFailed && (
            <button
              onClick={onRetry}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Reintentar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          
          {isActive && (
            <button
              onClick={onCancel}
              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Cancelar"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Error Message */}
      {isFailed && job.error && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{job.error}</span>
        </div>
      )}
    </div>
  );
};

/**
 * PERFORMANCE: Memoized Job Card to prevent re-renders during polling updates.
 */
const MemoizedJobCard = React.memo(JobCard);

export const DeepResearchView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Engagement tracking
  usePageTracking('research');
  const trackAction = useActionTracking('research');
  
  // Store state
  const jobs = useDeepResearchStore(selectJobs);
  const startResearch = useDeepResearchStore(state => state.startResearch);
  const cancelResearch = useDeepResearchStore(state => state.cancelResearch);
  const clearCompletedJobs = useDeepResearchStore(state => state.clearCompletedJobs);
  const clearError = useDeepResearchStore(state => state.clearError);
  
  const user = useAuthStore(state => state.user);
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);

  // Filter jobs by search
  const filteredJobs = jobs.filter(job => 
    job.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Group jobs by status
  const activeJobs = filteredJobs.filter(j => j.status === 'processing' || j.status === 'queued');
  const completedJobs = filteredJobs.filter(j => j.status === 'completed');
  const failedJobs = filteredJobs.filter(j => j.status === 'failed');
  
  const handleOpenResult = (artifactId: string) => {
    trackAction('research.open_result', { artifactId });
    openExistingArtifact(artifactId);
  };

  const handleRetryJob = async (job: DeepResearchJob) => {
    if (!user) return;
    trackAction('research.retry_job', { jobId: job.id });
    clearError();
    await startResearch(user.id, {
      prompt: job.prompt,
      urls: job.urls,
      schema: job.schema
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e]">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-100">Deep Research</h1>
            <p className="text-xs text-zinc-500">Investigación avanzada en la web con Monica AI</p>
          </div>
        </div>
        
        {/* Search/Create unified input */}
        <ResearchSearchCreate
          onSearch={setSearchQuery}
          searchQuery={searchQuery}
          className="mb-6"
        />
        
        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 rounded-lg border border-white/5">
            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs text-zinc-400">Activas: {activeJobs.length}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 rounded-lg border border-white/5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-400">Completadas: {completedJobs.length}</span>
          </div>
          {failedJobs.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 rounded-lg border border-white/5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs text-zinc-400">Fallidas: {failedJobs.length}</span>
            </div>
          )}
          
          {completedJobs.length > 0 && (
            <button
              onClick={clearCompletedJobs}
              className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Limpiar historial
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              En Proceso
            </h2>
            <div className="space-y-2">
              {activeJobs.map(job => (
                <MemoizedJobCard 
                  key={job.id} 
                  job={job} 
                  onCancel={() => cancelResearch(job.id)}
                  onOpenResult={handleOpenResult}
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Completed Jobs */}
        {completedJobs.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3" />
              Completadas
            </h2>
            <div className="space-y-2">
              {completedJobs.map(job => (
                <MemoizedJobCard 
                  key={job.id} 
                  job={job}
                  onOpenResult={handleOpenResult}
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Failed Jobs */}
        {failedJobs.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <XCircle className="w-3 h-3" />
              Fallidas
            </h2>
            <div className="space-y-2">
              {failedJobs.map(job => (
                <MemoizedJobCard 
                  key={job.id} 
                  job={job}
                  onCancel={() => cancelResearch(job.id)}
                  onRetry={() => handleRetryJob(job)}
                />
              ))}
            </div>
          </section>
        )}
        
        {/* Empty State */}
        {filteredJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <Globe className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">
              {searchQuery ? 'Sin resultados' : 'Sin investigaciones'}
            </h3>
            <p className="text-sm text-zinc-500 max-w-sm">
              {searchQuery 
                ? 'No se encontraron investigaciones que coincidan con tu búsqueda.'
                : 'Usa el buscador de arriba para ver tus investigaciones o crear una nueva.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeepResearchView;
