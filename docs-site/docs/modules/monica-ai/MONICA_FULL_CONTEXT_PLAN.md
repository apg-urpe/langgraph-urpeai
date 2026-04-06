---
title: "Plan de Ingeniería de Contexto Completo para Monica"
---

> **Objetivo**: Proporcionar a Monica TODO el contexto histórico del cliente sin filtrar, desde el inicio de los tiempos.

---

## 📋 Resumen Ejecutivo

### Estado Actual
Monica recibe un contexto **limitado y filtrado**:
- Solo últimas 10 conversaciones (sin mensajes)
- Solo últimas 5 notas
- Solo últimas 5 citas
- Sin transcripciones
- Sin tareas
- Sin cartera/servicios
- Sin información del embudo
- Sin datos del asesor

### Estado Objetivo
Monica debe recibir **TODO** el contexto disponible del cliente:
- ✅ Historial completo de chats con mensajes
- ✅ Todas las citas (sin resumen, datos completos)
- ✅ Todas las transcripciones (resumen + texto completo)
- ✅ Todas las notas del equipo
- ✅ Todas las tareas y sus estados/items
- ✅ Cartera completa (servicios + pagos)
- ✅ Servicios de la empresa
- ✅ Etapa del embudo (título + descripción)
- ✅ Fechas importantes calculadas
- ✅ Asesor asignado
- ✅ Estado y origen del contacto

---

## 🏗️ Arquitectura de Componentes Involucrados

### 1. Frontend (Recolección de Datos)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContactDetailPanel.tsx                        │
│  └── ContactAIChat.tsx  ◄── Componente que envía el contexto    │
│          │                                                       │
│          ▼                                                       │
│  contactData (props) ◄── Datos del store (ya cargados en UI)   │
│          │                                                       │
│          ▼                                                       │
│  enterpriseContext ◄── Objeto JSON enviado a /api/chat          │
└─────────────────────────────────────────────────────────────────┘
```

**Archivo**: `components/admin/contact-details/ContactAIChat.tsx`
- Líneas 71-112: Construcción del `chatPayload`
- Recibe `contactData` como prop desde `ContactDetailPanel`

### 2. Stores (Fuentes de Datos)

| Store | Datos Disponibles | Tabla Supabase |
|-------|-------------------|----------------|
| `contactStore` | Contacto, Conversaciones, Citas, Notas, Transcripciones, Embudo | `wp_contactos`, `wp_conversaciones`, `wp_citas`, `wp_contactos_nota`, `transcripciones`, `wp_contacto_estado_embudo` |
| `tareasStore` | Tareas con items y asignados | `wp_tareas`, `wp_tareas_items` |
| `financeStore` | Servicios y Pagos | `wp_crm_servicios`, `wp_crm_pagos` |
| `contactStore.enterpriseProfile` | Perfil empresa (servicios generales) | `wp_empresa_perfil` |

### 3. Backend (Procesamiento)

**Archivo**: `app/api/chat/route.ts`
- `buildSystemPrompt()`: Construye el prompt del sistema con el contexto
- Líneas 152-238: Lógica actual de construcción del prompt

### 4. Validación (Schemas)

**Archivo**: `lib/api-schemas.ts`
- `EnterpriseContextSchema`: Define la estructura permitida del contexto
- Líneas 225-246: Schema actual (necesita expansión)

---

## 📊 Modelo de Datos Requerido

### Tablas Supabase a Consultar

```sql
-- 1. Contacto Base
wp_contactos (id, nombre, apellido, telefono, email, estado, es_calificado, 
              origen, etapa_embudo, team_humano_id, metadata, created_at, 
              ultima_interaccion, is_active, paused_until)

-- 2. Conversaciones con Mensajes
wp_conversaciones (id, contacto_id, canal, status, fecha_inicio, resumen)
wp_mensajes (id, conversacion_id, contenido, remitente, tipo, created_at)

-- 3. Citas Completas
wp_citas (id, contacto_id, titulo, descripcion, fecha_hora, duracion, 
          estado, tipo, team_humano_id, metadata)

