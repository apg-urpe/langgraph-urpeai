'use client';

import React, { useEffect, lazy, Suspense, useMemo, useRef } from 'react';
import { X, Building2, Loader2, Eye, Home } from 'lucide-react';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase-client';
import { useAdminStore, selectActiveView, selectIsTeamFilterRestricted } from '../../store/adminStore';
import { useEngagement } from '@/hooks/useEngagement';
import type { ModuleName } from '@/lib/engagement-tracker';
import { 
  useContactStore, 
  selectUserContext, 
  selectAvailableEnterprises, 
  selectSelectedEnterpriseId,
  selectIsObservationMode,
  selectHomeEnterpriseId,
  selectError,
  URPE_LAB_ENTERPRISE_ID
} from '../../store/contactStore';
import { NotificationButton } from '../notifications/NotificationButton';
import { NotificationDropdown } from '../notifications/NotificationDropdown';
import { EmailConnectionButton } from '../notifications/EmailConnectionButton';
import { TeamMemberFilter } from './filters/TeamMemberFilter';
import { AccessDeniedScreen, parseAccessDeniedError } from './AccessDeniedScreen';

// ============================================
// LAZY LOADED VIEWS (Code Splitting)
// ============================================
const DashboardView = lazy(() => import('./DashboardView').then(m => ({ default: m.DashboardView })));
const ContactsFunnelView = lazy(() => import('./ContactsFunnelView').then(m => ({ default: m.ContactsFunnelView })));
const CalendarView = lazy(() => import('./CalendarView').then(m => ({ default: m.CalendarView })));
const SettingsView = lazy(() => import('./SettingsView').then(m => ({ default: m.SettingsView })));
const TasksView = lazy(() => import('./tasks/TasksView').then(m => ({ default: m.TasksView })));
const DeepResearchView = lazy(() => import('./research/DeepResearchView').then(m => ({ default: m.DeepResearchView })));
const TeamView = lazy(() => import('./team/TeamView').then(m => ({ default: m.TeamView })));
const UserProfileView = lazy(() => import('./profile/UserProfileView').then(m => ({ default: m.UserProfileView })));
const ObservabilityDashboard = lazy(() => import('./ObservabilityDashboard').then(m => ({ default: m.ObservabilityDashboard })));
const EmailInboxView = lazy(() => import('./emails/EmailInboxView').then(m => ({ default: m.EmailInboxView })));
const ArtifactsView = lazy(() => import('./ArtifactsView').then(m => ({ default: m.ArtifactsView })));
const EmailMarketingView = lazy(() => import('./email-marketing/EmailMarketingView').then(m => ({ default: m.EmailMarketingView })));
const AcademyView = lazy(() => import('../../training/components/AcademyView').then(m => ({ default: m.AcademyView })));
const RedaccionView = lazy(() => import('./redaccion/RedaccionView').then(m => ({ default: m.RedaccionView })));
const TranscripcionesView = lazy(() => import('./transcripciones/TranscripcionesView').then(m => ({ default: m.TranscripcionesView })));
const EnterpriseInboxView = lazy(() => import('./messages/EnterpriseInboxView').then(m => ({ default: m.EnterpriseInboxView })));

// Loading fallback for lazy views
const ViewLoadingFallback = () => (
  <div className="flex items-center justify-center h-full min-h-[200px]">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      <span className="text-xs text-zinc-500">Cargando vista...</span>
    </div>
  </div>
);

// View title mapping
const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  contacts: 'Contactos',
  funnel: 'Contactos',
  portfolio: 'Cartera',
  activity: 'Contactos',
  tasks: 'Tareas',
  team: 'Equipo',
  calendar: 'Calendario / Transcripciones',
  settings: 'Configuración',
  profile: 'Mi Perfil',
  observability: 'Observabilidad',
  research: 'Deep Research',
  emails: 'Mi Email IA',
  artifacts: 'Artefactos',
  'email-marketing': 'Email Marketing',
  marketing: 'Marketing',
  redaccion: 'Lab Redacción',
  transcripciones: 'Calendario / Transcripciones',
  'chat-inbox': 'Conversaciones',
};

