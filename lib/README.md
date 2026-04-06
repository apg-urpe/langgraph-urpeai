# Lib - Utilidades y Servicios

Esta carpeta contiene las librerías de utilidades, servicios y lógica de negocio compartida.

## Archivos

### `ui-helpers.ts`
Funciones de utilidad centralizadas para evitar duplicación en componentes y stores.

**Categorías:**
- **Phone**: `normalizePhone`, `looksLikePhone`, `formatPhoneDisplay`
- **Status**: `getStatusColor`, `getStatusBgColor`
- **Date/Time**: `formatRelativeTime`, `formatDate`
- **Currency**: `formatCurrency`, `formatNumber`, `formatPercentage`
- **String**: `getInitials`, `truncate`, `capitalize`
- **Avatar**: `getAvatarColor`
- **Validation**: `isValidEmail`, `isValidPhone`
- **Performance**: `debounce`
- **Search**: `escapeSearchTerm`, `highlightSearchTerm`

### `supabase-client.ts`
Cliente de Supabase configurado para la aplicación.

### `logger.ts`
Sistema de logging estructurado para reemplazar console.log.

### `performance-monitor.ts`
Tracking de métricas de rendimiento y queries.

### `activity-logger.ts`
Registro de actividad de usuarios para auditoría.

### `error-logger.ts`
Manejo centralizado de errores.

## Uso

```typescript
import { normalizePhone, formatCurrency, debounce } from '@/lib/ui-helpers';

// Normalizar teléfono para búsqueda
const normalized = normalizePhone('+51 999 888 777');

// Formatear moneda
const price = formatCurrency(1500, 'USD'); // "$1,500"

// Debounce para búsqueda
const debouncedSearch = debounce(handleSearch, 300);
```

## Convenciones

1. **Exportar funciones puras** - Sin efectos secundarios
2. **TypeScript estricto** - Tipos explícitos en parámetros y retornos
3. **Documentación JSDoc** - Comentarios descriptivos
4. **Tree-shakeable** - Named exports para optimización de bundle