-- 4. Transcripciones
transcripciones (id, cita_id, transcripcion, resumen, resumen_cita, duracion)

-- 5. Notas
wp_contactos_nota (id, contacto_id, titulo, descripcion, etiquetas, 
                   es_fijado, created_at, team_humano_id)
    + JOIN wp_team_humano (autor)

-- 6. Tareas
wp_tareas (id, contacto_id, titulo, descripcion, estado, prioridad, 
           fecha_vencimiento, asignado_a, created_at)
wp_tareas_items (id, tarea_id, texto, completado, orden)

-- 7. Cartera/Servicios
wp_crm_servicios (id, contacto_id, nombre_servicio, tipo_servicio, 
                  valor_total, saldo_pagado, saldo_pendiente, estado, 
                  fecha_inicio, fecha_fin)
wp_crm_pagos (id, servicio_id, monto, fecha_pago, metodo_pago, estado)

-- 8. Embudo
wp_empresa_embudo (id, nombre_etapa, descripcion, orden_etapa, color)

-- 9. Asesor Asignado
wp_team_humano (id, nombre, apellido, email, rol)

-- 10. Empresa (servicios generales)
wp_empresa_perfil (id, nombre, servicios_generales, informacion_empresarial)
```

---

## 🔧 Plan de Implementación

### Fase 1: Ampliar Fetch de Datos (contactStore)

**Archivo**: `store/contactStore.ts` → `fetchContactDetails()`

```typescript
// AGREGAR a las queries paralelas:

// 7. Tareas del contacto
supabase
  .from('wp_tareas')
  .select(`
    *,
    items:wp_tareas_items(*),
    asignado:wp_team_humano(id, nombre, apellido)
  `)
  .eq('contacto_id', contactId)
  .order('created_at', { ascending: false }),

// 8. Servicios/Cartera
supabase
  .from('wp_crm_servicios')
  .select(`
    *,
    pagos:wp_crm_pagos(*)
  `)
  .eq('contacto_id', contactId)
  .order('created_at', { ascending: false }),

// 9. Mensajes de todas las conversaciones
// (Después de obtener conversaciones)
supabase
  .from('wp_mensajes')
  .select('*')
  .in('conversacion_id', conversationIds)
  .order('created_at', { ascending: true }),

// 10. Etapa del embudo con descripción
supabase
  .from('wp_empresa_embudo')
  .select('id, nombre_etapa, descripcion, orden_etapa, color')
  .eq('id', contact.etapa_embudo)
  .single(),

// 11. Asesor asignado
supabase
  .from('wp_team_humano')
  .select('id, nombre, apellido, email, rol')
  .eq('id', contact.team_humano_id)
  .single()
```

### Fase 2: Actualizar Estado del Store

**Agregar al tipo `activeContactData`:**

```typescript
interface ActiveContactData {
  // Existentes
  conversations: Conversation[];
  appointments: Appointment[];
  multimedia: any[];
  notes: ContactNote[];
  transcripciones: Transcripcion[];
  funnelStatus: FunnelStatus | null;
  
  // NUEVOS
  messages: Message[];           // Mensajes de todas las conversaciones
  tasks: Task[];                 // Tareas con items
  services: ServiceWithPayments[]; // Cartera completa
  funnelStage: FunnelStage | null; // Etapa con descripción
  assignedAdvisor: TeamMember | null; // Asesor asignado
  
