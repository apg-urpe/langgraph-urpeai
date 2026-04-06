# Sistema de Contexto de Perfil de Contacto

## Overview

El sistema de contexto de perfil de contacto proporciona una forma estructurada y optimizada de generar y consumir información enriquecida sobre los contactos en la vista de detalles. Utiliza algoritmos de inteligencia de negocio para calcular métricas, puntuaciones y recomendaciones.

## Arquitectura

### Componentes Principales

1. **`lib/contact-profile-context.ts`** - Motor principal de generación de contexto
2. **`hooks/useContactProfileContext.ts`** - Hooks de React para acceso optimizado
3. **`components/admin/contact-details/ContactProfileSummary.tsx`** - Componente UI de ejemplo

### Flujo de Datos

```
Contact Data → Context Generator → React Hook → UI Components
```

## Características del Contexto

### 1. Información de Identidad
- **Nombre completo y display name**
- **Iniciales para avatar**
- **Colores dinámicos basados en estado**
- **Indicador de calificación**

### 2. Estado y Calificación
- **Estado actual** (cliente, prospecto, etc.)
- **Calificación** (calificado, no calificado, pendiente)
- **Estado de pausa** (pausado, desactivado, activo)
- **Tiempo restante en pausa**

### 3. Inteligencia de Negocio
- **Lead Score** (0-100 puntos)
- **Nivel de lead** (hot, warm, cold)
- **Factores que contribuyen al score**
- **Probabilidad de conversión**
- **Etapa del embudo con progreso**

### 4. Métricas de Engagement
- **Score de actividad** (0-100)
- **Nivel de engagement** (high, medium, low)
- **Contadores de interacciones**
- **Última actividad con tiempo relativo**

### 5. Información de Contacto
- **Teléfono e email**
- **Método preferido de contacto**
- **URL de Drive si existe**
- **Asesor asignado**

### 6. Metadatos Flexibles
- **Etiquetas personalizadas**
- **Campos custom**
- **Datos de negocio**
- **Metadata estructurada**

### 7. Acciones Rápidas
- **Capacidad de llamar/email**
- **Ventana de 24h para WhatsApp**
- **Citas próximas**
- **Disponibilidad para agendar**

### 8. Resumen Ejecutivo
- **Headline descriptivo**
- **Puntos clave**
- **Próximos pasos**
- **Factores de riesgo**
- **Oportunidades**

## Uso Básico

### Hook Principal

```typescript
import { useContactProfileContext } from '@/hooks/useContactProfileContext';

const MyComponent = ({ contactId }: { contactId: number }) => {
  const context = useContactProfileContext(contactId);
  
  if (!context) return <div>Loading...</div>;
  
  return (
    <div>
      <h3>{context.identity.displayName}</h3>
      <span className={context.status.state.color}>
        {context.status.state.label}
      </span>
      <div>Lead Score: {context.intelligence.leadScore.value}</div>
    </div>
  );
};
```

### Hooks Especializados

```typescript
// Resumen ejecutivo
const executiveSummary = useContactExecutiveSummary(contactId);

// Estado de pausa
const pauseStatus = useContactPauseStatus(contactId);

// Métricas de engagement
const engagement = useContactEngagementMetrics(contactId);

// Inteligencia de negocio
const business = useContactBusinessIntelligence(contactId);

// Acciones rápidas
const actions = useContactQuickActions(contactId);
```

## Componente de Resumen

```typescript
import { ContactProfileSummary } from '@/components/admin/contact-details/ContactProfileSummary';

// Vista completa
<ContactProfileSummary contactId={contactId} />

// Vista compacta
<ContactProfileSummary contactId={contactId} compact />

// Sin acciones rápidas
<ContactProfileSummary contactId={contactId} showActions={false} />
```

## Algoritmos de Cálculo

### Lead Score

El Lead Score se calcula basado en:

| Factor | Puntos | Condición |
|--------|--------|-----------|
| Calificado | 30 | `es_calificado = 'si'` |
| Cliente | 25 | `estado = 'cliente'` |
| Estado calificado | 20 | `estado = 'calificado'` |
| Prospecto | 10 | `estado = 'prospecto'` |
| Teléfono | 10 | `telefono != null` |
| Email | 10 | `email != null` |
| Drive | 5 | `url_drive != null` |
| Actividad < 7 días | 15 | `ultima_interaccion` |
| Actividad < 30 días | 5 | `ultima_interaccion` |
| Múltiples conversaciones | 10 | `conversations.length > 2` |
| Con citas | 15 | `appointments.length > 0` |
| Con notas | 5 | `notes.length > 2` |
| Con etiquetas | 5 | `metadata.tags` |

**Niveles:**
- **Hot**: 70+ puntos
- **Warm**: 40-69 puntos  
- **Cold**: 0-39 puntos

### Activity Score

```typescript
let activityScore = 50; // Base
activityScore += Math.max(0, 30 - diasDesdeUltimaInteraccion);
activityScore += Math.min(conversaciones.length * 5, 20);
activityScore += Math.min(citas.length * 10, 20);
activityScore += Math.min(notas.length * 3, 10);
```

