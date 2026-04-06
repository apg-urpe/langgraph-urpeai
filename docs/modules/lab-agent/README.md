# 🧪 Monica Lab Mode (Experimental)

> Entorno de experimentación con modelos avanzados de IA para casos de uso especializados

---

## 🎯 Propósito

El Lab Mode es un espacio experimental dentro de Monica AI que permite a usuarios avanzados acceder a modelos de IA más potentes (como Claude Opus) para tareas complejas de investigación, análisis profundo y generación de código.

---

## 🏗️ Arquitectura Planeada

### Componentes

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| `LabChat` | `components/lab/` | En planificación |
| `LabSessionManager` | `components/lab/` | En planificación |
| API Route | `app/api/lab/route.ts` | En planificación |

### Modelos Soportados

| Modelo | Versión | Uso |
|--------|---------|-----|
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | Coding avanzado, agents |

---

## ⚙️ Configuración Técnica

### Rate Limits (Planificado)
```typescript
const RATE_LIMITS = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MAX_REQUESTS_PER_HOUR: 50,
  MAX_TOKENS_PER_REQUEST: 4096,
  MAX_CODE_LENGTH: 10000,
  SANDBOX_TIMEOUT_MS: 30000,
};
```

### Features UI Planificadas
1. **Botón de salida**: X en header para desactivar isLabMode
2. **Historial de sesiones**: Sidebar lateral con todas las sesiones Lab
3. **Feedback visual detallado**:
   - Indicador de progreso con pasos (Generar → Ejecutar → Resultado)
   - Mensajes descriptivos de cada paso
   - Animaciones de loading

---

## 🔄 Flujo de Datos (Propuesto)

```
Usuario activa Lab Mode
         │
         ▼
+──────────────────+
│  LabChat View    │
│  + Historial     │
+──────────────────+
         │
         ▼
+──────────────────+
│  POST /api/lab   │
│  Claude Opus 4.5 │
+──────────────────+
         │
         ▼
+──────────────────+
│  Ejecución       │
│  Sandbox E2B     │
+──────────────────+
         │
         ▼
+──────────────────+
│  Resultados      │
│  + Artifacts     │
+──────────────────+
```

---

## 🛡️ Restricciones de Seguridad

### Rate Limiting
- Máximo 10 requests/minuto
- Máximo 50 requests/hora
- Timeout de sandbox: 30 segundos

### Acceso
- Disponible solo para usuarios con rol apropiado
- Requiere aceptación de términos de uso experimental
- Costos más altos - uso consciente

---

## 💰 Costos

| Modelo | Input | Output |
|--------|-------|--------|
| Claude Opus 4.5 | $5/million tokens | $25/million tokens |

---

## 📋 Roadmap

- [ ] Implementar componente LabChat
- [ ] Crear API route con rate limiting
- [ ] Integrar con Claude Opus API
- [ ] Agregar sandbox E2B para ejecución de código
- [ ] Sistema de historial de sesiones
- [ ] UI de feedback visual progresivo
- [ ] Botón toggle en interfaz principal

---

## 🔗 Documentación Relacionada

- [Monica AI](../monica-ai/README.md)
- [Deep Research](../deep-research/README.md)
- [Gamificación](../gamification/README.md)

---

## 📝 Notas

> **Estado actual**: Este módulo está en fase de planificación. La funcionalidad base de Monica AI opera con Gemini models en el módulo principal.

