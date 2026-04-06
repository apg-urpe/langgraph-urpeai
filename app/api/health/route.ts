/**
 * Health Check Endpoint - Monitoreo de Salud del Sistema
 * 
 * Endpoints:
 * - GET /api/health - Health check básico
 * - GET /api/health?deep=true - Health check completo con verificación de servicios
 * 
 * Uso con servicios externos:
 * - UptimeRobot
 * - Pingdom
 * - Custom monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton for health check queries (avoids creating a new client per request)
let _healthClient: SupabaseClient | null = null;
function getHealthClient(): SupabaseClient | null {
  if (_healthClient) return _healthClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _healthClient = createClient(url, key);
  return _healthClient;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime?: number;
  checks?: {
    database?: { status: 'up' | 'down'; latency?: number; error?: string };
    memory?: { used: string; limit: string; percentage: number };
  };
}

// Track server start time for uptime calculation
const serverStartTime = Date.now();

export async function GET(request: NextRequest) {
  const isDeepCheck = request.nextUrl.searchParams.get('deep') === 'true';
  const startTime = performance.now();

  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || '2.1.0',
    uptime: Math.floor((Date.now() - serverStartTime) / 1000)
  };

  // Deep health check - verify external services
  if (isDeepCheck) {
    health.checks = {};

    // Check Supabase connection
    try {
      const supabase = getHealthClient();

      if (supabase) {
        const dbStart = performance.now();
        
        // Simple query to verify connection
        const { error } = await supabase
          .from('wp_empresa_perfil')
          .select('id')
          .limit(1);

        const dbLatency = Math.round(performance.now() - dbStart);

        if (error) {
          health.checks.database = { 
            status: 'down', 
            latency: dbLatency,
            error: error.message 
          };
          health.status = 'degraded';
        } else {
          health.checks.database = { 
            status: 'up', 
            latency: dbLatency 
          };
        }
      } else {
        health.checks.database = { 
          status: 'down', 
          error: 'Missing Supabase configuration' 
        };
        health.status = 'degraded';
      }
    } catch (err) {
      health.checks.database = { 
        status: 'down', 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
      health.status = 'degraded';
    }

    // Memory usage (Node.js specific, may not work in Edge runtime)
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const mem = process.memoryUsage();
        const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
        
        health.checks.memory = {
          used: `${heapUsedMB}MB`,
          limit: `${heapTotalMB}MB`,
          percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100)
        };

        // Mark as degraded if memory usage is very high
        if (health.checks.memory.percentage > 90) {
          health.status = 'degraded';
        }
      }
    } catch {
      // Memory check not available in Edge runtime
    }
  }

  // Add response time header
  const responseTime = Math.round(performance.now() - startTime);

  return NextResponse.json(health, {
    status: health.status === 'unhealthy' ? 503 : 200,
    headers: {
      'X-Response-Time': `${responseTime}ms`,
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