  isLoading: boolean;
  error: string | null;
}
```

### Fase 3: Enriquecer ContactAIChat.tsx

**Archivo**: `components/admin/contact-details/ContactAIChat.tsx`

```typescript
const chatPayload: ChatRequest = {
  chatInput: text,
  userId: resolvedUserId,
  enterpriseId: selectedEnterpriseId ?? contact.empresa_id,
  userRoleId: userContext?.roleId,
  enterpriseContext: {
    identity: {
      nombre: enterpriseProfile?.nombre,
      rubro: enterpriseProfile?.rubro,
      servicios: enterpriseProfile?.servicios_generales,
      informacion: enterpriseProfile?.informacion_empresarial
    },
    contact: {
      // === DATOS BASE ===
      id: contact.id,
      nombre: contact.nombre,
      apellido: contact.apellido,
      telefono: contact.telefono,
      email: contact.email,
      estado: contact.estado,
      es_calificado: contact.es_calificado,
      origen: contact.origen,
      is_active: contact.is_active,
      paused_until: contact.paused_until,
      created_at: contact.created_at,
      ultima_interaccion: contact.ultima_interaccion,
      metadata: contact.metadata,
      
      // === EMBUDO ===
      embudo: {
        etapa_id: contactData?.funnelStage?.id,
        nombre: contactData?.funnelStage?.nombre_etapa,
        descripcion: contactData?.funnelStage?.descripcion,
        orden: contactData?.funnelStage?.orden_etapa
      },
      
      // === ASESOR ASIGNADO ===
      asesor: contactData?.assignedAdvisor ? {
        id: contactData.assignedAdvisor.id,
        nombre: `${contactData.assignedAdvisor.nombre} ${contactData.assignedAdvisor.apellido}`,
        email: contactData.assignedAdvisor.email,
        rol: contactData.assignedAdvisor.rol
      } : null,
      
      // === CONVERSACIONES COMPLETAS ===
      conversaciones: contactData?.conversations?.map(c => ({
        id: c.id,
        canal: c.canal,
        status: c.status,
        fecha_inicio: c.fecha_inicio,
        resumen: c.resumen,
        mensajes: contactData?.messages
          ?.filter(m => m.conversacion_id === c.id)
          ?.map(m => ({
            remitente: m.remitente,
            contenido: m.contenido,
            tipo: m.tipo,
            fecha: m.created_at
          }))
      })),
      
      // === CITAS COMPLETAS (SIN RESUMEN) ===
      citas: contactData?.appointments?.map(a => ({
        id: a.id,
        titulo: a.titulo,
        descripcion: a.descripcion,
        fecha_hora: a.fecha_hora,
        duracion: a.duracion,
        estado: a.estado,
        tipo: a.tipo
      })),
      
      // === TRANSCRIPCIONES COMPLETAS ===
      transcripciones: contactData?.transcripciones?.map(t => ({
        id: t.id,
        cita_id: t.cita_id,
        cita_titulo: t.cita?.titulo,
        fecha: t.cita?.fecha_hora,
        duracion: t.duracion,
        resumen: t.resumen,
        resumen_cita: t.resumen_cita,
        transcripcion_completa: t.transcripcion
      })),
      
      // === NOTAS COMPLETAS ===
      notas: contactData?.notes?.map(n => ({
        id: n.id,
        titulo: n.titulo,
        descripcion: n.descripcion,
        etiquetas: n.etiquetas,
        es_fijado: n.es_fijado,
        fecha: n.created_at,
        autor: n.author ? `${n.author.nombre} ${n.author.apellido}` : null
      })),
      
      // === TAREAS CON ITEMS ===
      tareas: contactData?.tasks?.map(t => ({
        id: t.id,
        titulo: t.titulo,
        descripcion: t.descripcion,
        estado: t.estado,
        prioridad: t.prioridad,
        fecha_vencimiento: t.fecha_vencimiento,
        asignado_a: t.asignado ? 
          `${t.asignado.nombre} ${t.asignado.apellido}` : null,
        items: t.items?.map(i => ({
          texto: i.texto,
          completado: i.completado
        }))
      })),
      
      // === CARTERA/SERVICIOS ===
      cartera: {
        resumen: {
          total_contratado: contactData?.services?.reduce((sum, s) => 
            sum + s.valor_total, 0),
          total_pagado: contactData?.services?.reduce((sum, s) => 
            sum + s.saldo_pagado, 0),
          total_pendiente: contactData?.services?.reduce((sum, s) => 
            sum + s.saldo_pendiente, 0)
        },
        servicios: contactData?.services?.map(s => ({
          id: s.id,
          nombre: s.nombre_servicio,
          tipo: s.tipo_servicio,
          valor_total: s.valor_total,
          saldo_pagado: s.saldo_pagado,
          saldo_pendiente: s.saldo_pendiente,
          estado: s.estado,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          pagos: s.pagos?.map(p => ({
            monto: p.monto,
            fecha: p.fecha_pago,
            metodo: p.metodo_pago,
            estado: p.estado
          }))
        }))
      },
      
      // === FECHAS IMPORTANTES ===
      fechas_importantes: {
        creacion: contact.created_at,
        ultima_interaccion: contact.ultima_interaccion,
        primera_cita: contactData?.appointments?.slice(-1)[0]?.fecha_hora,
        proxima_cita: contactData?.appointments?.find(a => 
          new Date(a.fecha_hora) > new Date())?.fecha_hora,
        ultimo_pago: contactData?.services?.flatMap(s => s.pagos || [])
          ?.sort((a, b) => new Date(b.fecha_pago).getTime() - 
            new Date(a.fecha_pago).getTime())[0]?.fecha_pago
      }
    }
  },
  history: messages.slice(-20).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))
};
```

### Fase 4: Actualizar Schema de Validación

**Archivo**: `lib/api-schemas.ts`

```typescript
export const ContactContextSchema = z.object({
  // Base
  id: z.number().optional(),
  nombre: z.string().optional(),
  apellido: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().optional(),
  estado: z.string().optional(),
  es_calificado: z.string().optional(),
  origen: z.string().optional(),
  is_active: z.boolean().optional(),
  paused_until: z.string().nullable().optional(),
  created_at: z.string().optional(),
  ultima_interaccion: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  
  // Embudo
  embudo: z.object({
    etapa_id: z.number().optional(),
    nombre: z.string().optional(),
    descripcion: z.any().optional(),
    orden: z.number().optional()
  }).optional(),
  
  // Asesor
  asesor: z.object({
    id: z.number(),
    nombre: z.string(),
    email: z.string().optional(),
    rol: z.string().optional()
  }).nullable().optional(),
  
  // Arrays completos
  conversaciones: z.array(z.any()).optional(),
  citas: z.array(z.any()).optional(),
  transcripciones: z.array(z.any()).optional(),
  notas: z.array(z.any()).optional(),
  tareas: z.array(z.any()).optional(),
  cartera: z.any().optional(),
  fechas_importantes: z.any().optional()
});

