---
title: "Guia para el Equipo de Desarrollo"
---

> Convenciones y flujo de trabajo del equipo tecnico de Urpe AI Lab

::: tip Nota
Esta seccion es para el equipo interno de desarrollo de Urpe AI Lab. Si eres usuario de la plataforma, no necesitas esta informacion.
:::

---

## Flujo de Trabajo

### Branches

```
main          ← Produccion estable
  └── develop ← Integracion de features
        └── feature/xxx  ← Nueva funcionalidad
        └── fix/xxx      ← Correccion de bug
        └── refactor/xxx ← Refactorizacion
```

### Commits

Usar formato convencional:
```
feat: Agregar nueva funcionalidad
fix: Corregir bug en X
refactor: Mejorar estructura de Y
docs: Actualizar documentacion
style: Formateo de codigo
```

---

## Convenciones de Codigo

| Tipo | Ubicacion | Nombrado |
|------|-----------|----------|
| Componente | `/components/` | `PascalCase.tsx` |
| Hook | `/hooks/` | `useCamelCase.ts` |
| Store | `/store/` | `camelCaseStore.ts` |
| Tipo | `/types/` | `camelCase.ts` |
| Utilidad | `/lib/` | `camelCase.ts` |

---

## Checklist de PR

- [ ] Codigo sigue las convenciones del proyecto
- [ ] No hay console.logs de debug
- [ ] Documentacion actualizada si aplica
- [ ] No hay `any` evitables en TypeScript
- [ ] Tests pasan (si aplica)

---

## Reportar Problemas

Al reportar un bug, incluye:
1. Descripcion del problema
2. Pasos para reproducir
3. Comportamiento esperado vs actual
4. Screenshots si aplica
5. Navegador/dispositivo

---

## Recursos del Equipo

- [Estilo de Codigo](./code-style.md) — Convenciones detalladas
- [Guia de Documentacion](./documentation-guide.md) — Como documentar modulos
- [Arquitectura](/architecture/) — Como esta construida la plataforma
- [Setup de Desarrollo](/getting-started/environment-setup) — Configurar entorno local
