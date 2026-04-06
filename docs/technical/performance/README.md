# ⚡ Performance

> Optimización y monitoreo del rendimiento

---

## 🎯 Objetivos

| Métrica | Target |
|---------|--------|
| Time to First Byte (TTFB) | <200ms |
| First Contentful Paint (FCP) | <1.5s |
| Largest Contentful Paint (LCP) | <2.5s |
| Chat Response Time | <500ms |
| Error Rate | <2% |

---

## 🔧 Optimizaciones Implementadas

### Caching
```typescript
// Cache de 5 minutos para datos frecuentes
const CACHE_TTL = 5 * 60 * 1000;

// Invalidación selectiva
invalidateCache(['contacts', 'dashboard']);
```

### Lazy Loading
```typescript
// Componentes cargados bajo demanda
const LazyComponent = dynamic(() => import('./Component'), {
  loading: () => <Skeleton />
});
```

### Memoización
```typescript
// Evitar re-renders innecesarios
const MemoizedList = React.memo(ContactList);

// Callbacks estables
const handleClick = useCallback(() => {...}, [deps]);
```

### Code Splitting
- Chunks automáticos por ruta (Next.js)
- Vendors separados
- Dynamic imports para módulos pesados

---

## 📊 Monitoreo

### Web Vitals
```typescript
// components/WebVitalsReporter.tsx
export function reportWebVitals(metric: Metric) {
  console.log(metric.name, metric.value);
  // Enviar a analytics
}
```

### Performance Monitor
```typescript
// lib/performance-monitor.ts
trackMetric('contacts_fetch_time', duration);
trackMetric('chat_response_time', duration);
```

---

## 🗄️ Base de Datos

### Índices Optimizados
```sql
-- Lookup rápido por empresa
CREATE INDEX idx_contactos_empresa ON wp_contactos(empresa_id);

-- Búsqueda por teléfono
CREATE INDEX idx_contactos_telefono ON wp_contactos(telefono);

-- Ordenamiento por fecha
CREATE INDEX idx_contactos_created ON wp_contactos(created_at DESC);
```

### Queries Optimizadas
- Usar `.select()` específico (no `*`)
- Limitar resultados con `.limit()`
- Paginar con `.range()`

---

## 🖼️ Imágenes

### Next.js Image
```tsx
import Image from 'next/image';

<Image 
  src={url} 
  width={100} 
  height={100}
  loading="lazy"
  placeholder="blur"
/>
```

### Optimizaciones
- WebP automático
- Responsive sizes
- Lazy loading nativo

---

## 📱 Mobile

### Optimizaciones Específicas
- Reduce motion para animaciones
- Touch events optimizados
- Viewport units para layout
- Service worker para offline

---

## 📚 Documentación Relacionada

- [Performance Optimization Context](./PERFORMANCE_OPTIMIZATION_CONTEXT.md)
- [Arquitectura](../../architecture/README.md)
