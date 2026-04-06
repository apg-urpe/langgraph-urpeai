/**
 * Script de prueba para las Tools de Monica Chat
 * Ejecutar con: npx ts-node scripts/test-monica-tools.ts
 * 
 * Este script prueba todas las tools disponibles de Monica usando
 * el tool-executor directamente conectado a Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import { executeTool, ToolContext } from '../lib/ai/tool-executor';

// Configuración
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Empresa de prueba: Urpe Integral (ID 4)
const TEST_ENTERPRISE_ID = 4;
const TEST_USER_ID = 999;

async function testMonicaTools() {
  console.log('🧪 Iniciando pruebas de Tools de Monica Chat');
  console.log('📍 Empresa: Urpe Integral (ID: 4)');
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Faltan variables de entorno de Supabase');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Contexto mínimo para el tool-executor
  const context: ToolContext = {
    enterpriseId: TEST_ENTERPRISE_ID,
    userId: TEST_USER_ID
  };

  const results: { tool: string; status: string; error?: string }[] = [];

  // ============================================
  // TEST 1: search_contacts_deep
  // ============================================
  try {
    console.log('🔎 Test 1: search_contacts_deep...');
    const result = await executeTool('search_contacts_deep', {
      query: 'Juan',
      scope: 'all',
      limit: 5
    }, context);
    results.push({ 
      tool: 'search_contacts_deep', 
      status: result.success ? `✅ ${result.data?.length || 0} contactos` : '❌ Falló'
    });
    console.log(result.success ? `  ✅ ${result.data?.length || 0} contactos` : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'search_contacts_deep', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 2: get_full_contact_context
  // ============================================
  try {
    console.log('📋 Test 2: get_full_contact_context...');
    // Primero buscamos un contacto
    const { data: contacts } = await supabase
      .from('wp_contactos')
      .select('id')
      .eq('empresa_id', TEST_ENTERPRISE_ID)
      .limit(1);

    if (contacts && contacts.length > 0) {
      const result = await executeTool('get_full_contact_context', {
        contact_id: contacts[0].id
      }, context);
      results.push({ 
        tool: 'get_full_contact_context', 
        status: result.success ? '✅ Contexto obtenido' : '❌ Falló'
      });
      console.log(result.success ? '  ✅ Contexto completo' : `  ❌ ${result.error}`);
    } else {
      results.push({ tool: 'get_full_contact_context', status: '⚠️ Sin contactos' });
      console.log('  ⚠️ No hay contactos para probar');
    }
  } catch (err: any) {
    results.push({ tool: 'get_full_contact_context', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 3: get_conversational_intelligence
  // ============================================
  try {
    console.log('🎯 Test 3: get_conversational_intelligence...');
    const result = await executeTool('get_conversational_intelligence', {
      start_date: '2025-01-01',
      end_date: '2025-02-01',
      limite: 10,
      incluir_metadata: true
    }, context);
    results.push({ 
      tool: 'get_conversational_intelligence', 
      status: result.success ? `✅ ${result.data?.length || 0} conversaciones` : '❌ Falló'
    });
    console.log(result.success ? `  ✅ ${result.data?.length || 0} conversaciones` : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'get_conversational_intelligence', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 4: get_contacts (via CRM Searcher)
  // ============================================
  try {
    console.log('👥 Test 4: get_contacts...');
    const result = await executeTool('get_contacts', {
      limit: 5,
      estado: 'prospecto'
    }, context);
    results.push({ 
      tool: 'get_contacts', 
      status: result.success ? `✅ ${result.data?.length || 0} prospectos` : '❌ Falló'
    });
    console.log(result.success ? `  ✅ ${result.data?.length || 0} prospectos` : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'get_contacts', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 5: get_appointments
  // ============================================
  try {
    console.log('📅 Test 5: get_appointments...');
    const result = await executeTool('get_appointments', {
      proximas: true,
      limit: 5
    }, context);
    results.push({ 
      tool: 'get_appointments', 
      status: result.success ? `✅ ${result.data?.length || 0} citas` : '❌ Falló'
    });
    console.log(result.success ? `  ✅ ${result.data?.length || 0} citas` : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'get_appointments', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 6: get_tasks
  // ============================================
  try {
    console.log('✅ Test 6: get_tasks...');
    const result = await executeTool('get_tasks', {
      estado: 'pendiente',
      limit: 5
    }, context);
    results.push({ 
      tool: 'get_tasks', 
      status: result.success ? `✅ ${result.data?.length || 0} tareas` : '❌ Falló'
    });
    console.log(result.success ? `  ✅ ${result.data?.length || 0} tareas` : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'get_tasks', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 7: get_projects
  // ============================================
  try {
    console.log('📁 Test 7: get_projects...');
    const result = await executeTool('get_projects', {
      limit: 5
    }, context);
    results.push({ 
      tool: 'get_projects', 
      status: result.success ? `✅ ${result.data?.length || 0} proyectos` : '❌ Falló'
    });
    console.log(result.success ? `  ✅ ${result.data?.length || 0} proyectos` : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'get_projects', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // TEST 8: get_metrics
  // ============================================
  try {
    console.log('📊 Test 8: get_metrics...');
    const result = await executeTool('get_metrics', {
      period: 'month'
    }, context);
    results.push({ 
      tool: 'get_metrics', 
      status: result.success ? '✅ Métricas OK' : '❌ Falló'
    });
    console.log(result.success ? '  ✅ Métricas obtenidas' : `  ❌ ${result.error}`);
  } catch (err: any) {
    results.push({ tool: 'get_metrics', status: '❌ Error', error: err.message });
    console.log(`  ❌ ${err.message}`);
  }

  // ============================================
  // RESUMEN
  // ============================================
  console.log('');
  console.log('========================================');
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('========================================');
  
  const passed = results.filter(r => r.status.includes('✅')).length;
  const failed = results.filter(r => r.status.includes('❌')).length;
  const warnings = results.filter(r => r.status.includes('⚠️')).length;

  results.forEach(r => {
    console.log(`${r.tool.padEnd(35)} ${r.status}`);
  });

  console.log('');
  console.log(`✅ Exitosos: ${passed}`);
  console.log(`❌ Fallidos: ${failed}`);
  console.log(`⚠️ Advertencias: ${warnings}`);
  console.log(`📈 Total: ${results.length}`);
}

// Ejecutar
testMonicaTools().catch(console.error);
