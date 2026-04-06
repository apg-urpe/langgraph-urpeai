import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import {
  GamificationProfile,
  XPAction,
  XP_REWARDS,
  XPTransaction,
  DailyMission,
  LeaderboardEntry,
  EarnedBadge,
  StreakData,
  ActivityStats,
  getLevelFromXP,
  getXPProgress,
  BADGES_CATALOG,
  DEFAULT_GAMIFICATION_PROFILE,
  LEVELS
} from '../types/gamification';

// ============================================================================
// DATABASE TYPES - Matching gamification schema
// ============================================================================

// Interface que coincide con el schema SQL real (gamification.profiles)
interface DBGamificationProfile {
  team_member_id: number;
  empresa_id: number;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null; // DATE en SQL, viene como 'YYYY-MM-DD'
  created_at: string;
  updated_at: string;
}

interface DBUserBadge {
  id: number;
  team_member_id: number;
  badge_id: string;
  earned_at: string;
  context: Record<string, any>;
}

interface DBDailyMission {
  id: number;
  team_member_id: number;
  mission_date: string;
  mission_type: string;
  title: string;
  description: string;
  target_value: number;
  current_value: number;
  xp_reward: number;
  status: 'pending' | 'completed' | 'expired' | 'claimed';
  completed_at: string | null;
  claimed_at: string | null;
}

interface DBLeaderboardEntry {
  team_member_id: number;
  empresa_id: number;
  nombre: string;
  apellido: string;
  total_xp: number;
  current_level: number;
  current_streak: number;
  xp_this_week: number;
  xp_this_month: number;
  badge_count: number;
  rank_total: number;
  rank_weekly: number;
  rank_monthly: number;
}

// ============================================================================
// GAMIFICATION STORE
// Maneja el estado de gamificación del usuario actual
// ============================================================================

interface GamificationState {
  // Profile
  profile: GamificationProfile | null;
  viewingMemberId: number | null; // ID of member being viewed (for admins viewing other profiles)
  viewingMemberInfo: { nombre: string; apellido: string; email?: string } | null;
  isLoading: boolean;
  error: string | null;
  
  // Daily Missions
  dailyMissions: DailyMission[];
  missionsLastGenerated: string | null;
  
  // Leaderboard
  leaderboard: LeaderboardEntry[];
  leaderboardScope: 'weekly' | 'monthly' | 'alltime';
  
  // XP History (recent)
  recentXPTransactions: XPTransaction[];
  
  // Notifications
  pendingRewards: { type: 'badge' | 'level' | 'streak'; data: any }[];
  
  // Actions
  fetchProfile: (teamMemberId: number) => Promise<void>;
  forceRefreshProfile: () => Promise<void>; // Limpia cache y recarga
  awardXP: (action: XPAction, description?: string, relatedEntityId?: number, relatedEntityType?: string) => Promise<void>;
  checkAndUpdateStreak: () => Promise<void>;
  generateDailyMissions: () => void;
  updateMissionProgress: (missionType: string, amount: number) => void;
  fetchLeaderboard: (scope?: 'weekly' | 'monthly' | 'alltime') => Promise<void>;
  checkBadgeProgress: () => Promise<EarnedBadge[]>;
  dismissReward: (index: number) => void;
  saveProfileToServer: () => Promise<void>;
  clearLocalCache: () => void; // Para debug
  
  // Computed helpers
  getLevelInfo: () => { level: number; name: string; color: string; icon: string; progress: number; xpToNext: number };
}

// Selectors
export const selectGamificationProfile = (state: GamificationState) => state.profile;
export const selectIsGamificationLoading = (state: GamificationState) => state.isLoading;
export const selectDailyMissions = (state: GamificationState) => state.dailyMissions;
export const selectLeaderboard = (state: GamificationState) => state.leaderboard;
export const selectPendingRewards = (state: GamificationState) => state.pendingRewards;
export const selectRecentXP = (state: GamificationState) => state.recentXPTransactions;
export const selectViewingMemberId = (state: GamificationState) => state.viewingMemberId;
export const selectViewingMemberInfo = (state: GamificationState) => state.viewingMemberInfo;

