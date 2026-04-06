# 🤝 Guía de Contribución

> Cómo contribuir al desarrollo de Urpe AI Lab

---

## 🚀 Inicio Rápido

### 1. Clonar y Configurar
```bash
git clone https://github.com/tonyurpe27/Chat-Urpe-AI-LAB-1.1.git
cd Chat-Urpe-AI-LAB-1.1
npm install
cp .env.example .env.local
```

### 2. Configurar Variables
Editar `.env.local` con credenciales de desarrollo.

### 3. Iniciar Desarrollo
```bash
node node_modules/next/dist/bin/next dev
```

---

## 📋 Flujo de Trabajo

### Branches
```
main          ← Producción estable
  └── develop ← Integración de features
        └── feature/xxx  ← Nueva funcionalidad
        └── fix/xxx      ← Corrección de bug
        └── refactor/xxx ← Refactorización
```

### Commits
Usar formato convencional:
```
feat: Agregar nueva funcionalidad
fix: Corregir bug en X
refactor: Mejorar estructura de Y
docs: Actualizar documentación
style: Formateo de código
```

---

## 🏗️ Estructura del Código

### Convenciones de Archivos

| Tipo | Ubicación | Nombrado |
|------|-----------|----------|
| Componente | `/components/` | `PascalCase.tsx` |
| Hook | `/hooks/` | `useCamelCase.ts` |
| Store | `/store/` | `camelCaseStore.ts` |
| Tipo | `/types/` | `camelCase.ts` |
| Utilidad | `/lib/` | `camelCase.ts` |

### Componentes
```typescript
// Estructura típica
import { ... } from 'react';
import { ... } from '@/store/...';

interface ComponentProps {
  // Props tipadas
}

export function Component({ prop }: ComponentProps) {
  // Hooks primero
  const state = useStore();
  
  // Handlers
  const handleClick = () => {};
  
  // Render
  return <div>...</div>;
}
```

---

## 📝 Documentación

### Regla Principal
> Todas las carpetas deben mantener un README de documentación + lógica de negocio

### Estructura de README
```markdown
# 📦 Nombre del Módulo

> Descripción breve

---

## 🎯 Propósito
Qué hace y por qué existe.

## 🏗️ Componentes
Tabla de archivos principales.

## 💾 Modelo de Datos
Interfaces y tablas.

## 🔄 Flujo de Datos
Store y acciones.

## 📚 Documentación Relacionada
Links a docs relevantes.
```

Ver [Guía de Documentación](./documentation-guide.md)

---

## ✅ Checklist de PR

- [ ] Código sigue convenciones
- [ ] Tests pasan (si aplica)
- [ ] No hay console.logs de debug
- [ ] Documentación actualizada
- [ ] README de carpeta actualizado si es nuevo módulo
- [ ] No hay `any` evitables

---

## 🐛 Reportar Bugs

### Información Requerida
1. Descripción del problema
2. Pasos para reproducir
3. Comportamiento esperado
4. Screenshots si aplica
5. Navegador/dispositivo

---

## 💡 Proponer Features

### Proceso
1. Crear issue con template de feature
2. Discutir viabilidad
3. Diseñar solución
4. Implementar en branch
5. PR con documentación

---

## 📚 Recursos

- [Estilo de Código](./code-style.md)
- [Guía de Documentación](./documentation-guide.md)
- [Arquitectura](../architecture/README.md)
