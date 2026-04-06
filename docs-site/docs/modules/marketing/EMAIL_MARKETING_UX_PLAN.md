---
title: "Email Marketing - Plan de Diseño UX/UI"
---

> **Ubicación**: Menu Lab → "Mi Email IA"  
> **Objetivo**: Crear y gestionar audiencias de forma intuitiva y conversacional

---

## 1. Arquitectura de Navegación

### 1.1 Estructura de Pestañas (Tabs)

```
┌─────────────────────────────────────────────────────────────┐
│  📧 Email Marketing                                         │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│  Audiencias │  Campañas   │  Envíos     │  Analíticas      │
└─────────────┴─────────────┴─────────────┴──────────────────┘
```

| Tab | Propósito | Carga Cognitiva |
|-----|-----------|-----------------|
| **Audiencias** | Crear/gestionar grupos de contactos | Media - Principal flujo de trabajo |
| **Campañas** | Configurar secuencias de emails | Alta - Solo cuando necesario |
| **Envíos** | Historial de emails enviados | Baja - Solo lectura |
| **Analíticas** | Métricas de rendimiento | Baja - Visualización |

---

## 2. Tab Principal: Audiencias

### 2.1 Vista Lista (Estado por defecto)

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 Audiencias                          [+ Nueva Audiencia] │
├─────────────────────────────────────────────────────────────┤
│  🔍 Buscar audiencia...                    Filtrar ▼        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📊 Leads Calificados Q4           🏷️ Dinámica       │   │
│  │ 847 contactos • Actualizado hace 2h                 │   │
│  │ Filtros: estado=calificado, fecha>2024-10           │   │
│  │                                    [Usar] [Editar]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 👥 Clientes VIP                    🏷️ Estática      │   │
│  │ 156 contactos • Creado: 15 dic 2024                 │   │
│  │ Lista curada manualmente                            │   │
│  │                                    [Usar] [Editar]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Botón "Nueva Audiencia" → Abre Modal Conversacional

---

## 3. Flujo Conversacional: Crear Audiencia

### 3.1 Principio de Diseño
> **"Pregunta una cosa a la vez"** - Reducir carga cognitiva fragmentando decisiones.

