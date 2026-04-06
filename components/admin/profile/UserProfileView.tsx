'use client';

import React, { useEffect, useState, lazy, Suspense } from 'react';
import { User, Flame, Star, Loader2, Users, RefreshCw } from 'lucide-react';
import { useGamificationStore, selectGamificationProfile, selectDailyMissions, selectIsGamificationLoading, selectViewingMemberInfo } from '../../../store/gamificationStore';
import { useContactStore, selectUserContext, selectTeamMembers } from '../../../store/contactStore';
import { useAdminStore, selectGlobalTeamMemberIds, selectIsTeamFilterRestricted } from '../../../store/adminStore';

// PERFORMANCE: Lazy load tab components to split the bundle
const OverviewTab = lazy(() => import('./tabs/OverviewTab').then(m => ({ default: m.OverviewTab })));
const BadgesTab = lazy(() => import('./tabs/BadgesTab').then(m => ({ default: m.BadgesTab })));
const StatsTab = lazy(() => import('./tabs/StatsTab').then(m => ({ default: m.StatsTab })));
const LeaderboardTab = lazy(() => import('./tabs/LeaderboardTab').then(m => ({ default: m.LeaderboardTab })));
const SettingsTab = lazy(() => import('./tabs/SettingsTab').then(m => ({ default: m.SettingsTab })));

const TabLoading = () => (
  <div className="flex items-center justify-center h-40">
    <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
  </div>
);

// Roles that can view other team members' profiles
const ALLOWED_VIEW_ALL_ROLES = [1, 2];

export const UserProfileView: React.FC = () => {
  const userContext = useContactStore(selectUserContext);
  const teamMembers = useContactStore(selectTeamMembers);
  const profile = useGamificationStore(selectGamificationProfile);
  const dailyMissions = useGamificationStore(selectDailyMissions);
  const isLoading = useGamificationStore(selectIsGamificationLoading);
  const viewingMemberInfo = useGamificationStore(selectViewingMemberInfo);
  const fetchProfile = useGamificationStore(state => state.fetchProfile);
  const generateDailyMissions = useGamificationStore(state => state.generateDailyMissions);
  const getLevelInfo = useGamificationStore(state => state.getLevelInfo);
  
  // Admin store - global team filter (array of selected IDs)
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const isRestricted = useAdminStore(selectIsTeamFilterRestricted);

  const [activeTab, setActiveTab] = useState<'overview' | 'badges' | 'stats' | 'leaderboard' | 'settings'>('overview');
  
  // Check if user can view all profiles
  const canViewAllProfiles = userContext?.roleId && ALLOWED_VIEW_ALL_ROLES.includes(userContext.roleId);
  
  // Determine which member's profile to show
  // When multiple members are selected, show the first one's profile
  const targetMemberId = canViewAllProfiles && globalTeamMemberIds.length > 0 
    ? globalTeamMemberIds[0] 
    : userContext?.id;

  // Get forceRefresh action
  const forceRefreshProfile = useGamificationStore(state => state.forceRefreshProfile);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await forceRefreshProfile();
    setIsRefreshing(false);
  };

  // Fetch profile when target member changes
  useEffect(() => {
    if (targetMemberId) {
      fetchProfile(targetMemberId);
    }
  }, [targetMemberId, fetchProfile]);

  // Generate missions
  useEffect(() => {
    generateDailyMissions();
  }, [generateDailyMissions]);

  if (!userContext) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <User className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  const levelInfo = getLevelInfo();
  
  // Use viewing member info if viewing another profile, otherwise use userContext
  const displayMember = viewingMemberInfo && targetMemberId !== userContext?.id
    ? viewingMemberInfo
    : userContext;
  
  const initials = `${displayMember?.nombre?.charAt(0) || ''}${displayMember?.apellido?.charAt(0) || ''}`.toUpperCase();
  const isViewingOther = targetMemberId !== userContext?.id;

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] overflow-hidden">
      
      {/* Header - Profile Card */}
      <div className="shrink-0 p-4 md:p-6 border-b border-white/5">
        {isViewingOther && (
          <div className="mb-3 px-3 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-lg inline-flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-xs text-primary-400">Viendo perfil de otro miembro</span>
          </div>
        )}
        <ProfileHeader 
          userContext={displayMember}
          levelInfo={levelInfo}
          profile={profile}
          initials={initials}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-4 md:px-6 border-b border-white/5">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {(['overview', 'badges', 'stats', 'leaderboard', 'settings'] as const).map(tab => {
            // Hide settings tab if viewing other profile
            if (tab === 'settings' && isViewingOther) return null;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-all
                  border-b-2 -mb-px
                  ${activeTab === tab 
                    ? 'text-primary-400 border-primary-500' 
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }
                `}
              >
                {tab === 'overview' && 'Resumen'}
                {tab === 'badges' && 'Medallas'}
                {tab === 'stats' && 'Estadísticas'}
                {tab === 'leaderboard' && 'Ranking'}
                {tab === 'settings' && 'Configuración'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <TabLoading />
        ) : (
          <Suspense fallback={<TabLoading />}>
            {activeTab === 'overview' && (
              <OverviewTab profile={profile} dailyMissions={dailyMissions} levelInfo={levelInfo} />
            )}
            {activeTab === 'badges' && (
              <BadgesTab profile={profile} />
            )}
            {activeTab === 'stats' && (
              <StatsTab profile={profile} />
            )}
            {activeTab === 'leaderboard' && (
              <LeaderboardTab />
            )}
            {activeTab === 'settings' && !isViewingOther && (
              <SettingsTab />
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// PROFILE HEADER
// ============================================================================

interface ProfileHeaderProps {
  userContext: any;
  levelInfo: ReturnType<typeof useGamificationStore.getState>['getLevelInfo'] extends () => infer R ? R : never;
  profile: any;
  initials: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ userContext, levelInfo, profile, initials, onRefresh, isRefreshing }) => {
  const levelColorMap: Record<string, string> = {
    zinc: 'from-zinc-500 to-zinc-700',
    emerald: 'from-emerald-500 to-emerald-700',
    cyan: 'from-cyan-500 to-cyan-700',
    violet: 'from-violet-500 to-violet-700',
    amber: 'from-amber-500 to-amber-700',
    rose: 'from-rose-500 to-rose-700'
  };

  const gradientClass = levelColorMap[levelInfo.color] || levelColorMap.zinc;

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Avatar & Level */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg`}>
            {initials}
          </div>
          {/* Level Badge */}
          <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-${levelInfo.color}-500 flex items-center justify-center text-xs font-bold text-white border-2 border-[#0c0c0e]`}>
            {levelInfo.level}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-zinc-100 truncate">
            {userContext.nombre} {userContext.apellido}
          </h1>
          <p className="text-sm text-zinc-500">{userContext.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-${levelInfo.color}-500/10 text-${levelInfo.color}-400 border border-${levelInfo.color}-500/20`}>
              <Star className="w-3 h-3" />
              {levelInfo.name}
            </span>
            {profile?.streak?.currentStreak > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Flame className="w-3 h-3" />
                {profile.streak.currentStreak}d
              </span>
            )}
          </div>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="flex-1 md:max-w-xs">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-zinc-500">Nivel {levelInfo.level}</span>
          <span className="text-zinc-400 font-medium">{profile?.totalXP || 0} XP</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${gradientClass} transition-all duration-500 ease-out`}
            style={{ width: `${levelInfo.progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[10px] text-zinc-600">
            {levelInfo.xpToNext} XP para nivel {levelInfo.level + 1}
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileView;
