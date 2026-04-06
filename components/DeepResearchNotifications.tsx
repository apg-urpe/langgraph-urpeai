'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, X, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useArtifactStore } from '../store/artifactStore';

// ============================================================================
// DEEP RESEARCH NOTIFICATIONS
// Muestra notificaciones cuando se completa una investigación
// ============================================================================

interface ResearchCompleteEvent {
  jobId: string;
  artifactId: string;
  prompt: string;
}

interface Notification {
  id: string;
  artifactId: string;
  prompt: string;
  timestamp: number;
}

export const DeepResearchNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);
  
  // Listen for research complete events
  useEffect(() => {
    const handleResearchComplete = (event: CustomEvent<ResearchCompleteEvent>) => {
      const { jobId, artifactId, prompt } = event.detail;
      
      // Add notification to state
      setNotifications(prev => [{
        id: jobId,
        artifactId,
        prompt,
        timestamp: Date.now()
      }, ...prev].slice(0, 5)); // Keep max 5 notifications
      
      // Show browser notification if permission granted
      if (Notification.permission === 'granted') {
        const notification = new Notification('🔍 Investigación Completada', {
          body: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
          icon: '/favicon.ico',
          tag: jobId,
          requireInteraction: false
        });
        
        notification.onclick = () => {
          window.focus();
          openExistingArtifact(artifactId);
          notification.close();
        };
        
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
      }
      
      // Auto-remove from UI after 10 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== jobId));
      }, 10000);
    };
    
    window.addEventListener('deep-research-complete', handleResearchComplete as EventListener);
    
    return () => {
      window.removeEventListener('deep-research-complete', handleResearchComplete as EventListener);
    };
  }, [openExistingArtifact]);
  
  // Dismiss notification
  const dismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  
  // Open artifact and dismiss
  const openAndDismiss = (notification: Notification) => {
    openExistingArtifact(notification.artifactId);
    dismiss(notification.id);
  };
  
  if (notifications.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className="bg-[#0c0c0e] border border-violet-500/30 rounded-xl shadow-[0_0_30px_rgba(139,92,246,0.2)] p-4 animate-slide-in-right"
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-violet-400" />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span className="text-xs font-bold text-violet-300">
                  Investigación Completada
                </span>
              </div>
              <p className="text-sm text-zinc-300 truncate">
                {notification.prompt}
              </p>
              <button
                onClick={() => openAndDismiss(notification)}
                className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Ver resultado <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            
            {/* Close button */}
            <button
              onClick={() => dismiss(notification.id)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DeepResearchNotifications;