### 3.2 Paso 1: Nombre y Descripción

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Nueva Audiencia                                    [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ¿Cómo quieres llamar a esta audiencia?                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Leads de Enero 2025                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Descripción breve (opcional)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Contactos nuevos del primer mes del año             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                          [Continuar →]     │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Paso 2: Tipo de Audiencia (Decisión Visual)

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Nueva Audiencia                                    [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ¿Cómo quieres construir "Leads de Enero 2025"?            │
│                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐      │
│  │                       │  │                       │      │
│  │   🎯 DINÁMICA         │  │   📋 ESTÁTICA         │      │
│  │                       │  │                       │      │
│  │  Se actualiza sola    │  │  Lista fija de        │      │
│  │  según tus filtros    │  │  contactos            │      │
│  │                       │  │                       │      │
│  │  "Todos los leads     │  │  "Estos 50 contactos  │      │
│  │   calificados"        │  │   específicos"        │      │
│  │                       │  │                       │      │
│  └───────────────────────┘  └───────────────────────┘      │
│                                                             │
│  [← Atrás]                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Paso 3a: Audiencia DINÁMICA - Constructor de Filtros

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Nueva Audiencia → Dinámica                         [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Define quién entra en esta audiencia:                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ + Añadir condición                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📅 Fecha de creación                                │   │
│  │    [es después de ▼] [1 enero 2025      📅]        │   │
│  │                                              [🗑️]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Y ─────────────────────────────────────────────────┐   │
│  │ 🏷️ Estado                                           │   │
│  │    [es igual a ▼]   [Nuevo ▼]                      │   │
│  │                                              [🗑️]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  👁️ Vista previa: 234 contactos coinciden                  │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [← Atrás]                              [Crear Audiencia]  │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 Opciones de Filtros Disponibles

| Categoría | Campo | Operadores |
|-----------|-------|------------|
| **Fechas** | Fecha de creación | es después de, es antes de, está entre |
| **Fechas** | Última interacción | hace menos de X días, hace más de X días |
| **Estado** | Estado del contacto | es igual a, no es igual a |
| **Estado** | Etapa del embudo | es igual a, no es igual a |
| **Estado** | Es calificado | sí, no |
| **Texto** | Origen | contiene, es igual a |
| **Texto** | Metadata (tags) | contiene palabra clave |
| **Asignación** | Asesor asignado | es igual a, no está asignado |

### 3.6 Paso 3b: Audiencia ESTÁTICA - Selector de Contactos

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Nueva Audiencia → Estática                         [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Selecciona los contactos para esta audiencia:             │
│                                                             │
│  🔍 Buscar contacto...          Filtrar rápido: [Todos ▼]  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑️ Juan Pérez          📧 juan@email.com           │   │
│  │ ☑️ María García        📧 maria@empresa.com        │   │
│  │ ☐ Carlos López         📧 carlos@otro.com          │   │
│  │ ☐ Ana Martínez         📧 ana@test.com             │   │
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ✓ 2 contactos seleccionados                               │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [← Atrás]                              [Crear Audiencia]  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Interacción Conversacional Avanzada (Fase 2)

### 4.1 Input Natural con IA

En lugar de construir filtros manualmente, el usuario puede escribir:

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Nueva Audiencia → Dinámica                         [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Describe quién debe estar en esta audiencia:              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 💬 "Contactos creados en enero que sean de         │   │
│  │     referidos y no tengan cita agendada"           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ 🤖 Monica interpretó: ──────────────────────────────┐  │
│  │                                                       │  │
│  │  📅 Fecha creación: Enero 2025                       │  │
│  │  🏷️ Origen: contiene "referido"                      │  │
│  │  📆 Citas: 0 citas agendadas                         │  │
│  │                                                       │  │
│  │  [✓ Correcto] [Ajustar manualmente]                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  👁️ Vista previa: 67 contactos coinciden                   │
│                                                             │
│  [← Atrás]                              [Crear Audiencia]  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Tab: Campañas

### 5.1 Lista de Campañas

```
┌─────────────────────────────────────────────────────────────┐
│  📧 Campañas                              [+ Nueva Campaña] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟢 Bienvenida Nuevos Leads                          │   │
│  │ 3 toques • Cadencia: 3 días                         │   │
│  │ Audiencia: Leads de Enero 2025 (234)                │   │
│  │ Inscritos: 189 • Completados: 45                    │   │
│  │                              [Ver] [Pausar] [Stats] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⏸️ Re-engagement Q4                   (pausada)     │   │
│  │ 5 toques • Cadencia: 7 días                         │   │
│  │ Audiencia: Inactivos >30 días (412)                 │   │
│  │                                     [Ver] [Reanudar]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Crear Campaña - Vincular Audiencia

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Nueva Campaña                                      [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Nombre de la campaña                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Nurturing Leads Enero                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ¿A quién va dirigida?                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🎯 Selecciona una audiencia existente          [▼] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ • Leads de Enero 2025 (234 contactos)              │   │
│  │ • Clientes VIP (156 contactos)                     │   │
│  │ • Inactivos >30 días (412 contactos)               │   │
│  │ ─────────────────────────────────────              │   │
│  │ + Crear nueva audiencia                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Configuración de envío                                    │
│  Cadencia: [3 ▼] días entre toques                         │
│  Total de toques: [5 ▼]                                    │
│                                                             │
│                                            [Continuar →]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Componentes UI Reutilizables

### 6.1 FilterBuilder (Constructor de Filtros)

```typescript
interface FilterCondition {
  id: string;
  field: 'created_at' | 'estado' | 'origen' | 'es_calificado' | 'etapa_embudo' | 'metadata' | 'team_humano_id';
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'between' | 'contains' | 'is_null';
  value: string | number | boolean | [string, string];
}

interface FilterGroup {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}
```

### 6.2 AudiencePreview

- Muestra contador en tiempo real mientras se ajustan filtros
- Debounce de 500ms para evitar queries excesivos
- Loading skeleton durante cálculo

### 6.3 ContactSelector (Para audiencias estáticas)

- Búsqueda instantánea
- Selección múltiple con checkboxes
- Filtros rápidos predefinidos
- Contador de seleccionados

---

## 7. Estados y Feedback

### 7.1 Estados de Audiencia

| Estado | Indicador | Significado |
|--------|-----------|-------------|
| 🟢 Activa | Badge verde | Audiencia lista para usar |
| 🔄 Calculando | Spinner | Actualizando conteo (dinámicas) |
| ⚠️ Vacía | Badge ámbar | 0 contactos coinciden |
| 🗑️ Archivada | Opacidad reducida | Ya no se usa |

### 7.2 Mensajes de Confirmación

- **Crear**: "✓ Audiencia creada con 234 contactos"
- **Actualizar**: "✓ Filtros actualizados. Ahora: 189 contactos"
- **Eliminar**: "¿Eliminar audiencia? Las campañas vinculadas perderán su audiencia."

---

## 8. Responsive Design

### 8.1 Mobile (< 768px)

- Tabs como scroll horizontal
- Cards de audiencia en lista vertical
- Modal de creación ocupa pantalla completa
- Filtros colapsables en acordeón

### 8.2 Tablet (768px - 1024px)

- Grid 2 columnas para cards
- Modal al 80% de ancho

### 8.3 Desktop (> 1024px)

- Grid 3 columnas para cards
- Modal centrado 600px max-width
- Preview de contactos en sidebar

---

## 9. Carga Cognitiva - Principios

1. **Progresión gradual**: Mostrar solo lo necesario en cada paso
2. **Defaults inteligentes**: Pre-seleccionar opciones comunes
3. **Preview inmediato**: Ver resultados antes de confirmar
4. **Escape fácil**: Siempre poder volver atrás o cancelar
5. **Contexto persistente**: Breadcrumbs y progreso visible
6. **Vocabulario familiar**: "Audiencia" no "Segmento" ni "Cohorte"

---

## 10. Archivos a Crear

```
components/
├── admin/
│   └── email-marketing/
│       ├── EmailMarketingView.tsx      # Vista principal con tabs
│       ├── AudiencesTab.tsx            # Lista de audiencias
│       ├── CampaignsTab.tsx            # Lista de campañas
│       ├── SendsTab.tsx                # Historial de envíos
│       ├── AnalyticsTab.tsx            # Métricas
│       ├── CreateAudienceModal.tsx     # Flujo conversacional
│       ├── FilterBuilder.tsx           # Constructor de condiciones
│       ├── AudiencePreview.tsx         # Preview contador
│       ├── ContactSelector.tsx         # Selector para estáticas
│       └── CreateCampaignModal.tsx     # Crear campaña

store/
├── emailMarketingStore.ts              # Estado global del módulo

types/
├── marketing.ts                        # Ya existe - extender si necesario
```

---

## 11. Fases de Implementación

### Fase 1: MVP (1-2 semanas)
- [ ] EmailMarketingView con tabs
- [ ] AudiencesTab con lista
- [ ] CreateAudienceModal (flujo básico)
- [ ] FilterBuilder (campos esenciales)
- [ ] Store básico

### Fase 2: Campañas (1 semana)
- [ ] CampaignsTab
- [ ] CreateCampaignModal
- [ ] Vinculación audiencia-campaña

### Fase 3: Inteligencia (1 semana)
- [ ] Input conversacional con Monica
- [ ] Interpretación de lenguaje natural
- [ ] Sugerencias de filtros

### Fase 4: Analytics (1 semana)
- [ ] SendsTab con historial
- [ ] AnalyticsTab con métricas
- [ ] Gráficos de rendimiento
