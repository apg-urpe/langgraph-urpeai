/**
 * Performance Monitoring Script for Admin Panel
 * Run this script to analyze query performance and identify bottlenecks
 */

import { supabase } from '../lib/supabase-client.js';

// Performance test configurations
const TEST_ENTERPRISE_ID = 1; // Replace with actual enterprise ID
const TEST_TEAM_MEMBER_ID = null; // Test with and without team filter

// Test scenarios
const scenarios = [
  {
    name: 'Current Dashboard (Optimized)',
    queries: [
      {
        name: 'Contacts Count',
        query: () => supabase
          .from('wp_contactos')
          .select('created_at', { count: 'exact' })
          .eq('empresa_id', TEST_ENTERPRISE_ID)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1000)
      },
      {
        name: 'Appointments Count',
        query: () => supabase
          .from('wp_citas')
          .select('fecha_hora, created_at, estado', { count: 'exact' })
          .eq('empresa_id', TEST_ENTERPRISE_ID)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1000)
      },
      {
        name: 'Next 4 Appointments',
        query: () => supabase
          .from('wp_citas')
          .select(`
            id,
            fecha_hora,
            titulo,
            estado,
            contacto:wp_contactos!inner(id, nombre, apellido)
          `)
          .eq('empresa_id', TEST_ENTERPRISE_ID)
          .gte('fecha_hora', new Date().toISOString())
          .neq('estado', 'cancelada')
          .order('fecha_hora', { ascending: true })
          .limit(4)
      },
      {
        name: 'Messages Count',
        query: () => supabase
          .from('wp_mensajes')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      }
    ]
  },
  {
    name: 'Legacy Dashboard (Before Optimization)',
    queries: [
      {
        name: 'Contacts Full Data',
        query: () => supabase
          .from('wp_contactos')
          .select('*')
          .eq('empresa_id', TEST_ENTERPRISE_ID)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // 3 months
      },
      {
        name: 'Appointments Full Data',
        query: () => supabase
          .from('wp_citas')
          .select(`
            *,
            contact:wp_contactos(id, nombre, apellido, email, telefono)
          `)
          .eq('empresa_id', TEST_ENTERPRISE_ID)
          .gte('fecha_hora', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // 3 months
      },
      {
        name: 'Messages with JOIN',
        query: () => supabase
          .from('wp_mensajes')
          .select('id, conversacion:wp_conversaciones!inner(contacto:wp_contactos!inner(empresa_id))', { count: 'exact', head: true })
          .eq('conversacion.contacto.empresa_id', TEST_ENTERPRISE_ID)
      }
    ]
  }
];

// Performance measurement utility
async function measureQuery(queryFn, name) {
  const start = performance.now();
  try {
    const result = await queryFn();
    const end = performance.now();
    const duration = Math.round(end - start);
    
    console.log(`✅ ${name}: ${duration}ms`);
    if (result.count !== undefined) {
      console.log(`   Count: ${result.count}`);
    }
    if (result.data) {
      console.log(`   Data: ${result.data.length} rows`);
    }
    
    return { success: true, duration, result };
  } catch (error) {
    const end = performance.now();
    const duration = Math.round(end - start);
    
    console.log(`❌ ${name}: ${duration}ms - ERROR:`, error.message);
    return { success: false, duration, error };
  }
}

// Run performance test
async function runPerformanceTest() {
  console.log('🚀 Starting Admin Panel Performance Test');
  console.log('==========================================\n');
  
  for (const scenario of scenarios) {
    console.log(`📊 Testing: ${scenario.name}`);
    console.log('----------------------------------------');
    
    const results = [];
    const totalTime = { start: performance.now() };
    
    // Run queries in parallel (as they would be in the app)
    const queryPromises = scenario.queries.map(q => 
      measureQuery(q.query, q.name)
    );
    
    const queryResults = await Promise.all(queryPromises);
    totalTime.end = performance.now();
    
    // Calculate statistics
    const successfulQueries = queryResults.filter(r => r.success);
    const failedQueries = queryResults.filter(r => !r.success);
    const totalDuration = Math.round(totalTime.end - totalTime.start);
    const avgQueryTime = successfulQueries.length > 0 
      ? Math.round(successfulQueries.reduce((sum, r) => sum + r.duration, 0) / successfulQueries.length)
      : 0;
    
    console.log('\n📈 Results Summary:');
    console.log(`   Total Time: ${totalDuration}ms`);
    console.log(`   Average Query Time: ${avgQueryTime}ms`);
    console.log(`   Successful Queries: ${successfulQueries.length}/${scenario.queries.length}`);
    console.log(`   Failed Queries: ${failedQueries.length}`);
    
    if (failedQueries.length > 0) {
      console.log('\n❌ Failed Queries:');
      failedQueries.forEach(r => {
        console.log(`   - ${r.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
  }
  
  console.log('🎯 Recommendations:');
  console.log('==================');
  console.log('1. If total time > 3000ms, consider adding database indexes');
  console.log('2. If individual queries > 1000ms, optimize query structure');
  console.log('3. Monitor query performance regularly');
  console.log('4. Consider implementing Redis cache for frequently accessed data');
  console.log('5. Use pagination for large datasets');
}

// Database index checker
async function checkDatabaseIndexes() {
  console.log('🔍 Checking Database Indexes');
  console.log('============================\n');
  
  const tables = ['wp_contactos', 'wp_citas', 'wp_mensajes', 'wp_conversaciones'];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .rpc('get_table_indexes', { table_name: table });
      
      if (error) {
        console.log(`❌ Could not check indexes for ${table}: ${error.message}`);
      } else {
        console.log(`📋 ${table} indexes:`);
        if (data && data.length > 0) {
          data.forEach(idx => {
            console.log(`   - ${idx.indexname}: ${idx.indexdef}`);
          });
        } else {
          console.log('   No indexes found');
        }
      }
    } catch (err) {
      console.log(`❌ Error checking ${table}: ${err.message}`);
    }
    console.log('');
  }
}

// Main execution
if (typeof window === 'undefined') {
  // Node.js environment
  runPerformanceTest()
    .then(() => checkDatabaseIndexes())
    .catch(console.error);
} else {
  // Browser environment
  console.log('⚠️ This script should be run in Node.js environment');
  console.log('Copy this file to your backend or use with: node performance-monitor.js');
}

export { runPerformanceTest, checkDatabaseIndexes };
