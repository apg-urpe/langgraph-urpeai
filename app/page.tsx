"use client";

import React, { useEffect, lazy, Suspense, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { AccessDeniedScreen, parseAccessDeniedError } from '@/components/admin/AccessDeniedScreen';
import { useArtifactStore, selectPanel } from '@/store/artifactStore';
import { useAdminStore, selectIsAdminPanelOpen, selectAdminPanelWidth, selectIsMaximized } from '@/store/adminStore';
import { LoginPage } from '@/components/LoginPage';
import { ChatArea } from '@/components/ChatArea';
import { ArtifactPanel } from '@/components/ArtifactPanel';
import { ArtifactSidebar } from '@/components/ArtifactSidebar';
import { ArtifactFAB } from '@/components/ArtifactFAB';
import { DeepResearchNotifications } from '@/components/DeepResearchNotifications';
import { ResizeHandle } from '@/components/ResizeHandle';
import { ThemeManager } from '@/components/ThemeManager';
import { InitialLoader } from '@/components/InitialLoader';
import { DynamicBackground } from '@/components/DynamicBackground';
import { ErrorBoundary, AdminErrorBoundary, ChatErrorBoundary } from '@/components/ErrorBoundary';
import useChatReliable from '@/hooks/useChatReliable';
import { useNotifications } from '@/hooks/useNotifications';
import { useStartupNotifications } from '@/hooks/useStartupNotifications';
import { usePresence } from '@/hooks/usePresence';
import { ChatSession } from '@/types';

// Lazy load heavy components
const AdminNavBar = lazy(() => import('@/components/admin/AdminNavBar').then(m => ({ default: m.AdminNavBar })));
const AdminPanel = lazy(() => import('@/components/admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
const MobileNavBar = lazy(() => import('@/components/mobile/MobileNavBar').then(m => ({ default: m.MobileNavBar })));
const MobileMoreMenu = lazy(() => import('@/components/mobile/MobileMoreMenu').then(m => ({ default: m.MobileMoreMenu })));
const ChatSidebar = lazy(() => import('@/components/ChatSidebar').then(m => ({ default: m.ChatSidebar })));

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400"></div>
  </div>
);

export default function App() {
  // Auth Store - Use primitives to prevent re-renders
  const userId = useAuthStore(state => state.user?.id);
  const userEmail = useAuthStore(state => state.user?.email);
  const isAuthenticated = useAuthStore(state => !!state.user);
  const isAuthLoading = useAuthStore(state => state.isLoading);
  const initialize = useAuthStore(state => state.initialize);

  // Chat Store - Optimized Selectors
  const sessions = useChatStore(state => state.sessions);
  const activeSessionId = useChatStore(state => state.activeSessionId);
  const setActiveSession = useChatStore(state => state.setActiveSession);
  const createNewSession = useChatStore(state => state.createNewSession);
  const deleteSession = useChatStore(state => state.deleteSession);
  const syncSessions = useChatStore(state => state.syncSessions);
  const loadSessionsFromDb = useChatStore(state => state.loadSessionsFromDb);
  const pendingMessage = useChatStore(state => state.pendingMessage);
  const consumePendingMessage = useChatStore(state => state.consumePendingMessage);
  
  // Artifact Store
  const artifactPanel = useArtifactStore(selectPanel);
  const isArtifactOpen = artifactPanel.isOpen;
  
  // Artifact Sidebar state
  const [isArtifactSidebarOpen, setIsArtifactSidebarOpen] = useState(false);
  
  // Admin Store - Panel State
  const isAdminPanelOpen = useAdminStore(selectIsAdminPanelOpen);
  const isMaximized = useAdminStore(selectIsMaximized);
  const adminPanelWidth = useAdminStore(selectAdminPanelWidth);
  const setAdminPanelWidth = useAdminStore(state => state.setAdminPanelWidth);
  const closeAdminPanel = useAdminStore(state => state.closeAdminPanel);
  
  // PERFORMANCE: Suppress width transition on first render to prevent CLS
  // The panel would jump from 0px → adminPanelWidth causing a massive layout shift
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    // Enable transitions after first paint
    const raf = requestAnimationFrame(() => {
      setHasHydrated(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  
  // Chat Hook - Reliable delivery with UI Message Protocol
  const { 
    messages, 
    sendMessage, 
    stopGeneration, 
    isLoading,
    isStreaming, 
    isLoadingMessages,
    getTraceForMessage,
    currentToolParts,
    toolPartsByMessageId,
    isToolExecuting
  } = useChatReliable();
  
  // Notifications Hook - Initialize realtime notifications
  useNotifications();

  // Presence Hook - Track online team members via Supabase Presence
  usePresence();

  // Startup Notifications - Check for upcoming appointments and tasks (with delay)
  useStartupNotifications();
  
  // Chat Sidebar state - visible when admin panel is closed (fullscreen chat)
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);

  // Contact Store - For enterprise context (required for Monica chat)
  const fetchUserContext = useContactStore(state => state.fetchUserContext);
  const fetchEnterpriseProfile = useContactStore(state => state.fetchEnterpriseProfile);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const userContextLoaded = useContactStore(state => !!state.userContext);
  const userContext = useContactStore(state => state.userContext);
  const storeError = useContactStore(state => state.error);
  const { isAccessDenied, reason: accessDeniedReason } = parseAccessDeniedError(storeError);

  // Initialize Auth on Mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Load User Context when authenticated (required for Monica to know the enterprise)
  useEffect(() => {
    if (userId && !userContextLoaded) {
      fetchUserContext();
    }
  }, [userId, userContextLoaded, fetchUserContext]);

  // Load Enterprise Profile when enterprise is selected (critical for Monica chat context)
  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchEnterpriseProfile(selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, fetchEnterpriseProfile]);

  // Sync Sessions when User Authenticates - Load from Supabase first
  useEffect(() => {
    if (userId) {
      loadSessionsFromDb(userId).then(() => {
        syncSessions();
      });
    }
  }, [userId, loadSessionsFromDb, syncSessions]);

  // Auto-send pending message from cross-module (e.g., Transcripciones → Monica Chat)
  useEffect(() => {
    if (pendingMessage) {
      const timer = setTimeout(() => {
        const msg = consumePendingMessage();
        if (msg) {
          sendMessage(msg);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pendingMessage, consumePendingMessage, sendMessage]);

  // Handle Auth Loading State
  if (isAuthLoading) {
    return <InitialLoader />;
  }

  // If not authenticated, show Login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (isAccessDenied) {
    return (
      <AccessDeniedScreen
        reason={accessDeniedReason}
        userEmail={userContext?.email || userEmail || undefined}
        onRetry={fetchUserContext}
      />
    );
  }

  // --- Main App Logic (Protected) ---
  const currentSession = sessions[activeSessionId];
  const isChatThinking = currentSession?.isThinking || false;
  const isChatStreaming = currentSession?.isStreaming || false;

  const sessionList = (Object.values(sessions) as ChatSession[]).sort((a, b) => {
    const pinDelta = Number(b.isPinned ?? false) - Number(a.isPinned ?? false);
    if (pinDelta !== 0) return pinDelta;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Handle admin panel resize
  const handleAdminPanelResize = (delta: number) => {
    const proposedWidth = adminPanelWidth + delta;
    
    if (typeof window !== 'undefined') {
      const NAV_WIDTH = 48;
      const CHAT_MIN_WIDTH = 380;
      const maxPanelWidth = window.innerWidth - NAV_WIDTH - CHAT_MIN_WIDTH;
      
      if (proposedWidth > maxPanelWidth) {
        setAdminPanelWidth(maxPanelWidth);
        return;
      }
    }
    
    setAdminPanelWidth(proposedWidth);
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex bg-[#020204] text-zinc-100 font-sans overflow-hidden selection:bg-primary-500/30 selection:text-primary-100 transition-colors duration-500">
      
      {/* THEME CONTROLLER */}
      <ThemeManager />

      {/* ====== LEFT ZONE: ADMIN NAV + PANEL (Desktop) ====== */}
      <div className={`h-full hidden md:flex shrink-0 relative z-30 min-w-0 ${isMaximized ? 'flex-1' : ''}`}>
        
        {/* Admin Navigation Bar - Desktop only */}
        <Suspense fallback={<LoadingFallback />}>
          <AdminNavBar />
        </Suspense>
        
        {/* Admin Panel - Desktop: Expandable/Collapsible column */}
        <div 
          className={`h-full bg-[#0c0c0e] border-r border-white/5 overflow-hidden relative min-w-0 ${
            isMaximized ? 'flex-1' : ''
          }`}
          style={{ 
            width: isMaximized 
              ? 'auto' 
              : isAdminPanelOpen 
                ? `${adminPanelWidth}px` 
                : '0px',
            transition: hasHydrated ? 'width 0.3s ease-out' : 'none'
          }}
        >
          {(isAdminPanelOpen || isMaximized) && (
            <Suspense fallback={<LoadingFallback />}>
              <AdminErrorBoundary>
                <AdminPanel />
              </AdminErrorBoundary>
            </Suspense>
          )}
          {/* Only show resize handle when not maximized */}
          {!isMaximized && isAdminPanelOpen && (
            <ResizeHandle 
              position="right" 
              onResize={handleAdminPanelResize}
            />
          )}
        </div>
      </div>

      {/* ====== MOBILE: Admin Panel as Drawer Overlay ====== */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeAdminPanel}
          />
          
          {/* Drawer Panel - Full screen on mobile */}
          <div className="absolute inset-0 bg-[#0c0c0e] shadow-2xl animate-slide-in-right">
            <Suspense fallback={<LoadingFallback />}>
              <AdminErrorBoundary>
                <AdminPanel />
              </AdminErrorBoundary>
            </Suspense>
          </div>
        </div>
      )}

      {/* ====== RIGHT ZONE: CHAT ECOSYSTEM (Hidden when maximized) ====== */}
      <div className={`flex-1 h-full relative overflow-hidden flex transition-all duration-300 ${
        isMaximized ? 'hidden md:w-0 md:opacity-0 md:overflow-hidden' : ''
      }`}>
        
        {/* Chat Sidebar - Shows when admin panel is closed (fullscreen chat mode) */}
        {!isAdminPanelOpen && (
          <div className="hidden md:block h-full shrink-0 relative z-20">
            <Suspense fallback={<LoadingFallback />}>
              <ChatSidebar
                sessions={sessionList}
                activeSessionId={activeSessionId}
                onNewChat={createNewSession}
                onSelectSession={setActiveSession}
                onDeleteSession={deleteSession}
                isOpen={isChatSidebarOpen}
                onToggle={() => setIsChatSidebarOpen(!isChatSidebarOpen)}
              />
            </Suspense>
          </div>
        )}
        
        {/* DYNAMIC BACKGROUND - Only in Chat Zone */}
        <div className="absolute inset-0 z-0">
          <DynamicBackground />
        </div>

        {/* Global Cinematic Noise Overlay */}
        <div className="bg-noise absolute inset-0 z-[1] pointer-events-none"></div>

        {/* Main Content Area */}
        <main className="flex-1 h-full relative w-full overflow-hidden z-10">
          
          {/* --- CHAT AREA (Now always full width) --- */}
          <div className="h-full relative w-full">
            <ChatErrorBoundary>
              <ChatArea 
                messages={messages} 
                onSendMessage={sendMessage}
                onStopGeneration={stopGeneration}
                isThinking={isChatThinking || isLoading}
                isStreaming={isChatStreaming || isStreaming}
                isLoadingMessages={isLoadingMessages}
                agentProgress={{ status: isToolExecuting ? 'processing' : (isLoading ? (isStreaming ? 'streaming' : 'thinking') : 'idle'), stepCount: 0, lastUpdate: Date.now() }}
                sessions={sessionList}
                activeSessionId={activeSessionId}
                onNewChat={createNewSession}
                onSelectSession={setActiveSession}
                onDeleteSession={deleteSession}
                onOpenArtifactLibrary={() => setIsArtifactSidebarOpen(true)}
                getTraceForMessage={getTraceForMessage}
                currentToolParts={currentToolParts}
                toolPartsByMessageId={toolPartsByMessageId}
              />
            </ChatErrorBoundary>
          </div>

        </main>
      </div>

      {/* ====== ARTIFACT PANEL (Modal Overlay) ====== */}
      {isArtifactOpen && (
        <ErrorBoundary componentName="ArtifactPanel">
          <ArtifactPanel />
        </ErrorBoundary>
      )}

      {/* ====== MOBILE: Bottom Navigation Bar + More Menu ====== */}
      <Suspense fallback={null}>
        <MobileNavBar />
        <MobileMoreMenu />
      </Suspense>

      {/* ====== ARTIFACT FAB ====== */}
      {!isMaximized && !isArtifactOpen && (
        <ArtifactFAB />
      )}

      {/* ====== ARTIFACT SIDEBAR (Library) ====== */}
      <ArtifactSidebar 
        isOpen={isArtifactSidebarOpen} 
        onClose={() => setIsArtifactSidebarOpen(false)} 
      />

      {/* ====== DEEP RESEARCH NOTIFICATIONS ====== */}
      <DeepResearchNotifications />

    </div>
  );
}