// Map admin views to engagement module names
const viewToModule: Record<string, ModuleName> = {
  dashboard: 'dashboard',
  contacts: 'contacts',
  funnel: 'funnel',
  tasks: 'tasks',
  activity: 'activity',
  team: 'team',
  calendar: 'calendar',
  settings: 'settings',
  profile: 'profile',
  observability: 'observability',
  research: 'research',
  emails: 'emails',
  artifacts: 'artifacts',
  'email-marketing': 'email-marketing',
  redaccion: 'redaccion',
  transcripciones: 'transcripciones',
  'chat-inbox': 'chat',
};

export const AdminPanel: React.FC = () => {
  const activeView = useAdminStore(selectActiveView);
  const setActiveView = useAdminStore(state => state.setActiveView);
  const closeAdminPanel = useAdminStore(state => state.closeAdminPanel);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [authEmail, setAuthEmail] = React.useState<string | null>(null);
  
  // Engagement tracking
  const { trackPageView, trackAction } = useEngagement();
  const lastTrackedView = useRef<string | null>(null);
  
  // Contact store state for global enterprise selector
  const userContext = useContactStore(selectUserContext);
  const availableEnterprises = useContactStore(selectAvailableEnterprises);
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const fetchUserContext = useContactStore(state => state.fetchUserContext);
  const setSelectedEnterprise = useContactStore(state => state.setSelectedEnterprise);
  const isObservationMode = useContactStore(selectIsObservationMode);
  const homeEnterpriseId = useContactStore(selectHomeEnterpriseId);
  const selectContact = useContactStore(state => state.selectContact);
  const storeError = useContactStore(selectError);
  
  // Check for access denied errors
  const { isAccessDenied, reason: accessDeniedReason } = parseAccessDeniedError(storeError);

  // Preload actions
  const preloadEnterpriseData = useContactStore(state => state.preloadEnterpriseData);

  // Initialize user context on mount - Protected against race conditions in contactStore
  useEffect(() => {
    if (!userContext) {
      fetchUserContext();
    }
  }, [userContext, fetchUserContext]);

  // Get auth email for access denied screen (when userContext is not available)
  useEffect(() => {
    const getAuthEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setAuthEmail(user.email);
      }
    };
    if (isAccessDenied && !userContext?.email) {
      getAuthEmail();
    }
  }, [isAccessDenied, userContext?.email]);

  // Track page views when view changes
  useEffect(() => {
    if (activeView && activeView !== lastTrackedView.current) {
      const moduleName = viewToModule[activeView] || 'dashboard';
      trackPageView(moduleName);
      lastTrackedView.current = activeView;
    }
  }, [activeView, trackPageView]);

  // Listen for openContactDetail event (from tasks or other modules)
  useEffect(() => {
    const handleOpenContact = (event: CustomEvent) => {
      const { contactId } = event.detail;
      if (contactId) {
        logger.debug('[AdminPanel] 🔗 Handling openContactDetail event:', contactId);
        setActiveView('contacts');
        setTimeout(() => {
          selectContact(contactId);
        }, 100);
      }
    };

    window.addEventListener('openContactDetail', handleOpenContact as EventListener);
    return () => {
      window.removeEventListener('openContactDetail', handleOpenContact as EventListener);
    };
  }, [setActiveView, selectContact]);

  useEffect(() => {
    if (selectedEnterpriseId) {
      logger.debug('[AdminPanel] Triggering background preload for enterprise:', selectedEnterpriseId);
      preloadEnterpriseData();
    }
  }, [selectedEnterpriseId, preloadEnterpriseData]);

  // Check if user has multi-enterprise access (role_id = 1)
  const canSwitchEnterprise = userContext?.roleId === 1 && availableEnterprises.length > 1;
  const currentEnterprise = availableEnterprises.find(e => e.id === selectedEnterpriseId);

  // Render the active view with Suspense for lazy loading
  const renderView = useMemo(() => {
    const ViewComponent = (() => {
      // Security check: restrict views based on user role
      const isDev = userContext?.roleId === 1;
      const isAdmin = userContext?.roleId === 2;

      // 1. Observability restricted to Dev Team
      if (activeView === 'observability' && !isDev) {
        return DashboardView;
      }

      // 2. Team view restricted to Admin/Dev
      if (activeView === 'team' && !isDev && !isAdmin) {
        return DashboardView;
      }

      switch (activeView) {
        case 'dashboard':
          return DashboardView;
        case 'contacts':
        case 'funnel':
        case 'portfolio':
        case 'activity':
          return ContactsFunnelView;
        case 'calendar':
          return CalendarView;
        case 'tasks':
          return TasksView;
        case 'research':
          return DeepResearchView;
        case 'team':
          return TeamView;
        case 'settings':
          return SettingsView;
        case 'profile':
          return UserProfileView;
        case 'observability':
          return ObservabilityDashboard;
        case 'emails':
          return EmailInboxView;
        case 'artifacts':
          return ArtifactsView;
        case 'email-marketing':
          return EmailMarketingView;
        case 'marketing':
          return EmailMarketingView;
        case 'academy':
          return AcademyView;
        case 'redaccion':
          return RedaccionView;
        case 'transcripciones':
          return TranscripcionesView;
        case 'chat-inbox':
          return EnterpriseInboxView;
        default:
          return DashboardView;
      }
    })();
    
    return (
      <div className="h-full w-full">
        <Suspense fallback={<ViewLoadingFallback />}>
          <ViewComponent />
        </Suspense>
      </div>
    );
  }, [activeView, userContext]);

  // ============================================
  // ACCESS DENIED: Show blocking screen
  // ============================================
  if (isAccessDenied) {
    return (
      <AccessDeniedScreen 
        reason={accessDeniedReason}
        userEmail={userContext?.email || authEmail || undefined}
        onRetry={fetchUserContext}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] overflow-hidden">
      
      {/* Header with Global Enterprise Selector */}
      <header className="shrink-0 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-sm relative z-50">
        {/* Top row: Title and close */}
        <div className="h-10 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-200">
              {viewTitles[activeView] || 'Panel'}
            </h2>
            <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
              Panel v2.55
            </span>
          </div>
          
          {/* Close / Menu */}
          <div className="flex items-center gap-1">
            {/* Email Connection Status */}
            <EmailConnectionButton className="hover:bg-white/5" />

            {/* Notifications Button */}
            <div className="relative">
              <NotificationButton 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                isActive={isNotificationsOpen}
                className="hover:bg-white/5"
              />
              <NotificationDropdown 
                isOpen={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
              />
            </div>

            <button
              onClick={closeAdminPanel}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors ml-1"
              title="Cerrar Panel"
            >
              <X className="w-4 h-4 md:hidden" />
              <X className="w-4 h-4 hidden md:block" />
            </button>
          </div>
        </div>

        {/* Global Filters Row (Enterprise + Team) */}
        <div className="h-10 px-4 flex items-center gap-4 border-t border-white/5">
          {/* Enterprise Selector */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />
            
            {!userContext ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Cargando...</span>
              </div>
            ) : canSwitchEnterprise ? (
              <select
                value={selectedEnterpriseId || ''}
                onChange={(e) => setSelectedEnterprise(Number(e.target.value))}
                className="flex-1 bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-primary-500/50 cursor-pointer"
              >
                {availableEnterprises.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.nombre}</option>
                ))}
              </select>
            ) : currentEnterprise ? (
              <span className="text-xs text-zinc-400 truncate">{currentEnterprise.nombre}</span>
            ) : (
              <span className="text-xs text-zinc-600">Sin empresa asignada</span>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-white/10" />

          {/* Team Member Filter (Global) */}
          <TeamMemberFilter className="flex-1 min-w-0" compact />
        </div>
      </header>

      {/* Enterprise Context Banner - Visible when dev team is viewing a non-home enterprise */}
      {isObservationMode && (
        <div className="shrink-0 bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400 text-xs">
            <Eye className="w-4 h-4" />
            <span className="font-medium">Empresa Externa</span>
            <span className="text-cyan-300/70">— No estás en Urpe AI Lab.</span>
            <span className="text-emerald-400/80 ml-1">Todas las acciones están habilitadas.</span>
          </div>
          <button 
            onClick={() => setSelectedEnterprise(homeEnterpriseId || URPE_LAB_ENTERPRISE_ID)}
            className="flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-md transition-all active:scale-95"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Volver a Urpe AI Lab</span>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#0c0c0e] md:pr-3">
        {renderView}
      </div>

    </div>
  );
};

// Placeholder component for views not yet implemented
const PlaceholderView: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="h-full flex flex-col items-center justify-center p-8 text-center">
    <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
      <span className="text-2xl">🚧</span>
    </div>
    <h3 className="text-lg font-semibold text-zinc-300 mb-2">{title}</h3>
    <p className="text-sm text-zinc-500 max-w-xs">{description}</p>
    <p className="text-xs text-zinc-600 mt-4">Vista en desarrollo</p>
  </div>
);
