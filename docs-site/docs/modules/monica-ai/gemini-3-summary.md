---
title: "Gemini 3 - Resumen Técnico para Integración"
---

## Overview

Gemini 3 es la familia de modelos más inteligente de Google hasta la fecha, diseñada para dominar flujos de trabajo agentic, codificación autónoma y tareas multimodales complejas. Construida sobre una base de razonamiento de estado del arte con conocimiento actualizado a Enero 2025.

## Modelos Disponibles

| Modelo | Context Window (In/Out) | Knowledge Cutoff | Pricing (Input/Output)* |
|--------|------------------------|------------------|-------------------------|
| **gemini-3-pro-preview** | 1M / 64k | Ene 2025 | $2 / $12 (<200k tokens) $4 / $18 (>200k tokens) |
| **gemini-3-flash-preview** | 1M / 64k | Ene 2025 | $0.50 / $3 |
| **gemini-3-pro-image-preview** | 65k / 32k | Ene 2025 | $2 (Text Input) / $0.134 (Image Output)** |

*\* Pricing por 1M de tokens. **\*\* Image pricing varía por resolución.*

## Características Principales

### 1. Thinking Level (Nivel de Razonamiento)

Control granular sobre la profundidad del razonamiento interno del modelo:

- **`low`**: Minimiza latencia y costo. Ideal para instrucciones simples, chat o aplicaciones de alto throughput.
- **`high`** (default): Maximiza profundidad de razonamiento. Mayor latencia pero respuestas más cuidadosamente razonadas.
- **`medium`** (solo Flash): Nivel equilibrado para la mayoría de tareas.
- **`minimal`** (solo Flash): Coincide con "sin razonamiento" para la mayoría de consultas.

**Implementación**:
```python
config=types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_level="low")
)
```

### 2. Media Resolution

Control sobre el procesamiento visual multimodal mediante tokens máximos por imagen/frame:

| Media Type | Recommended Setting | Max Tokens | Usage Guidance |
|------------|---------------------|------------|----------------|
| **Images** | `media_resolution_high` | 1120 | Calidad máxima para análisis de imágenes |
| **PDFs** | `media_resolution_medium` | 560 | Óptimo para entendimiento de documentos |
| **Video** (General) | `media_resolution_low/medium` | 70/frame | Suficiente para acción y descripción |
| **Video** (Text-heavy) | `media_resolution_high` | 280/frame | Requerido para OCR o detalles pequeños |

**API**: Disponible en v1alpha API version.

### 3. Temperature

**Recomendación crítica**: Mantener `temperature=1.0` (default). Cambiarlo puede causar comportamiento inesperado, loops o degradación en tareas complejas de razonamiento matemático.

### 4. Thought Signatures

Firmas encriptadas del proceso de pensamiento interno que deben circularse entre llamadas API:

- **Function Calling**: Validación estricta, requiere firma obligatoriamente.
- **Text/Chat**: No estricto, pero recomendado para mantener calidad.
- **Image Generation**: Validación estricta en todas las partes.

**Nota**: Los SDKs oficiales manejan esto automáticamente.

## Capacidades Técnicas

### 1. Image Generation & Editing (Pro Image)

**Características avanzadas**:
- **Resoluciones 4K** con renderizado de texto nítido y diagramas
- **Grounded generation** usando Google Search para verificar hechos y generar basado en información real
- **Conversational editing** multi-turno via Thought Signatures

**Configuración completa**:
```python
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents="Generate an infographic of current weather in Tokyo.",
    config=types.GenerateContentConfig(
        tools=[{"google_search": {}}],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            image_size="4K"
        )
    )
)
```

### 2. Structured Outputs + Tools

**Combinación poderosa** de salidas estructuradas con herramientas integradas:

- ✅ Google Search (grounding)
- ✅ File Search  
- ✅ Code Execution
- ✅ URL Context
- ✅ Function Calling personalizado
- ❌ No combinar Function Calling con built-in tools

**Implementación**:
```python
config={
    "tools": [
        {"google_search": {}},
        {"url_context": {}}
    ],
    "response_mime_type": "application/json",
    "response_json_schema": MatchResult.model_json_schema(),
}
```

### 3. Multimodal Processing

**Soporte completo** para imágenes, PDFs, video con resolución configurable:

- **Inline data**: Para archivos <20MB totales
- **File API**: Para archivos grandes o reutilización
- **Multiple images**: Mezcla de inline data y File API en un solo request
- **Formatos soportados**: PNG, JPEG, WEBP, HEIC, HEIF
- **Límite**: 3,600 imágenes por request

## Migración desde Gemini 2.5

### Cambios Críticos:

1. **Thinking System**: 
   - Reemplazar `thinking_budget` → `thinking_level`
   - No usar ambos en el mismo request (error 400)

2. **Temperature**: 
   - Remover configuración explícita
   - Usar default 1.0 para evitar degradación

3. **PDF & Document OCR**: 
   - Default resolution cambiado
   - Testear con `media_resolution_high` para documentos densos

4. **Token Consumption**: 
   - Puede aumentar para PDFs (mayor resolución default)
   - Puede disminuir para video (mejor compresión)

5. **Image Segmentation**: 
   - No soportado en Gemini 3 Pro/Flash
   - Continuar con Gemini 2.5 Flash + thinking off

### Compatibilidad OpenAI:

- `reasoning_effort` (OAI) → `thinking_level` (Gemini)
- `medium` → `high` (mapeo importante)

