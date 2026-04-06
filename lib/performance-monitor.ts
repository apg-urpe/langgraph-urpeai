/**
 * Performance Monitor - Sistema de Métricas y Observabilidad
 * 
 * Propósito:
 * - Monitoreo de performance en tiempo real
 * - Tracking de métricas clave (Web Vitals, queries, renders)
 * - Detección de cuellos de botella
 * - Integración con logging para análisis
 * 
 * Uso:
 * ```typescript
 * import { trackMetric, trackQuery, trackRender } from '@/lib/performance-monitor';
 * 
 * // Track custom metric
 * trackMetric('contacts_load_time', 1250);
 * 
 * // Track Supabase query
 * const result = await trackQuery('fetchContacts', async () => {
 *   return await supabase.from('wp_contactos').select('*');
 * });
 * ```
 */

import { logInfo, logWarning } from './error-logger';

// ============================================
// TYPES
// ============================================

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent';
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface QueryMetric {
  queryName: string;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface RenderMetric {
  componentName: string;
  renderTime: number;
  renderCount: number;
  timestamp: number;
}

export interface WebVitalsMetric {
  name: 'CLS' | 'FID' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

// ============================================
// STORAGE
// ============================================

class MetricsStore {
  private metrics: PerformanceMetric[] = [];
  private queries: QueryMetric[] = [];
  private renders: RenderMetric[] = [];
  private webVitals: WebVitalsMetric[] = [];
  private maxSize = 1000; // Máximo de métricas en memoria

  addMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    this.cleanup(this.metrics);
  }

  addQuery(query: QueryMetric) {
    this.queries.push(query);
    this.cleanup(this.queries);
  }

  addRender(render: RenderMetric) {
    this.renders.push(render);
    this.cleanup(this.renders);
  }

  addWebVital(vital: WebVitalsMetric) {
    this.webVitals.push(vital);
    this.cleanup(this.webVitals);
  }

  private cleanup<T>(array: T[]) {
    if (array.length > this.maxSize) {
      array.splice(0, array.length - this.maxSize);
    }
  }

  getMetrics(name?: string, limit = 100): PerformanceMetric[] {
    const filtered = name 
      ? this.metrics.filter(m => m.name === name)
      : this.metrics;
    return filtered.slice(-limit);
  }

  getQueries(queryName?: string, limit = 100): QueryMetric[] {
    const filtered = queryName
      ? this.queries.filter(q => q.queryName === queryName)
      : this.queries;
    return filtered.slice(-limit);
  }

  getRenders(componentName?: string, limit = 100): RenderMetric[] {
    const filtered = componentName
      ? this.renders.filter(r => r.componentName === componentName)
      : this.renders;
    return filtered.slice(-limit);
  }

  getWebVitals(): WebVitalsMetric[] {
    return this.webVitals;
  }

  clear() {
    this.metrics = [];
    this.queries = [];
    this.renders = [];
    this.webVitals = [];
  }

  getStats() {
    return {
      totalMetrics: this.metrics.length,
      totalQueries: this.queries.length,
      totalRenders: this.renders.length,
      totalWebVitals: this.webVitals.length
    };
  }
}

const metricsStore = new MetricsStore();

// ============================================
// METRIC TRACKING
// ============================================

/**
 * Track a custom performance metric
 */
export function trackMetric(
  name: string,
  value: number,
  unit: PerformanceMetric['unit'] = 'ms',
  context?: Record<string, unknown>
): void {
  const metric: PerformanceMetric = {
    name,
    value,
    unit,
    timestamp: Date.now(),
    context
  };

  metricsStore.addMetric(metric);

  // Log warning si el valor es alto
  if (unit === 'ms' && value > 3000) {
    logWarning('performance-monitor', `Slow metric detected: ${name} took ${value}ms`, {
      additionalData: { metric, context }
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Perf] ${name}: ${value}${unit}`, context || '');
  }
}

/**
 * Track a Supabase query with automatic timing
 */
export async function trackQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  let success = true;
  let error: string | undefined;

  try {
    const result = await queryFn();
    return result;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = performance.now() - startTime;
    
    const queryMetric: QueryMetric = {
      queryName,
      duration,
      success,
      error,
      timestamp: Date.now()
    };

    metricsStore.addQuery(queryMetric);

    // Log warning si la query es lenta
    if (duration > 2000) {
      logWarning('performance-monitor', `Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`, {
        additionalData: { queryMetric }
      });
    }

    if (process.env.NODE_ENV === 'development') {
      const status = success ? '✅' : '❌';
      console.log(`[Query] ${status} ${queryName}: ${duration.toFixed(2)}ms`);
    }
  }
}

/**
 * Track component render performance
 */
export function trackRender(componentName: string, renderTime: number): void {
  const existing = metricsStore.getRenders(componentName, 1)[0];
  const renderCount = existing ? existing.renderCount + 1 : 1;

  const renderMetric: RenderMetric = {
    componentName,
    renderTime,
    renderCount,
    timestamp: Date.now()
  };

  metricsStore.addRender(renderMetric);

  // Log warning si el render es lento o hay muchos re-renders
  if (renderTime > 100) {
    logWarning('performance-monitor', `Slow render: ${componentName} took ${renderTime.toFixed(2)}ms`, {
      additionalData: { renderMetric }
    });
  }

  if (renderCount > 50) {
    logWarning('performance-monitor', `Excessive re-renders: ${componentName} rendered ${renderCount} times`, {
      additionalData: { renderMetric }
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Render] ${componentName}: ${renderTime.toFixed(2)}ms (count: ${renderCount})`);
  }
}

/**
 * Track Web Vitals (CLS, FID, FCP, LCP, TTFB)
 */
export function trackWebVital(
  name: WebVitalsMetric['name'],
  value: number
): void {
  // Determine rating based on Web Vitals thresholds
  let rating: WebVitalsMetric['rating'] = 'good';
  
  const thresholds: Record<WebVitalsMetric['name'], { good: number; poor: number }> = {
    CLS: { good: 0.1, poor: 0.25 },
    FID: { good: 100, poor: 300 },
    FCP: { good: 1800, poor: 3000 },
    INP: { good: 200, poor: 500 },
    LCP: { good: 2500, poor: 4000 },
    TTFB: { good: 800, poor: 1800 }
  };

  const threshold = thresholds[name];
  if (value > threshold.poor) {
    rating = 'poor';
  } else if (value > threshold.good) {
    rating = 'needs-improvement';
  }

  const vital: WebVitalsMetric = {
    name,
    value,
    rating,
    timestamp: Date.now()
  };

  metricsStore.addWebVital(vital);

  if (rating === 'poor') {
    logWarning('performance-monitor', `Poor Web Vital: ${name} = ${value} (${rating})`, {
      additionalData: { vital }
    });
  }

  if (process.env.NODE_ENV === 'development') {
    const emoji = rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌';
    console.log(`[WebVital] ${emoji} ${name}: ${value} (${rating})`);
  }
}

// ============================================
// ANALYSIS & REPORTING
// ============================================

/**
 * Get performance summary for a specific metric
 */
export function getMetricSummary(name: string): {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
} | null {
  const metrics = metricsStore.getMetrics(name);
  
  if (metrics.length === 0) {
    return null;
  }

  const values = metrics.map(m => m.value).sort((a, b) => a - b);
  const sum = values.reduce((acc, val) => acc + val, 0);

  return {
    count: values.length,
    avg: sum / values.length,
    min: values[0],
    max: values[values.length - 1],
    p50: values[Math.floor(values.length * 0.5)],
    p95: values[Math.floor(values.length * 0.95)],
    p99: values[Math.floor(values.length * 0.99)]
  };
}

/**
 * Get query performance summary
 */
export function getQuerySummary(queryName?: string): {
  totalQueries: number;
  successRate: number;
  avgDuration: number;
  slowestQuery: number;
  failedQueries: number;
} {
  const queries = metricsStore.getQueries(queryName);
  
  const successful = queries.filter(q => q.success).length;
  const failed = queries.length - successful;
  const durations = queries.map(q => q.duration);
  const avgDuration = durations.length > 0
    ? durations.reduce((acc, val) => acc + val, 0) / durations.length
    : 0;

  return {
    totalQueries: queries.length,
    successRate: queries.length > 0 ? (successful / queries.length) * 100 : 0,
    avgDuration,
    slowestQuery: Math.max(...durations, 0),
    failedQueries: failed
  };
}

/**
 * Get render performance summary
 */
export function getRenderSummary(componentName?: string): {
  totalRenders: number;
  avgRenderTime: number;
  slowestRender: number;
  componentsWithExcessiveRenders: string[];
} {
  const renders = metricsStore.getRenders(componentName);
  
  const renderTimes = renders.map(r => r.renderTime);
  const avgRenderTime = renderTimes.length > 0
    ? renderTimes.reduce((acc, val) => acc + val, 0) / renderTimes.length
    : 0;

  // Find components with > 50 renders
  const renderCounts = new Map<string, number>();
  renders.forEach(r => {
    renderCounts.set(r.componentName, r.renderCount);
  });

  const excessive = Array.from(renderCounts.entries())
    .filter(([_, count]) => count > 50)
    .map(([name]) => name);

  return {
    totalRenders: renders.length,
    avgRenderTime,
    slowestRender: Math.max(...renderTimes, 0),
    componentsWithExcessiveRenders: excessive
  };
}

/**
 * Get Web Vitals summary
 */
export function getWebVitalsSummary(): Record<WebVitalsMetric['name'], {
  value: number;
  rating: WebVitalsMetric['rating'];
} | null> {
  const vitals = metricsStore.getWebVitals();
  
  const summary: Record<string, any> = {
    CLS: null,
    FID: null,
    FCP: null,
    INP: null,
    LCP: null,
    TTFB: null
  };

  vitals.forEach(vital => {
    summary[vital.name] = {
      value: vital.value,
      rating: vital.rating
    };
  });

  return summary;
}

/**
 * Log full performance report
 */
export async function logPerformanceReport(): Promise<void> {
  const stats = metricsStore.getStats();
  const querySummary = getQuerySummary();
  const renderSummary = getRenderSummary();
  const webVitals = getWebVitalsSummary();

  const report = {
    timestamp: new Date().toISOString(),
    stats,
    queries: querySummary,
    renders: renderSummary,
    webVitals
  };

  await logInfo('performance-monitor', 'Performance Report', {
    additionalData: report
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Performance Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Stats:', stats);
    console.log('Queries:', querySummary);
    console.log('Renders:', renderSummary);
    console.log('Web Vitals:', webVitals);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  metricsStore.clear();
  if (process.env.NODE_ENV === 'development') {
    console.log('[Perf] Metrics cleared');
  }
}

/**
 * Export metrics for external analysis
 */
export function exportMetrics(): {
  metrics: PerformanceMetric[];
  queries: QueryMetric[];
  renders: RenderMetric[];
  webVitals: WebVitalsMetric[];
} {
  return {
    metrics: metricsStore.getMetrics(),
    queries: metricsStore.getQueries(),
    renders: metricsStore.getRenders(),
    webVitals: metricsStore.getWebVitals()
  };
}

// ============================================
// REACT HOOKS HELPERS
// ============================================

/**
 * Wrapper para medir tiempo de ejecución de funciones
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - startTime;
    trackMetric(name, duration, 'ms');
  }
}

/**
 * Wrapper síncrono para medir tiempo de ejecución
 */
export function measure<T>(name: string, fn: () => T): T {
  const startTime = performance.now();
  try {
    return fn();
  } finally {
    const duration = performance.now() - startTime;
    trackMetric(name, duration, 'ms');
  }
}