// Helper: Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper: Check if same day
const isSameDay = (date1: Date, date2: Date) => {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
};

// Helper: Check if yesterday
const isYesterday = (date: Date) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
};

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      profile: null,
      viewingMemberId: null,
      viewingMemberInfo: null,
      isLoading: false,
      error: null,
      dailyMissions: [],
      missionsLastGenerated: null,
      leaderboard: [],
      leaderboardScope: 'weekly',
      recentXPTransactions: [],
      pendingRewards: [],

      fetchProfile: async (teamMemberId: number) => {
        // Limpiar errores previos y asegurar que el ID se registre
        set({ isLoading: true, error: null, viewingMemberId: teamMemberId });
        
        try {
          // Fetch team member basic info con empresa_id
          const { data: member, error: memberError } = await supabase
            .from('wp_team_humano')
            .select('id, nombre, apellido, email, empresa_id, created_at')
            .eq('id', teamMemberId)
            .single();

          if (memberError) throw memberError;

          // Store viewing member info
          set({ 
            viewingMemberId: teamMemberId,
            viewingMemberInfo: {
              nombre: member.nombre,
              apellido: member.apellido,
              email: member.email
            }
          });

          // Fetch gamification profile from schema
          const { data: dbProfile, error: profileError } = await supabase
            .schema('gamification')
            .from('profiles')
            .select('*')
            .eq('team_member_id', teamMemberId)
            .maybeSingle();

          if (profileError) {
            logger.warn('[GamificationStore] Error fetching profile:', profileError.message);
          }

          // Fetch earned badges
          const { data: dbBadges } = await supabase
            .schema('gamification')
            .from('user_badges')
            .select('*')
            .eq('team_member_id', teamMemberId);

          // Calcular estadísticas desde tablas del CRM
          const empresaId = member.empresa_id;
          let totalMessages = 0;
          let totalTasks = 0;
          let totalAppointments = 0;
          let totalContacts = 0;

          // Mensajes enviados por este usuario (filtrar por metadata.team_humano_id)
          const { count: msgCount } = await supabase
            .from('wp_mensajes')
            .select('*', { count: 'exact', head: true })
            .eq('remitente', 'humano')
            .eq('empresa_id', empresaId)
            .filter('metadata->>team_humano_id', 'eq', String(teamMemberId));
          totalMessages = msgCount || 0;

          // Tareas completadas (usando tabla relacional wp_tareas_asignados)
          const { count: taskCount } = await supabase
            .from('wp_tareas_asignados')
            .select('tarea_id, wp_tareas!inner(estado)', { count: 'exact', head: true })
            .eq('team_humano_id', teamMemberId)
            .eq('wp_tareas.estado', 'completada');
          totalTasks = taskCount || 0;

          // Citas gestionadas
          const { count: apptCount } = await supabase
            .from('wp_citas')
            .select('*', { count: 'exact', head: true })
            .eq('team_humano_id', teamMemberId);
          totalAppointments = apptCount || 0;

          // Contactos creados (si hay campo created_by o similar)
          // Por ahora usamos contactos asignados
          const { count: contactCount } = await supabase
            .from('wp_contactos')
            .select('*', { count: 'exact', head: true })
            .eq('team_humano_id', teamMemberId);
          totalContacts = contactCount || 0;

          // Build profile from DB data or defaults
          const gp = dbProfile as DBGamificationProfile | null;
          const totalXP = gp?.total_xp || 0;
          
          // Recalculate level from XP dinámicamente
          const levelConfig = getLevelFromXP(totalXP);
          const xpProgress = getXPProgress(totalXP);
          
          const today = new Date().toISOString().split('T')[0];
          
          // Determinar si la racha está activa
          const lastActivity = gp?.last_activity_date || '';
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const isStreakActive = lastActivity === today || lastActivity === yesterdayStr;
          
          const profile: GamificationProfile = {
            teamMemberId,
            totalXP: totalXP,
            currentLevel: levelConfig.level,
            xpToNextLevel: xpProgress.max - xpProgress.current,
            levelProgress: xpProgress.percent,
            streak: {
              currentStreak: gp?.current_streak || 0,
              longestStreak: gp?.longest_streak || 0,
              lastActivityDate: lastActivity,
              streakStartDate: '', // No almacenado en schema minimalista
              isActive: isStreakActive
            },
            earnedBadges: (dbBadges || []).map((b: DBUserBadge) => ({
              badgeId: b.badge_id,
              earnedAt: b.earned_at
            })),
            badgesInProgress: [],
            stats: {
              totalMessages,
              totalTasksCompleted: totalTasks,
              totalAppointments,
              totalContactsCreated: totalContacts,
              totalConversions: 0, 
              avgResponseTimeMinutes: 0,
              tasksOnTimePercent: totalTasks > 0 ? 85 : 0, 
              conversionRate: 0,
              monthlyMessages: 0,
              monthlyTasks: 0,
              monthlyAppointments: 0,
              firstActivityDate: gp?.created_at || member?.created_at || '',
              lastActivityDate: lastActivity
            },
            profileCreatedAt: gp?.created_at || member?.created_at || new Date().toISOString(),
            lastUpdatedAt: gp?.updated_at || new Date().toISOString()
          };

          logger.debug('[GamificationStore] Profile loaded from DB:', {
            teamMemberId,
            totalXP: profile.totalXP,
            level: profile.currentLevel,
            streak: profile.streak.currentStreak,
            isStreakActive: profile.streak.isActive
          });

          set({ profile, isLoading: false });

          // Update streak on load (calls server function)
          get().checkAndUpdateStreak();
          
          // Generate daily missions via server function
          get().generateDailyMissions();

        } catch (err: any) {
          logger.error('[GamificationStore] Error fetching profile:', err);
          set({ error: err.message, isLoading: false });
        }
      },

      forceRefreshProfile: async () => {
        const { viewingMemberId } = get();
        if (!viewingMemberId) {
          logger.warn('[GamificationStore] No viewingMemberId to refresh');
          return;
        }
        
        logger.info('[GamificationStore] Force refreshing profile for:', viewingMemberId);
        
        // Clear local state to force fresh load
        set({ profile: null, dailyMissions: [], missionsLastGenerated: null });
        
        // Refetch from server
        await get().fetchProfile(viewingMemberId);
      },

      clearLocalCache: () => {
        logger.info('[GamificationStore] Clearing local cache');
        set({ 
          profile: null, 
          dailyMissions: [], 
          missionsLastGenerated: null,
          recentXPTransactions: [],
          leaderboard: []
        });
        // Also clear from localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('urpe-gamification-store');
        }
      },

      awardXP: async (action, description = '', relatedEntityId, relatedEntityType) => {
        // Obtenemos el ID del usuario autenticado desde el contactStore para evitar
        // dar XP al usuario que se está visualizando (si es distinto)
        let authUserId: number | undefined;
        try {
          const { useContactStore } = await import('./contactStore');
          authUserId = useContactStore.getState().userContext?.id;
        } catch (err) {
          logger.warn('[GamificationStore] Could not get authUserId from contactStore');
        }

        const targetMemberId = authUserId || get().profile?.teamMemberId;
        const xpAmount = XP_REWARDS[action];
        
        console.log('[GamificationStore] awardXP call:', { 
          action, 
          targetMemberId, 
          authUserId, 
          xpAmount 
        });

        if (!targetMemberId) {
          logger.warn('[GamificationStore] No target member ID for awardXP');
          return;
        }

        if (xpAmount === 0 && action !== 'badge_earned') {
          console.log('[GamificationStore] Skipping awardXP: xpAmount is 0');
          return;
        }

        const currentProfile = get().profile;
        const isOwnProfile = currentProfile?.teamMemberId === targetMemberId;
        const oldLevel = currentProfile?.currentLevel || 1;

        try {
          console.log('[GamificationStore] Calling award_xp RPC...');
          // Call atomic server function
          const { data, error } = await supabase
            .schema('gamification')
            .rpc('award_xp', {
              p_team_member_id: targetMemberId,
              p_action_type: action,
              p_xp_amount: xpAmount,
              p_description: description || action.replace(/_/g, ' '),
              p_related_entity_type: relatedEntityType || null,
              p_related_entity_id: relatedEntityId || null
            });

          if (error) {
            console.error('[GamificationStore] RPC award_xp error:', error);
            throw error;
          }

          console.log('[GamificationStore] RPC award_xp success:', data);
          
          const result = data?.[0] || { 
            new_total_xp: (isOwnProfile ? currentProfile?.totalXP || 0 : 0) + xpAmount, 
            new_level: oldLevel, 
            leveled_up: false 
          };
          
          const newLevelConfig = getLevelFromXP(result.new_total_xp);
          const xpProgress = getXPProgress(result.new_total_xp);

          // Create transaction for local history
          const transaction: XPTransaction = {
            id: generateId(),
            action,
            amount: xpAmount,
            description: description || action.replace(/_/g, ' '),
            timestamp: new Date().toISOString(),
            relatedEntityId,
            relatedEntityType
          };

          // Solo actualizamos el estado local si el premio es para el perfil que tenemos cargado
          if (isOwnProfile && currentProfile) {
            set((state) => ({
              profile: {
                ...currentProfile,
                totalXP: result.new_total_xp,
                currentLevel: result.new_level,
                levelProgress: xpProgress.percent,
                xpToNextLevel: xpProgress.max - xpProgress.current,
                lastUpdatedAt: new Date().toISOString()
              },
              recentXPTransactions: [transaction, ...state.recentXPTransactions].slice(0, 50),
              pendingRewards: result.leveled_up 
                ? [...state.pendingRewards, { type: 'level', data: newLevelConfig }]
                : state.pendingRewards
            }));
          } else {
            // Si es para el usuario autenticado pero no es el perfil que está viendo,
            // registramos la transacción y la notificación de todas formas
            set((state) => ({
              recentXPTransactions: [transaction, ...state.recentXPTransactions].slice(0, 50),
              pendingRewards: result.leveled_up 
                ? [...state.pendingRewards, { type: 'level', data: newLevelConfig }]
                : state.pendingRewards
            }));
          }

          // Update mission progress based on action (solo si es el usuario autenticado)
          if (isOwnProfile) {
            if (action === 'message_sent') {
              get().updateMissionProgress('messages', 1);
            } else if (action === 'task_completed' || action === 'task_completed_on_time') {
              get().updateMissionProgress('tasks', 1);
            } else if (action === 'appointment_completed' || action === 'appointment_scheduled') {
              get().updateMissionProgress('appointments', 1);
            }
          }

        } catch (err) {
          logger.error('[GamificationStore] Error awarding XP:', err);
        }
      },

      checkAndUpdateStreak: async () => {
        const { profile } = get();
        if (!profile) return;

        try {
          // Call server function to update streak atomically
          const { data, error } = await supabase
            .schema('gamification')
            .rpc('update_streak', {
              p_team_member_id: profile.teamMemberId
            });

          if (error) {
            logger.warn('[GamificationStore] RPC update_streak failed:', error.message);
            throw error;
          }

          const result = data?.[0] || { current_streak: profile.streak.currentStreak, streak_broken: false, milestone_reached: null };
          
          logger.debug('[GamificationStore] Streak updated from server:', result);
          
          const today = new Date().toISOString().split('T')[0];
          const lastActivityDate = profile.streak.lastActivityDate;
          
          // Otorga XP por daily_login si es el primer login de hoy
          if (lastActivityDate !== today) {
            get().awardXP('daily_login', 'Login diario');
          }

          const newStreak: StreakData = {
            currentStreak: result.current_streak,
            longestStreak: Math.max(profile.streak.longestStreak, result.current_streak),
            lastActivityDate: today,
            streakStartDate: result.streak_broken ? today : profile.streak.streakStartDate,
            isActive: true
          };

          set((state) => ({
            profile: state.profile ? { ...state.profile, streak: newStreak } : null
          }));

          // Refetch XP totals from server to stay in sync
          const { data: freshProfile } = await supabase
            .schema('gamification')
            .from('profiles')
            .select('total_xp, current_streak, longest_streak')
            .eq('team_member_id', profile.teamMemberId)
            .maybeSingle();

          if (freshProfile) {
            const levelConfig = getLevelFromXP(freshProfile.total_xp);
            const xpProgress = getXPProgress(freshProfile.total_xp);
            
            set((state) => ({
              profile: state.profile ? {
                ...state.profile,
                totalXP: freshProfile.total_xp,
                currentLevel: levelConfig.level,
                levelProgress: xpProgress.percent,
                xpToNextLevel: xpProgress.max - xpProgress.current,
                streak: {
                  ...state.profile.streak,
                  currentStreak: freshProfile.current_streak,
                  longestStreak: freshProfile.longest_streak
                }
              } : null
            }));

            logger.debug('[GamificationStore] Profile synced with server:', {
              totalXP: freshProfile.total_xp,
              level: levelConfig.level,
              streak: freshProfile.current_streak
            });
          }

          // Check for milestone notification
          if (result.milestone_reached) {
            get().awardXP('streak_milestone', `Racha de ${result.milestone_reached} días`);
            set((state) => ({
              pendingRewards: [...state.pendingRewards, { type: 'streak', data: result.milestone_reached }]
            }));
          }

        } catch (err: any) {
          logger.error('[GamificationStore] Error updating streak:', err?.message || err);
          // Fallback: mark as active today locally
          const today = new Date().toISOString().split('T')[0];
          set((state) => ({
            profile: state.profile ? {
              ...state.profile,
              streak: { ...state.profile.streak, lastActivityDate: today, isActive: true }
            } : null
          }));
        }
      },

      generateDailyMissions: async () => {
        const { profile } = get();
        if (!profile) return;

        const today = new Date().toISOString().split('T')[0];

        try {
          // Call server function to generate/get today's missions
          const { data, error } = await supabase
            .schema('gamification')
            .rpc('generate_daily_missions', {
              p_team_member_id: profile.teamMemberId
            });

          if (error) throw error;

          const endOfDay = new Date();
          endOfDay.setHours(23, 59, 59, 999);

          const missions: DailyMission[] = (data || []).map((m: DBDailyMission) => ({
            id: `mission_${m.id}`,
            type: m.mission_type as any,
            title: m.title,
            description: m.description || '',
            target: m.target_value,
            current: m.current_value,
            xpReward: m.xp_reward,
            isCompleted: m.status === 'completed' || m.status === 'claimed',
            expiresAt: endOfDay.toISOString()
          }));

          set({ dailyMissions: missions, missionsLastGenerated: today });

        } catch (err) {
          logger.error('[GamificationStore] Error generating missions:', err);
          // Fallback: use local generation if server fails
          const { missionsLastGenerated } = get();
          if (missionsLastGenerated === today) return;

          const endOfDay = new Date();
          endOfDay.setHours(23, 59, 59, 999);

          const missionTemplates = [
            { type: 'messages', title: 'Comunicador', description: 'Envía mensajes a contactos', targets: [10, 20, 30], xp: [15, 25, 40] },
            { type: 'tasks', title: 'Productivo', description: 'Completa tareas pendientes', targets: [3, 5, 8], xp: [20, 35, 50] },
            { type: 'appointments', title: 'Agendador', description: 'Gestiona citas', targets: [2, 4, 6], xp: [25, 40, 60] },
            { type: 'contacts', title: 'Networker', description: 'Califica contactos', targets: [3, 5, 10], xp: [15, 25, 45] },
          ];

          const shuffled = missionTemplates.sort(() => Math.random() - 0.5).slice(0, 3);
          
          const missions: DailyMission[] = shuffled.map((template, idx) => {
            const difficultyIndex = Math.floor(Math.random() * 3);
            return {
              id: `mission_${today}_${idx}`,
              type: template.type as any,
              title: template.title,
              description: template.description,
              target: template.targets[difficultyIndex],
              current: 0,
              xpReward: template.xp[difficultyIndex],
              isCompleted: false,
              expiresAt: endOfDay.toISOString()
            };
          });

          set({ dailyMissions: missions, missionsLastGenerated: today });
        }
      },

      updateMissionProgress: (missionType, amount) => {
        const { dailyMissions, profile } = get();
        
        const updatedMissions = dailyMissions.map(mission => {
          if (mission.type !== missionType || mission.isCompleted) return mission;
          
          const newCurrent = Math.min(mission.current + amount, mission.target);
          const isNowCompleted = newCurrent >= mission.target;
          
          // Award XP if just completed
          if (isNowCompleted && !mission.isCompleted) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => {
              get().awardXP('task_completed', `Misión completada: ${mission.title}`);
            }, 0);
          }
          
          return {
            ...mission,
            current: newCurrent,
            isCompleted: isNowCompleted
          };
        });

        set({ dailyMissions: updatedMissions });
      },

      fetchLeaderboard: async (scope = 'weekly') => {
        const { profile } = get();
        if (!profile) return;

        // Obtener empresa_id del usuario actual
        let empresaId: number | null = null;
        try {
          const { useContactStore } = await import('./contactStore');
          empresaId = useContactStore.getState().selectedEnterpriseId || 
                      useContactStore.getState().userContext?.empresaId || null;
        } catch (err) {
          logger.warn('[GamificationStore] Could not get empresaId for leaderboard');
        }

        try {
          // Use the view for leaderboard queries, filtered by empresa
          let query = supabase
            .schema('gamification')
            .from('leaderboard_weekly')
            .select('*');
          
          // Filtrar por empresa si está disponible
          if (empresaId) {
            query = query.eq('empresa_id', empresaId);
          }
          
          // Ordenar según el scope
          const orderColumn = scope === 'weekly' ? 'rank_weekly' 
            : scope === 'monthly' ? 'rank_monthly' 
            : 'rank_total';
          query = query.order(orderColumn, { ascending: true })
            .limit(20);

          const { data, error } = await query;

          if (error) throw error;

          const entries: LeaderboardEntry[] = (data || []).map((entry: DBLeaderboardEntry) => {
            const levelConfig = getLevelFromXP(entry.total_xp);
            // Determinar el rank según el scope
            let rank = entry.rank_total;
            if (scope === 'weekly') rank = entry.rank_weekly;
            else if (scope === 'monthly') rank = entry.rank_monthly;
            
            return {
              teamMemberId: entry.team_member_id,
              nombre: entry.nombre,
              apellido: entry.apellido,
              totalXP: entry.total_xp,
              level: entry.current_level,
              levelName: levelConfig.name,
              rank,
              weeklyXP: entry.xp_this_week,
              monthlyXP: entry.xp_this_month || 0,
              streak: entry.current_streak,
              badgeCount: entry.badge_count
            };
          });

          // Ordenar por rank (la vista ya ordena, pero esto asegura consistencia)
          entries.sort((a, b) => a.rank - b.rank);

          set({ leaderboard: entries, leaderboardScope: scope });
        } catch (err) {
          logger.error('[GamificationStore] Error fetching leaderboard:', err);
        }
      },

      checkBadgeProgress: async () => {
        const { profile } = get();
        if (!profile) return [];

        const newlyEarned: EarnedBadge[] = [];
        const { stats, earnedBadges } = profile;
        const earnedIds = new Set(earnedBadges.map(b => b.badgeId));

        // Check each badge
        for (const badge of BADGES_CATALOG) {
          if (earnedIds.has(badge.id)) continue;

          let earned = false;

          // Check conditions based on badge ID
          switch (badge.id) {
            case 'comunicador_1':
              earned = stats.totalMessages >= 50;
              break;
            case 'comunicador_2':
              earned = stats.totalMessages >= 200;
              break;
            case 'comunicador_3':
              earned = stats.totalMessages >= 1000;
              break;
            case 'constante_1':
              earned = profile.streak.longestStreak >= 7;
              break;
            case 'constante_2':
              earned = profile.streak.longestStreak >= 30;
              break;
            case 'constante_3':
              earned = profile.streak.longestStreak >= 90;
              break;
            case 'preciso_1':
              earned = stats.totalTasksCompleted >= 10 && stats.tasksOnTimePercent >= 80;
              break;
            case 'first_login':
              earned = true; // Earned on first profile load
              break;
            case 'first_task':
              earned = stats.totalTasksCompleted >= 1;
              break;
            // Add more badge checks as needed
          }

          if (earned) {
            const newBadge: EarnedBadge = {
              badgeId: badge.id,
              earnedAt: new Date().toISOString()
            };
            newlyEarned.push(newBadge);

            // Award XP for badge
            if (badge.xpReward > 0) {
              get().awardXP('badge_earned', `Medalla: ${badge.name}`);
            }

            // Add to pending rewards
            set((state) => ({
              pendingRewards: [...state.pendingRewards, { type: 'badge', data: badge }]
            }));
          }
        }

        if (newlyEarned.length > 0) {
          set((state) => ({
            profile: state.profile ? {
              ...state.profile,
              earnedBadges: [...state.profile.earnedBadges, ...newlyEarned]
            } : null
          }));
        }

        return newlyEarned;
      },

      dismissReward: (index) => {
        set((state) => ({
          pendingRewards: state.pendingRewards.filter((_, i) => i !== index)
        }));
      },

      saveProfileToServer: async () => {
        // With the new schema, saves are handled by SQL functions (award_xp, update_streak, etc.)
        // This function is kept for backwards compatibility but is now a no-op
        // All mutations go through the atomic SQL functions
        console.debug('[GamificationStore] saveProfileToServer called - handled by SQL functions');
      },

      getLevelInfo: () => {
        const { profile } = get();
        if (!profile) {
          return { level: 1, name: 'Novato', color: 'zinc', icon: 'Sprout', progress: 0, xpToNext: 100 };
        }
        const levelConfig = getLevelFromXP(profile.totalXP);
        const xpProgress = getXPProgress(profile.totalXP);
        return {
          level: levelConfig.level,
          name: levelConfig.name,
          color: levelConfig.color,
          icon: levelConfig.icon,
          progress: xpProgress.percent,
          xpToNext: xpProgress.max - xpProgress.current
        };
      }
    }),
    {
      name: 'urpe-gamification-store',
      // IMPORTANTE: NO persistir profile - siempre debe cargarse fresco del servidor
      // Solo persistimos datos de UI que no afectan la integridad de los datos
      partialize: (state) => ({
        // profile: REMOVIDO - causaba que datos viejos (0 XP) sobrescribieran datos del servidor
        dailyMissions: state.dailyMissions,
        missionsLastGenerated: state.missionsLastGenerated,
        recentXPTransactions: state.recentXPTransactions.slice(0, 20),
        leaderboardScope: state.leaderboardScope
      }),
      // Limpiar datos corruptos del localStorage anterior
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Forzar profile a null para que siempre se cargue del servidor
          state.profile = null;
          logger.debug('[GamificationStore] Rehydrated - profile reset to null for fresh fetch');
        }
      }
    }
  )
);
