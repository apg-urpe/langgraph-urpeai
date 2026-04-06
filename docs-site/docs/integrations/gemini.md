---
title: "Gemini AI — Motor de Monica"
---

> La inteligencia artificial detras de Monica Inteligent

---

## Que es Gemini

Gemini es el modelo de inteligencia artificial de Google que potencia a Monica. Es el cerebro que permite que Monica entienda tus preguntas, analice documentos, ejecute herramientas y genere respuestas inteligentes.

---

## Capacidades

### Conversacion Natural

Monica entiende y responde en espanol e ingles de forma natural. Puedes preguntarle sobre tus datos de negocio como le hablarias a un colega:

- *"Cuantos contactos nuevos tuvimos esta semana?"*
- *"Dame un resumen del rendimiento del equipo de ventas"*
- *"Busca todos los leads calificados que no tienen cita agendada"*

### Function Calling (Herramientas)

Monica no solo responde — puede ejecutar acciones. Tiene acceso a 20+ herramientas que le permiten:

| Capacidad | Ejemplo |
|-----------|---------|
| **Buscar contactos** | "Busca a Maria Garcia" → consulta el CRM |
| **Ver metricas** | "Como va el pipeline?" → accede al dashboard |
| **Crear notas** | "Agrega una nota al contacto" → escribe en el CRM |
| **Analizar datos** | "Cuales son mis mejores leads?" → calcula lead scoring |

### Analisis Multimedia

Monica puede analizar archivos que le envies:

| Tipo | Que puede hacer |
|------|-----------------|
| **Imagenes** | Describir contenido, extraer texto (OCR), analizar graficos |
| **PDFs** | Resumir documentos, extraer datos, responder preguntas sobre el contenido |
| **Audio** | Transcribir conversaciones, analizar tono y sentimiento |
| **Video** | Transcribir, describir escenas relevantes |

### Streaming

Las respuestas de Monica aparecen en tiempo real, caracter por caracter. No tienes que esperar a que termine de pensar para empezar a leer.

---

## Modelo en uso

| Propiedad | Valor |
|-----------|-------|
| **Modelo** | Gemini 3 Flash |
| **Enfoque** | Rapido, eficiente, optimizado para function calling |
| **Idiomas** | Espanol e ingles nativos |
| **Multimodal** | Texto, imagenes, audio, video, PDF |

---

## Alta Disponibilidad

Monica Inteligent cuenta con un [sistema de respaldo](/integrations/openrouter-fallback) que activa automaticamente un proveedor alternativo si Gemini tiene problemas de disponibilidad. Tu equipo no nota la diferencia.

---

## Para el equipo tecnico

::: tip Contexto tecnico
Usamos Gemini 3 Flash via Google AI SDK con Vercel AI SDK para streaming. El temperature es 0.7, maxOutputTokens 2048, thinkingLevel medium. El function calling usa el formato nativo de Gemini con schema JSON. Mas detalles en los [docs de Monica AI](/modules/monica-ai/).
:::
