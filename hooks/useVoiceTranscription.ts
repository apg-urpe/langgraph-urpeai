'use client';

import { useState, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/authStore';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

interface UseVoiceTranscriptionOptions {
  /** Language hint for transcription (e.g. 'es', 'en') */
  language?: string;
  /** Max recording duration in seconds (default: 120) */
  maxDuration?: number;
  /** Called when transcription is ready */
  onTranscript?: (text: string) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

interface UseVoiceTranscriptionReturn {
  state: VoiceState;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  /** Toggle: start if idle, stop if recording */
  toggleRecording: () => Promise<void>;
  error: string | null;
}

/**
 * Preferred MIME type for MediaRecorder.
 * webm/opus is best for Chrome/Firefox, mp4 for Safari.
 */
function getPreferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  
  return 'audio/webm';
}

export function useVoiceTranscription(
  options: UseVoiceTranscriptionOptions = {}
): UseVoiceTranscriptionReturn {
  const { language, maxDuration = 120, onTranscript, onError } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setState('transcribing');
    setError(null);

    try {
      const formData = new FormData();
      
      // Determine file extension from MIME type
      const ext = audioBlob.type.includes('mp4') ? 'mp4' 
        : audioBlob.type.includes('ogg') ? 'ogg' 
        : 'webm';
      
      formData.append('audio', audioBlob, `recording.${ext}`);
      if (language) {
        formData.append('language', language);
      }

      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Transcription failed' }));
        if (response.status === 401) {
          throw new Error('No autorizado. Inicia sesión nuevamente.');
        }
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.text && data.text.trim()) {
        onTranscript?.(data.text.trim());
      }

      setState('idle');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      logger.error('[VoiceTranscription] Transcribe error:', err);
      setError(message);
      onError?.(message);
      setState('idle');
    }
  }, [language, onTranscript, onError]);

  const startRecording = useCallback(async () => {
    setError(null);

    // Check secure context (HTTPS or localhost required)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const msg = 'Microphone requires HTTPS. Use localhost for development.';
      setError(msg);
      onError?.(msg);
      return;
    }

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Voice recording is not supported in this browser';
      setError(msg);
      onError?.(msg);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getPreferredMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const chunks = chunksRef.current;
        if (chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: mimeType });
          transcribeAudio(audioBlob);
        } else {
          setState('idle');
        }
        // Stop tracks after recording ends
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.onerror = () => {
        const msg = 'Recording error occurred';
        logger.error('[VoiceTranscription] MediaRecorder error');
        setError(msg);
        onError?.(msg);
        cleanup();
        setState('idle');
      };

      mediaRecorder.start(1000); // Collect data every second
      setState('recording');

      // Safety timeout
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          logger.info(`[VoiceTranscription] Max duration reached (${maxDuration}s), stopping`);
          mediaRecorderRef.current.stop();
        }
      }, maxDuration * 1000);

    } catch (err: unknown) {
      cleanup();
      
      let msg: string;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        msg = 'Microphone blocked. Click the lock icon 🔒 in the URL bar → Site Settings → Microphone → Allow, then reload.';
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        msg = 'No microphone found';
      } else {
        msg = 'Failed to start recording';
      }

      logger.error('[VoiceTranscription] Start error:', err);
      setError(msg);
      onError?.(msg);
      setState('idle');
    }
  }, [maxDuration, onError, cleanup, transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      // State transitions to 'transcribing' in onstop handler
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      await startRecording();
    }
    // If 'transcribing', do nothing
  }, [state, startRecording, stopRecording]);

  return {
    state,
    startRecording,
    stopRecording,
    toggleRecording,
    error,
  };
}
