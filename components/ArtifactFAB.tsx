'use client';

import { useState, useEffect, useMemo } from 'react';
import { BookMarked } from 'lucide-react';
import { useArtifactStore, selectArtifacts } from '@/store/artifactStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

export const ArtifactFAB: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const artifacts = useArtifactStore(selectArtifacts);
  const fetchArtifacts = useArtifactStore(state => state.fetchArtifacts);
  const openExistingArtifact = useArtifactStore(state => state.openExistingArtifact);
  const userId = useAuthStore(state => state.user?.id);
  const activeSessionId = useChatStore(state => state.activeSessionId);

  // Delayed entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Lazy-fetch artifacts if not loaded yet
  useEffect(() => {
    if (userId && artifacts.length === 0) {
      fetchArtifacts(userId);
    }
  }, [userId, artifacts.length, fetchArtifacts]);

  // Last artifact of the current session (most recently updated)
  const lastSessionArtifact = useMemo(() => {
    if (!activeSessionId) return null;
    const sessionArtifacts = artifacts
      .filter(a => a.session_id === activeSessionId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return sessionArtifacts[0] || null;
  }, [artifacts, activeSessionId]);

  // Don't show if no artifact in current session
  if (!isVisible || !lastSessionArtifact) return null;

  const handleClick = () => {
    openExistingArtifact(lastSessionArtifact.id);
  };

  return (
    <button
      onClick={handleClick}
      aria-label={`Abrir artifact: ${lastSessionArtifact.title}`}
      title={lastSessionArtifact.title}
      className={`
        fixed z-40 group
        bottom-36 right-4
        md:bottom-8 md:right-8

        w-14 h-14 rounded-2xl
        flex items-center justify-center

        backdrop-blur-xl bg-white/[0.06] border border-white/10
        shadow-[0_4px_24px_rgba(0,0,0,0.25)]

        hover:bg-white/[0.1] hover:border-white/20
        hover:shadow-[0_0_25px_rgba(var(--primary-500),0.3)]
        hover:scale-105
        active:scale-95

        transition-all duration-300 ease-out
        animate-bounce-in
      `}
    >
      {/* Icon with micro-rotation on hover */}
      <BookMarked className="w-5 h-5 text-zinc-300 group-hover:text-white group-hover:rotate-[-8deg] transition-all duration-300" />

      {/* Glow ring on hover */}
      <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ring-1 ring-primary-400/20" />
    </button>
  );
};
