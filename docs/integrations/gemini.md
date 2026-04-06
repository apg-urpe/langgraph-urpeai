# 🤖 Integración: Gemini AI

> Modelo de IA principal con Function Calling

---

## 🎯 Propósito

Gemini AI es el motor de inteligencia artificial de Urpe AI Lab:
- **Chat conversacional**: Respuestas naturales en español/inglés
- **Function Calling**: Ejecución de herramientas
- **Multimodal**: Análisis de imágenes y PDFs
- **Streaming**: Respuestas en tiempo real

---

## 🔧 Configuración

### Variable de Entorno
```env
GEMINI_API_KEY=AIzaSy...
```

### Obtener API Key
1. Ir a [Google AI Studio](https://aistudio.google.com)
2. Click en "Get API Key"
3. Crear nueva key o usar existente

---

## 🚀 Modelos Disponibles

| Modelo | Uso | Características |
|--------|-----|-----------------|
| `gemini-3-flash-preview` | Producción actual | Rápido, barato, function calling |
| `gemini-3-flash-preview` | Fallback | Estable, menor costo |
| `gemini-pro` | Tareas complejas | Mayor razonamiento |

---

## ⚙️ Configuración del Cliente

```typescript
// lib/ai/gemini-client.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const model = genAI.getGenerativeModel({
  model: 'gemini-3-flash-preview',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2048,
  },
  tools: toolsDefinitions,
});
```

---

## 🛠️ Function Calling

### Definición de Tool
```typescript
{
  name: 'get_contacts',
  description: 'Buscar y filtrar contactos del CRM',
  parameters: {
    type: 'object',
    properties: {
      query: { 
        type: 'string', 
        description: 'Término de búsqueda' 
      },
      limit: { 
        type: 'number', 
        description: 'Máximo de resultados' 
      }
    },
    required: ['query']
  }
}
```

### Flujo de Ejecución
```
Usuario: "¿Cuántos contactos nuevos tuve?"
    │
    ▼
Gemini: Analiza y genera function call
    │
    ▼
API: Ejecuta tool con Supabase
    │
    ▼
Gemini: Recibe resultado y genera respuesta
    │
    ▼
Usuario: "Esta semana tuviste 15 contactos nuevos..."
```

---

## 🖼️ Multimodal

### Análisis de Imágenes
```typescript
const result = await model.generateContent([
  { text: "¿Qué ves en esta imagen?" },
  { 
    inlineData: { 
      mimeType: 'image/jpeg',
      data: base64Image 
    } 
  }
]);
```

### Análisis de PDFs
```typescript
// Primero subir a Storage, luego enviar URL
const result = await model.generateContent([
  { text: "Resume este documento" },
  { fileData: { fileUri: pdfUrl, mimeType: 'application/pdf' } }
]);
```

---

## 🔄 Streaming

```typescript
const result = await model.generateContentStream(prompt);

for await (const chunk of result.stream) {
  const text = chunk.text();
  // Enviar al cliente via SSE
}
```

---

## ⚠️ Límites y Costos

| Métrica | Límite |
|---------|--------|
| RPM (requests/min) | 60 |
| TPM (tokens/min) | 1,000,000 |
| Max input tokens | 128,000 |
| Max output tokens | 8,192 |

### Estimación de Costos
- ~$0.001 por 1K tokens de entrada
- ~$0.002 por 1K tokens de salida

---

## 🐛 Debugging

### Logging de Requests
```typescript
console.log('Gemini request:', {
  model: config.model,
  promptTokens: countTokens(prompt),
  tools: tools.map(t => t.name)
});
```

### Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `INVALID_API_KEY` | Key inválida | Verificar en AI Studio |
| `RESOURCE_EXHAUSTED` | Rate limit | Implementar backoff |
| `SAFETY_BLOCKED` | Contenido bloqueado | Revisar safety settings |

---

## 📚 Documentación Relacionada

- [Monica AI](../modules/monica-ai/README.md)
- [Chat API](../api/chat-api.md)
- [Documentación Oficial](https://ai.google.dev/docs)
