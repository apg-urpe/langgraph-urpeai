# Sistema de Actualizaciones de Versión - Contexto de Componentes

## Overview
El sistema de actualizaciones de versión en Urpe AI Lab detecta automáticamente cuando una nueva versión es desplegada en Vercel y notifica a los usuarios con un botón para reiniciar la aplicación.

## Arquitectura General

### Componentes Principales
**Componente**: `VersionUpdateNotification.tsx`
**Propósito**: Notificación flotante que aparece cuando hay una actualización disponible
**Ubicación**: Bottom-right corner de la aplicación (global via layout.tsx)

### Flujo de Detección de Actualizaciones

#### 1. Verificación de Versión
- **API Endpoint**: `/api/version` retorna información de la versión actual
- **Frecuencia**: Cada 5 minutos automáticamente
- **Storage**: LocalStorage para persistir información de versión

#### 2. Comparación de Versiones
- **Versión Actual**: Obtenida de variables de entorno (`NEXT_PUBLIC_APP_VERSION`)
- **Versión Remota**: Fetch desde API endpoint
- **Lógica**: Comparación semántica (major.minor.patch)

#### 3. Notificación al Usuario
- **UI**: Card flotante con diseño del sistema
- **Acciones**: "Ahora no" (dismiss) o "Reiniciar ahora"
- **Persistencia**: Usuario puede dismiss notificación específica

## Componente VersionUpdateNotification

### Estructura Visual
- **Header**: Icono de descarga + título + versión disponible + botón cerrar
- **Content**: Mensaje explicativo + comparación de versiones
- **Actions**: Botones de dismiss y reinicio
- **Indicator**: Punto animado cuando está verificando

### Estados del Componente
- **Hidden**: No hay actualizaciones o fue dismisseda
- **Visible**: Hay actualización disponible
- **Checking**: Verificando nuevas versiones (indicador de progreso)

### Interacciones
- **Dismiss**: Guarda versión en localStorage para no mostrar nuevamente
- **Restart**: Limpia caches + reload forzado de la página
- **Auto-check**: Verificación periódica cada 5 minutos

## Sistema de Versiones

### Variables de Entorno
```typescript
NEXT_PUBLIC_APP_VERSION: "4.0.0"        // Versión actual
NEXT_PUBLIC_BUILD_TIME: "2024-12-25..." // Timestamp de build
NEXT_PUBLIC_COMMIT_HASH: "abc123"        // Git commit SHA
```

### API Endpoint `/api/version`
```typescript
interface VersionInfo {
  version: string;      // "4.0.0"
  buildTime?: string;   // ISO timestamp
  commitHash?: string;  // Git SHA
  environment: string;  // "production" | "development"
}
```

### Lógica de Comparación
- **Semver**: Comparación numérica por major.minor.patch
- **Cache**: 5 minutos entre verificaciones
- **Storage**: LocalStorage para persistencia

## Integración con Layout

### Root Layout (`app/layout.tsx`)
```tsx
import { VersionUpdateNotification } from '../components/VersionUpdateNotification';

// En el body
<VersionUpdateNotification onRestart={handleRestart} />
```

### Manejo de Reinicio
- **Service Workers**: Unregister todos los SW
- **Cache Clear**: Limpia caches del navegador
- **Force Reload**: `window.location.reload(true)`

## Casos de Uso

### 1. Deploy en Vercel
- Nueva versión desplegada
- API retorna versión actualizada
- Usuarios notificados automáticamente

### 2. Desarrollo Local
- Simulación con query param `?simulate=update`
- Testing de flujo de actualización
- Debug de notificación

### 3. Usuario Ocupado
- Puede dismiss notificación
- No volverá a mostrar para misma versión
- Reaparecerá si hay nueva versión

## Configuración de Next.js

### Environment Variables
```javascript
// next.config.js
env: {
  NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
  NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  NEXT_PUBLIC_COMMIT_HASH: process.env.VERCEL_GIT_COMMIT_SHA,
}
```

### Build-time Injection
- Versión inyectada durante build
- Commit hash de Vercel/GitHub
- Timestamp de compilación

## Performance y UX

### Optimizaciones
- **Debouncing**: No spam de verificaciones
- **Cache**: 5 minutos entre requests
- **Lazy Loading**: Componente monta bajo demanda

### UX Considerations
- **Non-intrusive**: No bloquea aplicación
- **Optional**: Usuario puede dismiss
- **Clear Actions**: Botones claros y específicos
- **Visual Feedback**: Indicadores de progreso

## Testing y Debugging

### Development Testing
```bash
# Simular actualización
http://localhost:3000?simulate=update
```

### Debug Tools
- Console logs de verificación
- LocalStorage inspection
- Network tab para API calls

## Seguridad y Privacidad

### Consideraciones
- **No PII**: Solo información de versión
- **Local Storage**: Datos locales no sensibles
- **Cache Headers**: No caching de API endpoint

### Best Practices
- **Rate Limiting**: No abusar de verificaciones
- **Error Handling**: Graceful degradation
- **User Control**: Siempre opción de dismiss

Este sistema proporciona una experiencia fluida de actualización automática que mantiene a los usuarios siempre con la última versión sin interrumpir su flujo de trabajo.
