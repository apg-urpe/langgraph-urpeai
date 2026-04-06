# OpenRouter Fallback - Sistema de Respaldo para Monica Chat

## Descripción

OpenRouter es un servicio que proporciona acceso unificado a múltiples modelos de IA, incluyendo los modelos de Google Gemini. Se utiliza como **sistema de respaldo automático** cuando el servicio directo de Gemini falla.

## ¿Por qué usar OpenRouter como Fallback?

1. **Alta disponibilidad**: Si Gemini API tiene problemas, OpenRouter puede seguir funcionando
2. **Mismo modelo**: Puedes usar `google/gemini-flash-1.5` que es equivalente a `gemini-3-flash-preview`
3. **Sin cambios en el código**: El fallback es automático y transparente
4. **Redundancia**: Dos proveedores diferentes aumentan la confiabilidad

## Configuración

### 1. Obtener API Key de OpenRouter

1. Ve a [https://openrouter.ai/keys](https://openrouter.ai/keys)
2. Crea una cuenta o inicia sesión
3. Genera una nueva API key
4. Copia la key (formato: `sk-or-v1-...`)

### 2. Configurar Variables de Entorno

Añade a tu archivo `.env`:

```bash
# OpenRouter API (Fallback cuando Gemini falla)
OPENROUTER_API_KEY=sk-or-v1-tu-api-key-aqui
```

### 3. Verificar Configuración

El sistema detectará automáticamente si tienes OpenRouter configurado y lo usará como respaldo.

## Flujo de Funcionamiento

```
Usuario envía mensaje
         ↓
   Intenta con Gemini
         ↓
    ¿Gemini OK?
    ↙        ↘
  SÍ         NO
   ↓          ↓
Responde   ¿OpenRouter configurado?
           ↙              ↘
         SÍ               NO
          ↓                ↓
    Usa OpenRouter    Error al usuario
          ↓
      Responde
```

## Modelos Disponibles en OpenRouter

Para Monica Chat, se usa automáticamente:
- **Modelo**: `google/gemini-flash-1.5`
- **Equivalente a**: `gemini-3-flash-preview` de Google directo
- **Características**: Mismo comportamiento, mismas capacidades

### Otros modelos disponibles (opcional)

Si quieres cambiar el modelo de fallback, edita `lib/ai/config.ts`:

```typescript
export const OPENROUTER_MODEL = 'google/gemini-flash-1.5'; // Actual
// Alternativas:
// 'google/gemini-pro-1.5'  - Más potente
// 'anthropic/claude-3-5-sonnet' - Claude como alternativa
// 'openai/gpt-4-turbo' - GPT-4 como alternativa
```

## Costos

OpenRouter cobra por uso:
- **Gemini Flash 1.5**: ~$0.075 por millón de tokens input, ~$0.30 por millón output
- **Créditos iniciales**: $5 gratis al registrarte
- **Facturación**: Solo pagas lo que usas

Ver precios actualizados: [https://openrouter.ai/models](https://openrouter.ai/models)

## Logs y Monitoreo

Cuando OpenRouter se activa como fallback, verás en los logs:

```
[Chat API] Gemini failed: [error details]
[Chat API] Gemini falló. Intentando con OpenRouter fallback...
[Chat API] Stream finished successfully with OpenRouter fallback
```

## Troubleshooting

### Error: "OpenRouter fallback también falló"

**Causa**: Ambos servicios están fallando
**Solución**: 
1. Verifica que tu API key de OpenRouter sea válida
2. Revisa que tengas créditos disponibles en OpenRouter
3. Verifica la conectividad a internet

### Error: "Configura OPENROUTER_API_KEY como respaldo"

**Causa**: Gemini falló y no tienes OpenRouter configurado
**Solución**: Sigue los pasos de configuración arriba

### OpenRouter no se activa

**Causa**: La variable de entorno no está cargada
**Solución**: 
1. Verifica que `.env` tenga `OPENROUTER_API_KEY`
2. Reinicia el servidor Next.js
3. Verifica con `console.log(process.env.OPENROUTER_API_KEY)` en el código

## Seguridad

- ✅ Las API keys nunca se exponen al cliente
- ✅ Todas las llamadas son server-side
- ✅ OpenRouter cumple con GDPR y SOC 2
- ✅ Los datos no se usan para entrenar modelos

## Archivos Relacionados

- `lib/ai/config.ts` - Configuración de modelos y OpenRouter
- `app/api/chat/route.ts` - Implementación del fallback
- `.env.example` - Template de variables de entorno
- `docs/integrations/openrouter-fallback.md` - Esta documentación

## Referencias

- [OpenRouter Docs](https://openrouter.ai/docs)
- [OpenRouter API Keys](https://openrouter.ai/keys)
- [OpenRouter Models](https://openrouter.ai/models)
- [OpenRouter Pricing](https://openrouter.ai/models?order=newest)
