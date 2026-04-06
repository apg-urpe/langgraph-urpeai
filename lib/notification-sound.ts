/**
 * Notification Sound Service
 * Manages audio notifications for different notification types
 */

import { logger } from './logger';

// Sound URLs - Using Web Audio API for reliability
const SOUND_CONFIG = {
  // Normal notification - subtle chime
  normal: {
    frequency: 800,
    duration: 150,
    type: 'sine' as OscillatorType,
    volume: 0.3
  },
  // HITL/Urgent - more prominent alert
  urgent: {
    frequency: 1000,
    duration: 200,
    type: 'triangle' as OscillatorType,
    volume: 0.5,
    repeat: 2
  },
  // Success - confirmation tone
  success: {
    frequency: 1200,
    duration: 100,
    type: 'sine' as OscillatorType,
    volume: 0.25
  }
};

type SoundType = keyof typeof SOUND_CONFIG;

class NotificationSoundService {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private lastPlayTime: number = 0;
  private minInterval: number = 1000; // Minimum 1s between sounds to avoid spam

  constructor() {
    // Load preference from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('urpe_notification_sound');
      this.enabled = saved !== 'false';
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        logger.warn('[NotificationSound] AudioContext not available');
        return null;
      }
    }
    return this.audioContext;
  }

  /**
   * Play a notification sound
   */
  async play(type: SoundType = 'normal'): Promise<void> {
    if (!this.enabled) return;

    // Rate limiting
    const now = Date.now();
    if (now - this.lastPlayTime < this.minInterval) {
      logger.debug('[NotificationSound] Rate limited, skipping sound');
      return;
    }
    this.lastPlayTime = now;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        logger.debug('[NotificationSound] Could not resume audio context');
        return;
      }
    }

    const config = SOUND_CONFIG[type];
    const playCount = (config as any).repeat || 1;

    for (let i = 0; i < playCount; i++) {
      if (i > 0) await this.delay(150);
      this.playTone(ctx, config);
    }
  }

  private playTone(ctx: AudioContext, config: typeof SOUND_CONFIG.normal): void {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = config.type;
      oscillator.frequency.value = config.frequency;
      
      gainNode.gain.setValueAtTime(config.volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + config.duration / 1000);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + config.duration / 1000);
    } catch (e) {
      logger.debug('[NotificationSound] Error playing tone:', e);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enable/disable notification sounds
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('urpe_notification_sound', String(enabled));
    }
    logger.debug('[NotificationSound] Sound enabled:', enabled);
  }

  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Play sound based on notification type
   */
  playForNotificationType(tipo: string): void {
    const urgentTypes = ['human_in_the_loop', 'mensaje_urgente', 'tarea_vencida'];
    const successTypes = ['tarea_item_completado'];
    
    if (urgentTypes.includes(tipo)) {
      this.play('urgent');
    } else if (successTypes.includes(tipo)) {
      this.play('success');
    } else {
      this.play('normal');
    }
  }
}

// Singleton instance
export const notificationSound = new NotificationSoundService();