### Probabilidad de Conversión

```typescript
percentage = Math.min(95, Math.round((leadScore * 0.7 + activityScore * 0.3) * 0.9));
confidence = leadScore.level === 'hot' ? 'high' : 
              leadScore.level === 'warm' ? 'medium' : 'low';
```

## Estados de Pausa

### Lógica de Pausa

```typescript
const isPaused = contact.is_active === false && 
                 contact.paused_until && 
                 new Date(contact.paused_until) > new Date();

const isDeactivated = contact.is_active === false && !contact.paused_until;
```

### Tiempo Restante

```typescript
const diffMs = pauseEnd.getTime() - now.getTime();
const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

if (diffHours > 24) {
  return `${diffDays}d ${diffHours % 24}h`;
}
return `${diffHours}h ${diffMinutes}m`;
```

## Ventana de 24h

### Detección

```typescript
const isIn24HourWindow = (ultimaInteraccion?: string | null): boolean => {
  if (!ultimaInteraccion) return false;
  const lastInteraction = new Date(ultimaInteraccion);
  const now = new Date();
  const diffHours = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
};
```

### UI Indicators

- **Verde**: Ventana activa (puede enviar WhatsApp)
- **Ámbar**: Ventana expirando (menos de 2h)
- **Gris**: Ventana cerrada

## Optimización de Rendimiento

### Memoización

El contexto se genera con `useMemo` para evitar recálculos innecesarios:

```typescript
const context = useMemo(() => {
  return generateContactProfileContext(contact, ...data);
}, [contact, ...dependencies]);
```

### Caching

- Los datos del contacto se cachean en Zustand (5min TTL)
- El contexto se recalcula solo cuando los datos base cambian
- Componentes individualmente memoizados

### Lazy Loading

- Datos de conversaciones, citas y notas se cargan bajo demanda
- El contexto funciona con datos parciales
- Indicadores de carga para cada sección

## Personalización

### Configuración de Colores

```typescript
const AVATAR_GRADIENTS = {
  qualified: 'from-amber-500/20 to-amber-600/10',
  cliente: 'from-emerald-500/20 to-emerald-600/10',
  // ... más configuraciones
};
```

### Configuración de Estados

```typescript
const STATE_CONFIG = {
  cliente: { label: 'Cliente', color: 'text-emerald-400', priority: 'high' },
  calificado: { label: 'Calificado', color: 'text-purple-400', priority: 'high' },
  // ... más configuraciones
};
```

## Extensiones Futuras

### Posibles Mejoras

1. **Machine Learning**: Modelo predictivo para conversión
2. **Segmentación Avanzada**: Clustering automático de contactos
3. **Recomendaciones**: Sugerencias de próximas acciones
4. **Integraciones**: Enriquecimiento con datos externos
5. **Análisis Temporal**: Tendencias y patrones temporales

### Nuevas Métricas

1. **Customer Lifetime Value (CLV)**
2. **Churn Probability**
3. **Next Best Action**
4. **Optimal Contact Time**
5. **Sentiment Analysis**

## Ejemplos de Uso

### Vista Compacta para Lista

```typescript
const ContactCard = ({ contactId }) => {
  const context = useContactProfileContext(contactId);
  
  return (
    <div className="flex items-center gap-3 p-3">
      <div className={`w-10 h-10 rounded-full ${context.identity.avatar.color}`}>
        {context.identity.initials}
      </div>
      <div className="flex-1">
        <div className="font-medium">{context.identity.displayName}</div>
        <div className="text-sm text-zinc-400">
          Lead Score: {context.intelligence.leadScore.value}
        </div>
      </div>
      {context.quickActions.isIn24hWindow && (
        <Zap className="w-4 h-4 text-emerald-400" />
      )}
    </div>
  );
};
```

### Vista Detallada para Panel

```typescript
const ContactDetailPanel = ({ contactId }) => {
  const context = useContactProfileContext(contactId);
  const pauseStatus = useContactPauseStatus(contactId);
  const engagement = useContactEngagementMetrics(contactId);
  
  return (
    <div className="space-y-6">
      <ContactProfileSummary contactId={contactId} />
      
      {pauseStatus.isPaused && (
        <PauseWarning timeRemaining={pauseStatus.timeRemaining} />
      )}
      
      <EngagementChart metrics={engagement} />
      
      <QuickActions actions={context.quickActions} />
    </div>
  );
};
```

## Conclusiones

El sistema de contexto de perfil de contacto proporciona:

✅ **Información enriquecida y estructurada**
✅ **Algoritmos de inteligencia de negocio**
✅ **Componentes reutilizables optimizados**
✅ **Hooks especializados para diferentes casos de uso**
✅ **Rendimiento optimizado con memoización**
✅ **Flexibilidad para personalizaciones futuras**

Este sistema mejora significativamente la experiencia del usuario al proporcionar información relevante y accionable sobre los contactos, permitiendo una gestión más eficiente y basada en datos.