export const EnterpriseContextSchema = z.object({
  identity: z.object({
    nombre: z.string(),
    rubro: z.string().optional(),
    mision: z.string().optional(),
    servicios: z.string().optional(),
    informacion: z.string().optional()
  }).optional(),
  contact: ContactContextSchema.optional()
}).optional();
```

### Fase 5: Actualizar buildSystemPrompt()

**Archivo**: `app/api/chat/route.ts`

```typescript
function buildSystemPrompt(
  enterpriseContext: any, 
  userTimezone?: string, 
  role?: MonicaRole | null
): string {
  let promptStr = `Eres Monica, la Asistente IA de ${enterpriseContext?.identity?.nombre || 'la empresa'}.

## Tu Rol
Tienes acceso COMPLETO al historial de este cliente. Conoces TODO sobre él desde el primer día.
Usa este conocimiento para dar respuestas precisas y personalizadas.

`;

  // === INFORMACIÓN DEL CLIENTE ===
  if (enterpriseContext?.contact) {
    const c = enterpriseContext.contact;
    
    promptStr += `# 👤 CLIENTE: ${c.nombre} ${c.apellido || ''}\n\n`;
    
    // Datos Base
    promptStr += `## Información de Contacto\n`;
    promptStr += `- **Teléfono**: ${c.telefono || 'No registrado'}\n`;
    promptStr += `- **Email**: ${c.email || 'No registrado'}\n`;
    promptStr += `- **Estado**: ${c.estado || 'Sin estado'}\n`;
    promptStr += `- **Calificación**: ${c.es_calificado || 'No evaluado'}\n`;
    promptStr += `- **Origen**: ${c.origen || 'Desconocido'}\n`;
    promptStr += `- **Activo**: ${c.is_active ? 'Sí' : 'No'}\n`;
    if (c.paused_until) promptStr += `- **Pausado hasta**: ${c.paused_until}\n`;
    promptStr += `\n`;
    
    // Embudo
    if (c.embudo) {
      promptStr += `## 📊 Etapa del Embudo\n`;
      promptStr += `- **Etapa Actual**: ${c.embudo.nombre}\n`;
      if (c.embudo.descripcion) {
        const desc = typeof c.embudo.descripcion === 'object' 
          ? JSON.stringify(c.embudo.descripcion) 
          : c.embudo.descripcion;
        promptStr += `- **Descripción**: ${desc}\n`;
      }
      promptStr += `\n`;
    }
    
    // Asesor
    if (c.asesor) {
      promptStr += `## 👨‍💼 Asesor Asignado\n`;
      promptStr += `- **Nombre**: ${c.asesor.nombre}\n`;
      if (c.asesor.email) promptStr += `- **Email**: ${c.asesor.email}\n`;
      if (c.asesor.rol) promptStr += `- **Rol**: ${c.asesor.rol}\n`;
      promptStr += `\n`;
    }
    
    // Fechas Importantes
    if (c.fechas_importantes) {
      promptStr += `## 📅 Fechas Importantes\n`;
      const f = c.fechas_importantes;
      if (f.creacion) promptStr += `- **Cliente desde**: ${new Date(f.creacion).toLocaleDateString('es-ES')}\n`;
      if (f.ultima_interaccion) promptStr += `- **Última interacción**: ${new Date(f.ultima_interaccion).toLocaleDateString('es-ES')}\n`;
      if (f.primera_cita) promptStr += `- **Primera cita**: ${new Date(f.primera_cita).toLocaleDateString('es-ES')}\n`;
      if (f.proxima_cita) promptStr += `- **Próxima cita**: ${new Date(f.proxima_cita).toLocaleString('es-ES')}\n`;
      if (f.ultimo_pago) promptStr += `- **Último pago**: ${new Date(f.ultimo_pago).toLocaleDateString('es-ES')}\n`;
      promptStr += `\n`;
    }
    
    // Conversaciones con Mensajes
    if (c.conversaciones?.length > 0) {
      promptStr += `## 💬 Historial de Conversaciones (${c.conversaciones.length})\n`;
      c.conversaciones.forEach((conv: any, idx: number) => {
        promptStr += `\n### Conversación ${idx + 1} (${conv.canal || 'Chat'}) - ${conv.status}\n`;
        promptStr += `**Fecha**: ${new Date(conv.fecha_inicio).toLocaleString('es-ES')}\n`;
        if (conv.resumen) promptStr += `**Resumen**: ${conv.resumen}\n`;
        
        if (conv.mensajes?.length > 0) {
          promptStr += `**Mensajes:**\n`;
          conv.mensajes.forEach((msg: any) => {
            const fecha = new Date(msg.fecha).toLocaleString('es-ES');
            promptStr += `- [${fecha}] **${msg.remitente}**: ${msg.contenido}\n`;
          });
        }
      });
      promptStr += `\n`;
    }
    
    // Citas
    if (c.citas?.length > 0) {
      promptStr += `## 📆 Historial de Citas (${c.citas.length})\n`;
      c.citas.forEach((cita: any) => {
        promptStr += `- **${cita.titulo}** (${cita.estado})\n`;
        promptStr += `  - Fecha: ${new Date(cita.fecha_hora).toLocaleString('es-ES')}\n`;
        if (cita.tipo) promptStr += `  - Tipo: ${cita.tipo}\n`;
        if (cita.duracion) promptStr += `  - Duración: ${cita.duracion} min\n`;
        if (cita.descripcion) promptStr += `  - Descripción: ${cita.descripcion}\n`;
      });
      promptStr += `\n`;
    }
    
    // Transcripciones
    if (c.transcripciones?.length > 0) {
      promptStr += `## 🎙️ Transcripciones de Reuniones (${c.transcripciones.length})\n`;
      c.transcripciones.forEach((t: any) => {
        promptStr += `\n### ${t.cita_titulo || 'Reunión'} - ${new Date(t.fecha).toLocaleDateString('es-ES')}\n`;
        if (t.duracion) promptStr += `**Duración**: ${t.duracion} segundos\n`;
        if (t.resumen) promptStr += `**Resumen**: ${t.resumen}\n`;
        if (t.resumen_cita) promptStr += `**Conclusiones**: ${t.resumen_cita}\n`;
        if (t.transcripcion_completa) {
          promptStr += `**Transcripción completa**:\n${t.transcripcion_completa}\n`;
        }
      });
      promptStr += `\n`;
    }
    
    // Notas
    if (c.notas?.length > 0) {
      promptStr += `## 📝 Notas del Equipo (${c.notas.length})\n`;
      c.notas.forEach((nota: any) => {
        const pinned = nota.es_fijado ? '📌 ' : '';
        promptStr += `- ${pinned}**${nota.titulo || 'Nota'}** (${new Date(nota.fecha).toLocaleDateString('es-ES')})\n`;
        promptStr += `  ${nota.descripcion}\n`;
        if (nota.autor) promptStr += `  *Por: ${nota.autor}*\n`;
        if (nota.etiquetas?.length) promptStr += `  Tags: ${nota.etiquetas.join(', ')}\n`;
      });
      promptStr += `\n`;
    }
    
    // Tareas
    if (c.tareas?.length > 0) {
      promptStr += `## ✅ Tareas (${c.tareas.length})\n`;
      c.tareas.forEach((tarea: any) => {
        const prioridadEmoji = ['', '🟢', '🟡', '🟠', '🔴'][tarea.prioridad] || '';
        promptStr += `- ${prioridadEmoji} **${tarea.titulo}** [${tarea.estado}]\n`;
        if (tarea.descripcion) promptStr += `  ${tarea.descripcion}\n`;
        if (tarea.asignado_a) promptStr += `  *Asignado a: ${tarea.asignado_a}*\n`;
        if (tarea.fecha_vencimiento) promptStr += `  *Vence: ${new Date(tarea.fecha_vencimiento).toLocaleDateString('es-ES')}*\n`;
        if (tarea.items?.length > 0) {
          promptStr += `  Checklist:\n`;
          tarea.items.forEach((item: any) => {
            const check = item.completado ? '☑️' : '⬜';
            promptStr += `    ${check} ${item.texto}\n`;
          });
        }
      });
      promptStr += `\n`;
    }
    
    // Cartera/Servicios
    if (c.cartera?.servicios?.length > 0) {
      promptStr += `## 💰 Cartera de Servicios\n`;
      const r = c.cartera.resumen;
      promptStr += `**Resumen Financiero:**\n`;
      promptStr += `- Total Contratado: $${r.total_contratado?.toLocaleString() || 0}\n`;
      promptStr += `- Total Pagado: $${r.total_pagado?.toLocaleString() || 0}\n`;
      promptStr += `- Saldo Pendiente: $${r.total_pendiente?.toLocaleString() || 0}\n\n`;
      
      promptStr += `**Servicios Contratados:**\n`;
      c.cartera.servicios.forEach((s: any) => {
        promptStr += `\n### ${s.nombre} (${s.estado})\n`;
        promptStr += `- Tipo: ${s.tipo}\n`;
        promptStr += `- Valor: $${s.valor_total?.toLocaleString()}\n`;
        promptStr += `- Pagado: $${s.saldo_pagado?.toLocaleString()}\n`;
        promptStr += `- Pendiente: $${s.saldo_pendiente?.toLocaleString()}\n`;
        if (s.fecha_inicio) promptStr += `- Inicio: ${new Date(s.fecha_inicio).toLocaleDateString('es-ES')}\n`;
        if (s.fecha_fin) promptStr += `- Fin: ${new Date(s.fecha_fin).toLocaleDateString('es-ES')}\n`;
        
        if (s.pagos?.length > 0) {
          promptStr += `- Historial de pagos:\n`;
          s.pagos.forEach((p: any) => {
            promptStr += `  - $${p.monto?.toLocaleString()} (${p.metodo || 'N/A'}) - ${new Date(p.fecha).toLocaleDateString('es-ES')} [${p.estado}]\n`;
          });
        }
      });
      promptStr += `\n`;
    }
    
    // Metadata adicional
    if (c.metadata && Object.keys(c.metadata).length > 0) {
      promptStr += `## 🏷️ Metadata/Tags\n`;
      promptStr += `\`\`\`json\n${JSON.stringify(c.metadata, null, 2)}\n\`\`\`\n\n`;
    }
  }
  
  // Servicios de la Empresa
  if (enterpriseContext?.identity?.servicios) {
    promptStr += `## 🏢 Servicios de la Empresa\n`;
    promptStr += `${enterpriseContext.identity.servicios}\n\n`;
  }
  
  if (enterpriseContext?.identity?.informacion) {
    promptStr += `## ℹ️ Información Empresarial\n`;
    promptStr += `${enterpriseContext.identity.informacion}\n\n`;
  }
  
  // Contexto Temporal
  promptStr += getTemporalContext(userTimezone);
  
  return promptStr;
}
```

---

## 📈 Consideraciones de Performance

### Tamaño Estimado del Contexto

| Sección | Estimado por Cliente Activo |
|---------|----------------------------|
| Datos base | ~500 tokens |
| Embudo + Asesor | ~100 tokens |
| 10 conversaciones (50 msgs c/u) | ~5,000 tokens |
| 10 citas | ~500 tokens |
| 5 transcripciones | ~10,000 tokens |
| 20 notas | ~2,000 tokens |
| 10 tareas (5 items c/u) | ~1,000 tokens |
| 5 servicios (3 pagos c/u) | ~1,000 tokens |
| **TOTAL ESTIMADO** | **~20,000 tokens** |

### Límites del Modelo
- `gemini-3-flash-preview`: **1M tokens de contexto**
- `maxTokens` configurado: **500,000 tokens**

✅ **Hay capacidad de sobra** para el contexto completo.

### Optimizaciones Recomendadas

1. **Lazy Loading de Transcripciones**: Las transcripciones son las más pesadas. Considerar cargarlas solo si el usuario hace una pregunta que las requiera.

2. **Compresión de Mensajes Antiguos**: Para conversaciones con >100 mensajes, resumir los más antiguos.

3. **Cache de Contexto**: Almacenar el contexto serializado en localStorage/sessionStorage para evitar reconstruirlo en cada mensaje.

---

## 🔐 Seguridad

### Validaciones Requeridas

1. **Multi-Tenant**: SIEMPRE filtrar por `empresa_id` en las queries.
2. **Modo Observación**: Bloquear si `isObservationMode === true`.
3. **Sanitización**: Escapar contenido de mensajes antes de inyectar en prompt.

---

## ✅ Checklist de Implementación

### Fase 1: Store
- [ ] Agregar queries para tareas en `fetchContactDetails`
- [ ] Agregar queries para servicios/pagos en `fetchContactDetails`
- [ ] Agregar query para mensajes de conversaciones
- [ ] Agregar query para etapa del embudo con descripción
- [ ] Agregar query para asesor asignado
- [ ] Actualizar tipo `ActiveContactData`

### Fase 2: Frontend
- [ ] Actualizar `ContactAIChat.tsx` con nuevo formato de `enterpriseContext`
- [ ] Asegurar que `contactData` incluya los nuevos campos

### Fase 3: Backend
- [ ] Actualizar `EnterpriseContextSchema` en `api-schemas.ts`
- [ ] Reescribir `buildSystemPrompt()` en `route.ts`
- [ ] Agregar formateo para cada sección del contexto

### Fase 4: Testing
- [ ] Probar con cliente con mucho historial
- [ ] Verificar que no exceda límites de tokens
- [ ] Probar preguntas específicas sobre historial

---

## 📚 Referencias

- **get-contact-360.ts**: Tool existente que ya hace algo similar (pero limitado)
- **contact-profile-context.ts**: Lógica de generación de contexto para UI
- **data-model.md**: Esquema completo de base de datos

---

*Documento creado: Enero 2025*
*Autor: Cascade AI*
*Para: Tony - Urpe AI Lab*