## Best Practices para Prompting

### 1. Estilo de Instrucciones
- **Precisión**: Ser conciso y directo
- **Directividad**: Gemini 3 responde mejor a instrucciones claras
- **Evitar**: Prompt engineering complejo usado en modelos anteriores

### 2. Control de Output
- **Verbosidad**: Por defecto menos verboso, más eficiente
- **Estilo conversacional**: Requerir explícitamente si se necesita
- **Context management**: Colocar preguntas específicas al final del prompt

### 3. Manejo de Large Datasets
- **Anclaje**: Usar "Based on the information above..." para razonamiento basado en datos
- **Optimización**: Instrucciones específicas después del contexto de datos

## Configuración Recomendada para Urpe AI Lab

### 1. Análisis de Documentos Multimedia
```javascript
{
  model: "gemini-3-flash-preview",
  config: {
    thinkingConfig: { thinkingLevel: "medium" },
    mediaResolution: "media_resolution_high"
  }
}
```
**Uso**: Procesamiento de PDFs, imágenes con texto, documentos complejos

### 2. Chat Conversacional Rápido
```javascript
{
  model: "gemini-3-flash-preview", 
  config: {
    thinkingConfig: { thinkingLevel: "low" }
  }
}
```
**Uso**: Respuestas inmediatas, alto throughput, interacciones básicas

### 3. Generación de Contenido Complejo
```javascript
{
  model: "gemini-3-pro-preview",
  config: {
    thinkingConfig: { thinkingLevel: "high" }
  }
}
```
**Uso**: Análisis profundo, generación de informes, razonamiento complejo

### 4. Generación de Imágenes 4K
```javascript
{
  model: "gemini-3-pro-image-preview",
  config: {
    tools: [{ googleSearch: {} }],
    imageConfig: {
      aspectRatio: "16:9",
      imageSize: "4K"
    }
  }
}
```
**Uso**: Infografías, visualizaciones de datos, imágenes con texto

## Consideraciones de Costo y Performance

### Optimización de Costos
- **Gemini 3 Flash**: 4x más económico que Pro, ideal para operaciones de alto volumen
- **Media Resolution**: `high` aumenta significativamente el consumo de tokens
- **Thinking Level**: `high` aumenta latencia pero mejora calidad de razonamiento

### Estrategias de Implementación
1. **Hybrid Approach**: Usar Flash para operaciones estándar, Pro para tareas críticas
2. **Resolution Scaling**: Ajustar `media_resolution` según complejidad del documento
3. **Thinking Adaptation**: Usar `low` para chat, `medium` para análisis, `high` para investigación

## Herramientas Soportadas y Limitaciones

### ✅ Soportadas en Gemini 3
- Google Search Grounding
- File Search
- Code Execution  
- URL Context
- Function Calling (individual, no con built-in tools)
- Context Caching (mínimo 2,048 tokens)
- Batch API

### ❌ No Soportadas
- Google Maps Grounding
- Computer Use
- Image Segmentation (usar Gemini 2.5 Flash)
- Combinación de Function Calling con built-in tools

## FAQ Técnico Clave

1. **Knowledge cutoff**: Enero 2025 (usar Search Grounding para información más reciente)
2. **Free tier**: Solo disponible para `gemini-3-flash-preview`
3. **Context window**: 1M input, 64k output tokens
4. **Thought signatures**: Manejadas automáticamente por SDKs oficiales
5. **API version**: v1alpha requerido para `media_resolution`
6. **Billing Search Grounding**: Comienza Enero 5, 2026

## Implementación Práctica

### Setup Inicial
```python
from google import genai
from google.genai import types

client = genai.Client()

# Configuración base para análisis de documentos
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=["Analyze this document", image_file],
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level="medium"),
        media_resolution={"level": "media_resolution_high"}
    )
)
```

### Manejo de Thought Signatures
```python
# Los SDKs oficiales manejan esto automáticamente
# Para implementaciones personalizadas, circular las firmas:
if hasattr(response.candidates[0].content.parts[0], 'thought_signature'):
    signature = response.candidates[0].content.parts[0].thought_signature
    # Incluir en siguiente request
```

## Conclusiones para Urpe AI Lab

### Beneficios Clave
1. **Mejor comprensión multimodal**: Procesamiento superior de documentos multimedia
2. **Razonamiento avanzado**: Análisis más profundo para tareas complejas
3. **Control granular**: Balance ajustable entre costo, latencia y calidad
4. **Generación mejorada**: Imágenes 4K con texto legible y grounding

### Estrategia de Migración Recomendada
1. **Phase 1**: Implementar Gemini 3 Flash para chat y análisis básico
2. **Phase 2**: Integrar Pro para tareas críticas de razonamiento
3. **Phase 3**: Añadir Pro Image para generación de visualizaciones
4. **Optimization**: Ajustar parámetros según patrones de uso

### Impacto en Chat-Urpe-AI-LAB
- **Experiencia mejorada**: Respuestas más razonadas y precisas
- **Capacidades expandidas**: Soporte nativo para análisis de documentos complejos
- **Eficiencia de costo**: Uso estratégico de modelos según complejidad
- **Features nuevas**: Generación de imágenes 4K y visualizaciones de datos

Gemini 3 representa una evolución significativa para asistentes IA conversacionales, ofreciendo capacidades superiores que transformarán la experiencia en Urpe AI Lab.
