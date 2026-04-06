'use client';

import { useEffect } from 'react';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { trackWebVital, trackMetric } from '@/lib/performance-monitor';
import { logWarning } from '@/lib/error-logger';
import { logger } from '@/lib/logger';

type WebVitalName = 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';

const THRESHOLDS: Record<WebVitalName, { good: number; poor: number }> = {
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 }
};

const METRIC_DESCRIPTIONS: Record<WebVitalName, string> = {
  CLS: 'Cumulative Layout Shift',
  FCP: 'First Contentful Paint',
  FID: 'First Input Delay',
  INP: 'Interaction to Next Paint',
  LCP: 'Largest Contentful Paint',
  TTFB: 'Time to First Byte'
};

function handleMetric(metric: Metric): void {
  const { name, value, rating, id, delta } = metric;
  
  // Check if it's a known Web Vital
  if (!THRESHOLDS[name as WebVitalName]) {
    trackMetric(name, value, 'ms', { id, delta });
    return;
  }

  const webVitalName = name as WebVitalName;
  
  // Track in performance monitor
  if (['CLS', 'FID', 'FCP', 'INP', 'LCP', 'TTFB'].includes(webVitalName)) {
    trackWebVital(webVitalName as 'CLS' | 'FID' | 'FCP' | 'INP' | 'LCP' | 'TTFB', value);
  } else {
    trackMetric(webVitalName, value, webVitalName === 'CLS' ? 'count' : 'ms');
  }
  
  // Log warning for poor metrics
  if (rating === 'poor') {
    logWarning(
      'web-vitals',
      `Poor ${METRIC_DESCRIPTIONS[webVitalName]}: ${value.toFixed(2)} (threshold: ${THRESHOLDS[webVitalName].poor})`,
      {
        additionalData: {
          metric: webVitalName,
          value,
          rating,
          threshold: THRESHOLDS[webVitalName],
          id,
          delta
        }
      }
    );
  }

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    const emoji = rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌';
    const unit = webVitalName === 'CLS' ? '' : 'ms';
    logger.debug(`[WebVital] ${emoji} ${webVitalName}: ${value.toFixed(2)}${unit} (${rating})`);
  }
}

export function WebVitalsReporter(): null {
  useEffect(() => {
    // Register all Web Vitals handlers
    onCLS(handleMetric);
    onFCP(handleMetric);
    onINP(handleMetric);
    onLCP(handleMetric);
    onTTFB(handleMetric);

    if (process.env.NODE_ENV === 'development') {
      logger.debug('[WebVitals] 📊 Monitoring initialized');
    }
  }, []);

  return null;
}
