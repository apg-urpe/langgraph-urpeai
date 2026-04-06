---
title: "Arquitectura Anti-Errores v2 - Urpe AI Lab"
---

## 1. Filosofía: Resiliencia Multi-Capa
El sistema debe estar diseñado para "fallar con gracia". Un error en un componente secundario o una respuesta de API malformada no debe romper la experiencia global del usuario.

## 2. Pilares Técnicos

### 2.1 Validación Estricta en la Frontera (Zod)
Toda entrada de datos desde fuentes externas (APIs, LocalStorage, Input del usuario) DEBE ser validada antes de entrar al estado de la aplicación.
- **Location**: `lib/api-schemas.ts` y `lib/ui/BlockValidator.ts`.
- **Regla**: Preferir `safeParse` para manejar errores sin lanzar excepciones.

### 2.2 Error Boundaries Granulares
Implementar `ErrorBoundary` envolviendo módulos lógicos (Chat, Kanban, Detalle de Contacto).
- **Componente**: `components/ErrorBoundary.tsx`.
- **Estrategia**: Mostrar un fallback visual amigable que permita el "Reintento" o "Limpieza de Cache".

### 2.3 Logging Estructurado y Alertas
Centralizar los errores para auditoría y corrección proactiva.
- **Logger**: `lib/logger.ts` (consola) + `lib/error-logger.ts` (base de datos).
- **Alertas**: Integración con `lib/alert-service.ts` para errores críticos (Severity: Critical).

### 2.4 Tipado Seguro (TypeScript Strict)
Evitar el uso de `any`. Definir interfaces claras para los contratos de API en `types/api.ts`.

---

## 3. Estándar de Implementación para /api/chat

### Payload de Request
```typescript
interface ChatRequest {
  chatInput: string;
  history: Array<{ role: string; content: string }>;
  enterpriseContext: {
    identity: { nombre: string; rubro?: string };
    contact?: Partial<Contact>;
  };
  // Seguridad
  userId: string; 
  sessionId: string;
}
```

### Manejo de Stream
- Usar `streamText` de Vercel AI SDK.
- Implementar validación de sesión (Supabase SSR) en cada request.
- Catch global para retornar JSON de error estructurado si el stream falla.

---

## 4. Trazabilidad del Embudo (Integridad de Datos)
El movimiento de contactos en el Kanban debe ser una operación atómica que actualice:
1. `wp_contactos.etapa_embudo` (FK para vista).
2. `wp_contacto_estado_embudo` (Log para historial).
3. `wp_actividades_log` (Auditoría de usuario).

---

## 6. Implementación Técnica Anti-Errores

### 6.1 SafeBlockRenderer (Componente de Alto Nivel)
Se ha implementado `SafeBlockRenderer` para envolver cada componente visual generado por la IA.
- **Validación Automática**: Utiliza `BlockValidator` con Zod para asegurar que el JSON de la IA cumpla con el contrato esperado.
- **Aislamiento de Errores**: Implementa un `ErrorBoundary` interno con un sistema de reintentos (hasta 3).
- **Graceful Fallback**: Si un bloque falla, se muestra una interfaz de error minimalista con detalles técnicos para debugging, sin romper la conversación.

### 6.2 Atomicidad en el Embudo
La acción `updateContactStage` ahora garantiza:
1. Actualización del contacto (`wp_contactos`).
2. Registro de historial (`wp_contacto_estado_embudo`) con origen (manual/ia).
3. Actualización optimista del estado local en `contactStore`.

### 6.3 Seguridad en API de Chat
El endpoint `/api/chat` ahora:
- Valida el payload completo con Zod (`ChatRequestSchema`).
- Verifica la sesión del usuario vía cookies en cada request.
- Resuelve el `enterpriseId` de forma segura basándose en los permisos del usuario en `wp_team_humano`.

---

## 7. Archivos Modificados (Resumen Técnico)

| Archivo | Cambio |
|---------|--------|
| `store/contactStore.ts` | `updateContactStage` con atomicidad y trazabilidad en `wp_contacto_estado_embudo` |
| `lib/api-schemas.ts` | Esquemas Zod: `ChatRequestSchema`, `ChatHistoryMessageSchema`, `EnterpriseContextSchema` |
| `app/api/chat/route.ts` | Validación Zod en POST, autenticación segura con Supabase SSR |
| `components/SafeBlockRenderer.tsx` | Renderizador con validación, reintentos (3x), fallbacks visuales |
| `components/ErrorBoundary.tsx` | Prop `componentName` para logging granular |
| `components/ChatArea.tsx` | Migración a `SafeBlockRenderer` para bloques de IA |
| `components/MessageContentRenderer.tsx` | Integración con `SafeBlockRenderer` y `BlockPart` memoizado |
| `components/admin/ContactDetailPanel.tsx` | `ContactAIChat` envuelto en `ErrorBoundary` |
| `components/admin/contact-details/ContactAIChat.tsx` | Payload estructurado con `ChatRequest` |

---

## 8. Flujo de Datos Resiliente

```
[User Input] 
    ↓
[Zod Validation] ─── Error? → [400 + Details]
    ↓
[Auth Check] ─────── Error? → [401 + Redirect]
    ↓
[Enterprise Resolution] ── Error? → [403 + Log]
    ↓
[AI Stream] ────────── Error? → [500 + Structured Error]
    ↓
[BlockValidator] ──── Invalid? → [UnknownBlockFallback]
    ↓
[SafeBlockRenderer] ─ Crash? → [BlockErrorFallback + Retry]
    ↓
[VisualRenderer] ──── Success → [UI Component]
```

---

## 9. Verificación

```bash
# Compilación limpia (sin errores de tipos)
npx tsc --noEmit

# Desarrollo
node node_modules/next/dist/bin/next dev
```

**Estado**: ✅ Implementación completa - Enero 2026
