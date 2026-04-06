/**
 * Contact Store — Auth & Enterprise Slice
 * fetchUserContext, setSelectedEnterprise, fetchEnterpriseProfile, updateEnterpriseProfile,
 * isCacheValid, preloadEnterpriseData
 * @module store/contact/authSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import type { ContactState, ContactSet, ContactGet, EnterpriseProfile, UserContext } from './types';
import { initialFilters, initialPagination, initialActiveContactData } from './types';
import { URPE_LAB_ENTERPRISE_ID, DEV_TEAM_ROLE_ID, PRELOAD_CACHE_MS } from './constants';

export const createAuthSlice = (set: ContactSet, get: ContactGet) => ({

  fetchEnterpriseProfile: async (enterpriseId: number | null = null, forceRefresh = false) => {
    const { selectedEnterpriseId, enterpriseProfile } = get();
    const resolvedEnterpriseId = enterpriseId ?? selectedEnterpriseId;
    if (!resolvedEnterpriseId) return;

    if (!forceRefresh && enterpriseProfile?.id === resolvedEnterpriseId) {
      return;
    }

    set({ enterpriseProfileLoading: true, enterpriseProfileError: null });

    try {
      const { data, error } = await supabase
        .from('wp_empresa_perfil')
        .select('*')
        .eq('id', resolvedEnterpriseId)
        .maybeSingle();

      if (error) {
        logger.error('[ContactStore] Error fetching enterprise profile:', {
          error,
          enterpriseId: resolvedEnterpriseId
        });
        set({ enterpriseProfileError: error.message, enterpriseProfileLoading: false });
        return;
      }

      if (!data) {
        logger.warn('[ContactStore] No enterprise profile found for ID:', resolvedEnterpriseId);
        set({ 
          enterpriseProfile: null, 
          enterpriseProfileLoading: false,
          enterpriseProfileError: 'No se encontró el perfil de la empresa'
        });
        return;
      }

      set({
        enterpriseProfile: data as EnterpriseProfile,
        enterpriseProfileLoading: false,
        enterpriseProfileError: null
      });
    } catch (err) {
      logger.error('[ContactStore] Error in fetchEnterpriseProfile:', err);
      set({ enterpriseProfileLoading: false, enterpriseProfileError: 'Error de conexión' });
    }
  },

  updateEnterpriseProfile: async (enterpriseId: number, patch: Partial<EnterpriseProfile>) => {
    set({ enterpriseProfileLoading: true, enterpriseProfileError: null });
    try {
      const { data, error } = await supabase
        .from('wp_empresa_perfil')
        .update(patch)
        .eq('id', enterpriseId)
        .select('*')
        .single();

      if (error) {
        logger.error('[ContactStore] Error updating enterprise profile:', error);
        set({ enterpriseProfileLoading: false, enterpriseProfileError: error.message });
        return null;
      }

      set({
        enterpriseProfile: data as EnterpriseProfile,
        enterpriseProfileLoading: false,
        enterpriseProfileError: null
      });

      // Keep enterprise selector list in sync if name/logo changes
      set((state) => ({
        availableEnterprises: state.availableEnterprises.map((e) =>
          e.id === enterpriseId
            ? { ...e, nombre: (data as any)?.nombre ?? e.nombre, logo_url: (data as any)?.logo_url ?? e.logo_url }
            : e
        )
      }));

      return data as EnterpriseProfile;
    } catch (err) {
      logger.error('[ContactStore] Error in updateEnterpriseProfile:', err);
      set({ enterpriseProfileLoading: false, enterpriseProfileError: 'Error de conexión' });
      return null;
    }
  },

  // Fetch current user context from wp_team_humano
  fetchUserContext: async () => {
    // RACE CONDITION FIX: Prevent multiple simultaneous calls
    const { isLoadingUserContext } = get();
    if (isLoadingUserContext) {
      logger.debug('[ContactStore] fetchUserContext ya en progreso, ignorando llamada duplicada...');
      return;
    }
    
    // Set loading flag and clear any previous error
    set({ isLoadingUserContext: true, error: null });
    logger.debug('[ContactStore] Iniciando fetchUserContext...');
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        logger.error('[ContactStore] Error obteniendo usuario auth:', authError);
        set({ error: 'Error de autenticación' });
        return;
      }
      
      if (!user) {
        logger.debug('[ContactStore] No authenticated user');
        set({ error: 'No hay usuario autenticado' });
        return;
      }
      
      logger.debug('[ContactStore] Usuario auth encontrado:', user.id);

      // Get team member by auth_uid
      // Note: public schema is the default, no need to specify .schema('public')
      logger.debug('[ContactStore] Buscando en wp_team_humano con auth_uid:', user.id);
      const { data: teamMembers, error } = await supabase
        .from('wp_team_humano')
        .select(`
          id,
          auth_uid,
          empresa_id,
          enterprise_id,
          role_id,
          nombre,
          apellido,
          email,
          rol,
          timezone,
          grant_id,
          is_active,
          deleted
        `)
        .eq('auth_uid', user.id);

      if (error) {
        logger.error('[ContactStore] Error fetching user context:', {
          error,
          hint: error.hint
        });
        set({ error: `Error al cargar contexto: ${error.message}` });
        return;
      }
      
      const teamMember = teamMembers && teamMembers.length > 0 ? teamMembers[0] : null;
      
      if (teamMembers && teamMembers.length > 1) {
        logger.warn('[ContactStore] Se encontraron múltiples registros para el mismo auth_uid:', user.id);
      }
      
      // ============================================
      // SECURITY: Block archived users
      // ============================================
      if (teamMember && (!teamMember.is_active || teamMember.deleted)) {
        logger.warn('[ContactStore] ⛔ Usuario archivado intentó acceder:', {
          id: teamMember.id,
          email: teamMember.email,
          is_active: teamMember.is_active,
          deleted: teamMember.deleted
        });
        set({ error: 'ACCESS_DENIED:ARCHIVED' });
        return;
      }
      
      if (!teamMember) {
        // ============================================
        // AUTO-LINKING: Try to find by email and link auth_uid
        // This handles cases where the user exists but auth_uid wasn't set
        // ============================================
        logger.warn('[ContactStore] No se encontró por auth_uid, intentando auto-linking por email:', user.email);
        
        const { data: membersByEmail, error: emailError } = await supabase
          .from('wp_team_humano')
          .select(`
            id,
            auth_uid,
            empresa_id,
            enterprise_id,
            role_id,
            nombre,
            apellido,
            email,
            rol,
            timezone,
            grant_id,
            is_active,
            deleted
          `)
          .eq('email', user.email);
        
        if (emailError) {
          logger.error('[ContactStore] Error buscando por email:', emailError);
          set({ error: 'Usuario no registrado en el sistema. Contacte al administrador.' });
          return;
        }
        
        const memberByEmail = membersByEmail && membersByEmail.length > 0 ? membersByEmail[0] : null;

        if (membersByEmail && membersByEmail.length > 1) {
          logger.warn('[ContactStore] Se encontraron múltiples registros para el mismo email:', user.email);
        }
        
        if (!memberByEmail) {
          logger.warn('[ContactStore] No se encontró registro en wp_team_humano para auth_uid ni email:', user.id, user.email);
          set({ error: 'ACCESS_DENIED:NOT_REGISTERED' });
          return;
        }
        
        // ============================================
        // SECURITY: Block archived users (auto-linking path)
        // ============================================
        if (!memberByEmail.is_active || memberByEmail.deleted) {
          logger.warn('[ContactStore] ⛔ Usuario archivado intentó acceder (auto-linking):', {
            id: memberByEmail.id,
            email: memberByEmail.email,
            is_active: memberByEmail.is_active,
            deleted: memberByEmail.deleted
          });
          set({ error: 'ACCESS_DENIED:ARCHIVED' });
          return;
        }
        
        // ============================================
        // VALIDATION: Check if user has empresa_id assigned
        // ============================================
        if (!memberByEmail.empresa_id) {
          logger.warn('[ContactStore] ⚠️ Usuario sin empresa asignada:', memberByEmail.email);
          set({ error: 'ACCESS_DENIED:NO_ENTERPRISE' });
          return;
        }
        
        // Found by email - Auto-link the auth_uid
        logger.info('[ContactStore] 🔗 AUTO-LINKING: Vinculando auth_uid al registro existente', {
          teamMemberId: memberByEmail.id,
          email: user.email,
          newAuthUid: user.id
        });
        
        // Intentar auto-linking directo primero
        const { error: updateError } = await supabase
          .from('wp_team_humano')
          .update({ auth_uid: user.id })
          .eq('id', memberByEmail.id);
        
        if (updateError) {
          logger.warn('[ContactStore] Error en auto-linking directo, intentando via API:', updateError);
          
          // Fallback: usar la API de link-auth que tiene service_role
          try {
            const linkResponse = await fetch('/api/invite/link-auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email,
                auth_uid: user.id
              })
            });
            
            if (linkResponse.ok) {
              const linkResult = await linkResponse.json();
              logger.info('[ContactStore] ✅ AUTO-LINKING via API exitoso:', linkResult);
            } else {
              const linkError = await linkResponse.json();
              logger.error('[ContactStore] Error en auto-linking via API:', linkError);
              // Continue anyway - the user might still be able to access
            }
          } catch (apiError) {
            logger.error('[ContactStore] Excepción en auto-linking via API:', apiError);
          }
        } else {
          logger.info('[ContactStore] ✅ AUTO-LINKING exitoso para:', memberByEmail.email);
        }
        
        // Use the member found by email (now linked)
        const linkedMember = { ...memberByEmail, auth_uid: user.id };
        
        // Continue with the same logic as if we found the member by auth_uid
        const isDevTeam = linkedMember.role_id === DEV_TEAM_ROLE_ID;
        
        if (isDevTeam && linkedMember.empresa_id !== URPE_LAB_ENTERPRISE_ID) {
          logger.error('[ContactStore] ⛔ SECURITY VIOLATION: Dev team role in wrong enterprise', {
            userId: linkedMember.id,
            empresa_id: linkedMember.empresa_id,
            expected_empresa_id: URPE_LAB_ENTERPRISE_ID
          });
          set({ 
            error: `⚠️ Error de configuración de cuenta: Tu rol (Dev Team) no es válido para tu empresa asignada. Por favor contacta a soporte técnico para resolver este problema. ID de usuario: ${linkedMember.id}`,
            isLoading: false 
          });
          return;
        }
        
        const resolvedEnterpriseId = isDevTeam 
          ? (linkedMember.enterprise_id || linkedMember.empresa_id)
          : linkedMember.empresa_id;
        
        const userContext: UserContext = {
          id: linkedMember.id,
          authUid: user.id,
          empresaId: linkedMember.empresa_id,
          enterpriseId: resolvedEnterpriseId,
          roleId: linkedMember.role_id || 3,
          nombre: linkedMember.nombre || '',
          apellido: linkedMember.apellido || '',
          email: linkedMember.email || '',
          rol: linkedMember.rol || 'asesor',
          timezone: linkedMember.timezone || 'America/Lima',
          grantId: linkedMember.grant_id
        };

        logger.debug('[ContactStore] (Auto-linked) User context establecido:', { 
          id: userContext.id, 
          empresaId: userContext.empresaId,
          enterpriseId: userContext.enterpriseId,
          roleId: userContext.roleId
        });
        
        const isDevTeamUser = userContext.roleId === DEV_TEAM_ROLE_ID;
        const homeEnterprise = isDevTeamUser ? URPE_LAB_ENTERPRISE_ID : userContext.empresaId;
        
        // Final validation: ensure we have a valid enterprise
        if (!homeEnterprise) {
          logger.error('[ContactStore] ⚠️ No se pudo resolver empresa para usuario:', userContext.email);
          set({ error: 'ACCESS_DENIED:NO_ENTERPRISE' });
          return;
        }
        
        set({ 
          userContext,
          selectedEnterpriseId: homeEnterprise,
          homeEnterpriseId: homeEnterprise,
          isObservationMode: false,
          isLoading: false
        });
        
        return; // Exit early - auto-linking handled everything
      }
      
      logger.debug('[ContactStore] Team member encontrado:', teamMember.id);
      logger.debug('[ContactStore] Team member details:', {
        role_id: teamMember.role_id
      });

      if (teamMember) {
        // ============================================
        // SECURITY: Validate user configuration
        // ============================================
        
        // CHECK: User must have empresa_id assigned
        if (!teamMember.empresa_id) {
          logger.warn('[ContactStore] ⚠️ Usuario sin empresa asignada:', teamMember.email);
          set({ error: 'ACCESS_DENIED:NO_ENTERPRISE' });
          return;
        }
        
        const isDevTeam = teamMember.role_id === DEV_TEAM_ROLE_ID;
        
        // SECURITY CHECK: role_id=1 should ONLY exist in empresa_id=13
        if (isDevTeam && teamMember.empresa_id !== URPE_LAB_ENTERPRISE_ID) {
          logger.error('[ContactStore] ⛔ SECURITY VIOLATION: Dev team role in wrong enterprise', {
            userId: teamMember.id,
            empresa_id: teamMember.empresa_id,
            expected_empresa_id: URPE_LAB_ENTERPRISE_ID
          });
          set({ 
            error: `⚠️ Error de configuración de cuenta: Tu rol (Dev Team) no es válido para tu empresa asignada. Por favor contacta a soporte técnico para resolver este problema. ID de usuario: ${teamMember.id}`,
            isLoading: false 
          });
          return;
        }
        
        // For non-dev team, ALWAYS use empresa_id regardless of enterprise_id value
        const resolvedEnterpriseId = isDevTeam 
          ? (teamMember.enterprise_id || teamMember.empresa_id)
          : teamMember.empresa_id; // FORCE empresa_id for non-dev team
        
        const userContext: UserContext = {
          id: teamMember.id,
          authUid: teamMember.auth_uid,
          empresaId: teamMember.empresa_id,
          enterpriseId: resolvedEnterpriseId,
          roleId: teamMember.role_id || 3,
          nombre: teamMember.nombre || '',
          apellido: teamMember.apellido || '',
          email: teamMember.email || '',
          rol: teamMember.rol || 'asesor',
          timezone: teamMember.timezone || 'America/Lima',
          grantId: teamMember.grant_id
        };

        // Home enterprise is always empresa_id for non-dev, or URPE_LAB for dev team
        const homeEnterprise = isDevTeam ? URPE_LAB_ENTERPRISE_ID : teamMember.empresa_id;
        // Initial enterprise: dev team starts at Urpe AI Lab, others at their empresa_id
        const initialEnterprise = isDevTeam 
          ? URPE_LAB_ENTERPRISE_ID
          : teamMember.empresa_id; // ALWAYS empresa_id for non-dev team

        set({ 
          userContext,
          selectedEnterpriseId: initialEnterprise,
          homeEnterpriseId: homeEnterprise,
          isObservationMode: false // Start in normal mode
        });

        // If role_id = 1, fetch available enterprises (for observation access)
        if (isDevTeam) {
          const { data: enterprises } = await supabase
            .from('wp_empresa_perfil')
            .select('id, nombre, logo_url')
            .eq('activo', true) // Only show active enterprises
            .order('nombre');

          if (enterprises) {
            set({ availableEnterprises: enterprises });
          }
          
          logger.info(`[ContactStore] Dev team user initialized at Urpe AI Lab (ID: ${URPE_LAB_ENTERPRISE_ID})`);
        } else {
          // Only their own enterprise
          const { data: enterprise } = await supabase
            .from('wp_empresa_perfil')
            .select('id, nombre, logo_url')
            .eq('id', teamMember.empresa_id)
            .single();

          if (enterprise) {
            set({ availableEnterprises: [enterprise] });
          }
        }

        // Trigger initial data fetch for the selected enterprise
        const { selectedEnterpriseId } = get();
        if (selectedEnterpriseId) {
          get().fetchFunnelStages();
        }

        // Initialize gamification profile for the user
        try {
          const { useGamificationStore } = await import('../gamificationStore');
          useGamificationStore.getState().fetchProfile(teamMember.id);
          logger.debug('[ContactStore] Gamification profile fetch initiated');
        } catch (gamErr) {
          logger.warn('[ContactStore] Could not load gamification profile:', gamErr);
        }

        logger.debug('[ContactStore] User context loaded:', userContext.nombre);
      }
    } catch (err) {
      logger.error('[ContactStore] Error:', err);
      set({ error: 'Error de conexión' });
    } finally {
      // Always clear the loading flag
      set({ isLoadingUserContext: false });
    }
  },

  // Cache validation helper
  isCacheValid: (module: 'contacts' | 'appointments' | 'funnelStages') => {
    const state = get();
    const cacheMap = {
      contacts: state.contactsLastFetch,
      appointments: state.appointmentsLastFetch,
      funnelStages: state.funnelStagesLastFetch
    };
    const lastFetch = cacheMap[module];
    if (!lastFetch) return false;
    return (Date.now() - lastFetch) < PRELOAD_CACHE_MS;
  },

  // Preload enterprise data in parallel to reduce initial wait time
  preloadEnterpriseData: async () => {
    const { selectedEnterpriseId, isCacheValid } = get();
    if (!selectedEnterpriseId) return;

    logger.debug('[ContactStore] 🚀 Preloading enterprise data...');

    // Run independent fetches in parallel
    const promises: Promise<unknown>[] = [];

    if (!isCacheValid('contacts')) {
      promises.push(get().fetchContacts());
    }
    if (!isCacheValid('funnelStages')) {
      promises.push(get().fetchFunnelStages());
    }
    if (!isCacheValid('appointments')) {
      promises.push(get().fetchEnterpriseAppointments());
    }
    // Team members for filter (lightweight, always good to have)
    promises.push(get().fetchTeamMembers());
    // Origen options for filter
    promises.push(get().fetchOrigenOptions());

    await Promise.allSettled(promises);

    logger.debug('[ContactStore] ✅ Enterprise data preloaded');
  },

  setSelectedEnterprise: async (enterpriseId: number | null) => {
    const { userContext, homeEnterpriseId } = get();
    
    // ============================================
    // SECURITY: Only role_id=1 (dev team) can change enterprise
    // ============================================
    const isDevTeam = userContext?.roleId === DEV_TEAM_ROLE_ID;
    
    // Block unauthorized enterprise switches
    if (!isDevTeam && enterpriseId !== homeEnterpriseId && enterpriseId !== userContext?.empresaId) {
      logger.error('[ContactStore] ⛔ BLOCKED: Unauthorized enterprise switch attempt', {
        userId: userContext?.id,
        roleId: userContext?.roleId,
        homeEnterpriseId,
        attemptedEnterpriseId: enterpriseId
      });
      return; // Silently block the attempt
    }
    
    // Determine if entering observation mode (dev team viewing non-home enterprise)
    const isObservationMode = isDevTeam && enterpriseId !== homeEnterpriseId;
    
    // Log observation mode entry for audit
    if (isObservationMode) {
      logger.info(`[ContactStore] 👁️ Dev user ${userContext?.id} entering OBSERVATION MODE for enterprise ${enterpriseId}`);
    } else if (isDevTeam && enterpriseId === homeEnterpriseId) {
      logger.info(`[ContactStore] 🏠 Dev user ${userContext?.id} returning to home enterprise (Urpe AI Lab)`);
    }
    
    // Clear ALL enterprise-specific data immediately
    set({ 
      selectedEnterpriseId: enterpriseId,
      isObservationMode,
      enterpriseProfile: null,
      enterpriseProfileLoading: false,
      enterpriseProfileError: null,
      contacts: [], // Clear contacts
      funnelStages: [], // Clear funnel stages
      teamMembers: [], // Clear team members (avoid leaking advisors from previous enterprise)
      enterpriseAppointments: [], // Clear appointments
      origenOptions: [], // Clear origen options (avoid stale data from previous enterprise)
      activeContact: null, // Deselect contact
      selectedContactId: null,
      activeContactData: { ...initialActiveContactData },
      activeConversationMessages: [], // Clear active conversation messages
      recentConversations: [], // Clear recent conversations
      contactsLastFetch: null, // Invalidate cache
      appointmentsLastFetch: null,
      appointmentsCachedRange: null,
      appointmentsCacheKey: null,
      funnelStagesLastFetch: null,
      pagination: { ...initialPagination },
      filters: initialFilters // Reset filters (search, status, etc.)
    });

    const { useTareasStore } = await import('../tareasStore');
    const { useProyectosStore } = await import('../proyectosStore');
    const { useFinanceStore } = await import('../financeStore');
    useTareasStore.getState().clearTasks();
    useProyectosStore.getState().clearProjects();
    useFinanceStore.getState().resetStore();
    logger.info('[ContactStore] 🔄 Cleared tasks, projects and finance store for enterprise change');
    
    if (enterpriseId) {
      set({ isLoading: true }); // Show loading state immediately

      // We rely on AdminPanel's useEffect or the specific view's useEffect 
      // to trigger preloadEnterpriseData() or fetchContacts()
      // This avoids double-fetching since those effects will react to the change in selectedEnterpriseId
      
      // Update enterprise_id in wp_team_humano if user is authenticated
      if (userContext?.id) {
        try {
          const { error } = await supabase
            .from('wp_team_humano')
            .update({ enterprise_id: enterpriseId })
            .eq('id', userContext.id);

          if (error) {
            console.error('[ContactStore] ❌ Error updating user enterprise_id:', error);
          } else {
            console.log('[ContactStore] ✅ User enterprise_id updated:', enterpriseId);
            // Update local user context to match
            set(state => ({
              userContext: state.userContext ? { ...state.userContext, enterpriseId } : null
            }));
          }
        } catch (err) {
          console.error('[ContactStore] Error updating user enterprise preference:', err);
        }
      }
    }
  },
});
