import { create } from 'zustand';
import { supabase } from '../lib/supabase-client';
import { logger } from '../lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Payload tracked per user in the presence channel
interface PresencePayload {
  teamMemberId: number;
  nombre: string;
  apellido: string;
  email: string;
  joinedAt: string;
}

interface PresenceState {
  // Online members keyed by teamMemberId
  onlineMembers: Map<number, PresencePayload>;

  // Channel reference for cleanup
  presenceChannel: RealtimeChannel | null;

  // Connection status
  isConnected: boolean;

  // Actions
  subscribeToPresence: (params: {
    id: number;
    authUid: string;
    nombre: string;
    apellido: string;
    email: string;
    empresaId: number;
  }) => void;
  unsubscribeFromPresence: () => void;
}

/**
 * Rebuilds the onlineMembers map from the raw Supabase presence state.
 * Each key in presenceState maps to an array of payloads (multiple tabs).
 * We deduplicate by teamMemberId, keeping the earliest joinedAt.
 */
function buildOnlineMap(
  presenceState: Record<string, PresencePayload[]>
): Map<number, PresencePayload> {
  const map = new Map<number, PresencePayload>();
  for (const key of Object.keys(presenceState)) {
    const entries = presenceState[key];
    if (entries && entries.length > 0) {
      const entry = entries[0];
      if (entry.teamMemberId && !map.has(entry.teamMemberId)) {
        map.set(entry.teamMemberId, entry);
      }
    }
  }
  return map;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineMembers: new Map(),
  presenceChannel: null,
  isConnected: false,

  subscribeToPresence: ({ id, authUid, nombre, apellido, email, empresaId }) => {
    const { presenceChannel: existing } = get();

    // Cleanup existing subscription
    if (existing) {
      logger.debug('[Presence] Removing existing channel before resubscribing');
      supabase.removeChannel(existing);
    }

    const channelName = `presence-empresa-${empresaId}`;
    logger.debug('[Presence] Subscribing to channel:', channelName);

    const channel = supabase.channel(channelName, {
      config: { presence: { key: authUid } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePayload>();
        const onlineMembers = buildOnlineMap(state);
        logger.debug('[Presence] Sync — online:', onlineMembers.size);
        set({ onlineMembers });
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        logger.debug('[Presence] Join:', newPresences?.length, 'entries');
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        logger.debug('[Presence] Leave:', leftPresences?.length, 'entries');
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[Presence] Channel subscribed, tracking user');
          const payload: PresencePayload = {
            teamMemberId: id,
            nombre,
            apellido,
            email,
            joinedAt: new Date().toISOString(),
          };
          await channel.track(payload);
          set({ isConnected: true });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          logger.debug('[Presence] Channel status:', status);
          set({ isConnected: false });
        }
      });

    set({ presenceChannel: channel });
  },

  unsubscribeFromPresence: () => {
    const { presenceChannel } = get();
    if (presenceChannel) {
      logger.debug('[Presence] Unsubscribing from presence channel');
      supabase.removeChannel(presenceChannel);
    }
    set({
      presenceChannel: null,
      onlineMembers: new Map(),
      isConnected: false,
    });
  },
}));

// Selectors
export const selectOnlineMembers = (state: PresenceState) => state.onlineMembers;
export const selectOnlineCount = (state: PresenceState) => state.onlineMembers.size;
export const selectIsConnected = (state: PresenceState) => state.isConnected;
