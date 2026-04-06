---
title: "OpenRouter — Sistema de Respaldo"
---

> Alta disponibilidad para Monica IA

---

## Que es OpenRouter

OpenRouter es un servicio que proporciona acceso a multiples modelos de inteligencia artificial. En Monica Inteligent lo usamos como **sistema de respaldo automatico** — si el servicio principal de Gemini tiene problemas, OpenRouter toma el relevo de forma transparente.

---

## Como funciona

```
Tu pregunta a Monica
        ↓
   Intento 1: Gemini AI (servicio principal)
        ↓
   Si falla →  Intento 2: OpenRouter (respaldo)
        ↓
   Monica responde normalmente
```

El cambio es automatico y transparente. Tu equipo no nota la diferencia — Monica sigue respondiendo con la misma calidad.

---

## Beneficios

| Beneficio | Descripcion |
|-----------|-------------|
| **Alta disponibilidad** | Si Gemini tiene problemas, el servicio sigue funcionando |
| **Mismo modelo** | OpenRouter puede usar modelos equivalentes de Google |
| **Automatico** | No requiere intervencion manual — el sistema decide |
| **Transparente** | Tu equipo no nota el cambio de proveedor |
| **Redundancia** | Dos proveedores diferentes aumentan la confiabilidad |

---

## Cuando se activa

El respaldo se activa automaticamente cuando:
- Gemini API no responde en tiempo esperado
- Gemini retorna un error de servicio
- Hay problemas de conectividad con Google

En condiciones normales, el 100% del trafico va por Gemini (mas rapido y economico). OpenRouter solo entra en accion cuando es necesario.

---

## Para el equipo tecnico

::: tip Contexto tecnico
OpenRouter se configura con una API Key propia. El fallback esta implementado en la capa de API con retry automatico. El modelo de respaldo es `google/gemini-flash-1.5` que es equivalente al modelo principal. Mas detalles en la [guia de setup](/getting-started/environment-setup).
:::
