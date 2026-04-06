import { useState, useEffect, useRef, useCallback } from 'react';
import type { PortfolioContactSummary } from '../app/api/contacts/portfolio-summary/route';

export type { PortfolioContactSummary };

/**
 * Hook that loads portfolio (cartera) summaries for a set of contact IDs.
 * Only fetches when enabled (portfolio view active) and contact IDs change.
 */
export function usePortfolioSummaries(
  contactIds: number[],
  enabled: boolean
): {
  summaries: Map<number, PortfolioContactSummary>;
  isLoading: boolean;
} {
  const [summaries, setSummaries] = useState<Map<number, PortfolioContactSummary>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastKeyRef = useRef('');

  const fetchSummaries = useCallback(async (ids: number[]) => {
    if (ids.length === 0) {
      setSummaries(new Map());
      lastKeyRef.current = '';
      return;
    }

    const key = ids.slice().sort((a, b) => a - b).join(',');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const { useAuthStore } = await import('../store/authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const res = await fetch('/api/contacts/portfolio-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ contactIds: ids }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn('[usePortfolioSummaries] API error:', res.status);
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      const map = new Map<number, PortfolioContactSummary>();
      if (data.summaries) {
        for (const [k, v] of Object.entries(data.summaries)) {
          map.set(Number(k), v as PortfolioContactSummary);
        }
      }
      setSummaries(map);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[usePortfolioSummaries] Fetch error:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      lastKeyRef.current = '';
      setSummaries(new Map());
      setIsLoading(false);
      return;
    }
    fetchSummaries(contactIds);
  }, [contactIds, enabled, fetchSummaries]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { summaries, isLoading };
}
