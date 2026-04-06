import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PortfolioQueueContactItem, PortfolioQueuePagination, PortfolioQueueSummary, PortfolioQueueSort } from '../lib/portfolio-queue';

export type { PortfolioQueueContactItem, PortfolioQueuePagination, PortfolioQueueSummary, PortfolioQueueSort };

interface UsePortfolioQueueParams {
  enterpriseId: number | null;
  contactId?: number | null;
  search?: string;
  asesorIds?: number[];
  estado?: string | null;
  origen?: string | null;
  estadoCobranza?: string | null;
  page: number;
  pageSize: number;
  sortBy?: PortfolioQueueSort | string | null;
}

const EMPTY_PAGINATION: PortfolioQueuePagination = {
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 0,
};

const EMPTY_SUMMARY: PortfolioQueueSummary = {
  totalPendingBalance: 0,
  dueNowAmount: 0,
  criticalCount: 0,
};

export function usePortfolioQueue(
  params: UsePortfolioQueueParams,
  enabled: boolean
): {
  items: PortfolioQueueContactItem[];
  pagination: PortfolioQueuePagination;
  summary: PortfolioQueueSummary;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [items, setItems] = useState<PortfolioQueueContactItem[]>([]);
  const [pagination, setPagination] = useState<PortfolioQueuePagination>(EMPTY_PAGINATION);
  const [summary, setSummary] = useState<PortfolioQueueSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastKeyRef = useRef('');

  const normalizedParams = useMemo(() => ({
    enterpriseId: params.enterpriseId,
    contactId: params.contactId ?? null,
    search: params.search || '',
    asesorIds: [...(params.asesorIds || [])].sort((a, b) => a - b),
    estado: params.estado || null,
    origen: params.origen || null,
    estadoCobranza: params.estadoCobranza || null,
    page: params.page,
    pageSize: params.pageSize,
    sortBy: params.sortBy || 'portfolioPriority',
  }), [
    params.asesorIds,
    params.contactId,
    params.enterpriseId,
    params.estado,
    params.estadoCobranza,
    params.origen,
    params.page,
    params.pageSize,
    params.search,
    params.sortBy,
  ]);

  const performFetch = useCallback(async (force = false) => {
    if (!enabled || !normalizedParams.enterpriseId) {
      setItems([]);
      setPagination({ ...EMPTY_PAGINATION, page: normalizedParams.page, pageSize: normalizedParams.pageSize });
      setSummary(EMPTY_SUMMARY);
      setError(null);
      setIsLoading(false);
      lastKeyRef.current = '';
      return;
    }

    const key = JSON.stringify(normalizedParams);
    if (!force && key === lastKeyRef.current) {
      return;
    }
    lastKeyRef.current = key;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    console.log('[usePortfolioQueue] Fetching...', { enterprise: normalizedParams.enterpriseId, page: normalizedParams.page, sort: normalizedParams.sortBy });

    try {
      const { useAuthStore } = await import('../store/authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const res = await fetch('/api/contacts/portfolio-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify(normalizedParams),
        signal: controller.signal,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo cargar la cartera');
      }

      const data = await res.json();
      console.log('[usePortfolioQueue] Response:', { items: data.items?.length ?? 0, totalCount: data.pagination?.totalCount ?? 0 });
      setItems(Array.isArray(data.items) ? data.items : []);
      setPagination(data.pagination || { ...EMPTY_PAGINATION, page: normalizedParams.page, pageSize: normalizedParams.pageSize });
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('[usePortfolioQueue] Error:', err?.message);
      setItems([]);
      setPagination({ ...EMPTY_PAGINATION, page: normalizedParams.page, pageSize: normalizedParams.pageSize });
      setSummary(EMPTY_SUMMARY);
      setError(err?.message || 'No se pudo cargar la cartera');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, normalizedParams]);

  useEffect(() => {
    void performFetch();
  }, [performFetch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    items,
    pagination,
    summary,
    isLoading,
    error,
    refresh: () => performFetch(true),
  };
}
