---
title: "Plan de Mejoras Zona de Notas y Contexto (v2.2)"
---

## 🎯 Objetivo
Transformar la sección de notas de un simple listado cronológico a un sistema de gestión de conocimiento del contacto navegable y rico en contexto.

## 🧠 Contexto del Componente
Las notas son la memoria a largo plazo de la relación con el cliente. Actualmente son bloques de texto estáticos. Necesitamos que sean:
1.  **Navegables**: Poder profundizar en una nota sin perder el flujo.
2.  **Contextuales**: Entender quién, cuándo y en qué contexto se creó.
3.  **Procesables**: Fácil edición y gestión.

## 📅 Plan de Implementación por Partes

### Part 1: Navegación y Detalle (📍 Actual - Completado)
Objetivo: Crear una experiencia de lectura inmersiva y fluida.
- [x] **Componente `NoteDetailModal`**: Vista focalizada de la nota.
- [x] **Navegación Secuencial**: Botones "Anterior" y "Siguiente" para recorrer el historial sin cerrar el modal.
- [x] **Interacción en Lista**: Las notas en la lista pasan a ser tarjetas previsualizables que abren el detalle.
- [x] **Metadata Visual**: Mejorar la visualización de autor y fecha en el detalle.

### Part 2: Riqueza de Datos y Organización (📍 Actual - Completado)
Objetivo: Estructurar la información.
- [x] **Títulos**: Soporte para títulos explícitos en las notas.
- [x] **Etiquetado (Tags)**: Implementar sistema de tags para categorizar notas (e.g., #llamada, #importante, #queja).
- [x] **Pinning**: Fijar notas importantes al principio.

### Part 3: Inteligencia y Búsqueda
Objetivo: Encontrar información rápidamente.
- [ ] **Búsqueda Local**: Filtrar notas por contenido en tiempo real.
- [ ] **Resumen AI**: Generar insights basados en las notas acumuladas.

---

## 🛠️ Especificaciones Técnicas (Part 1)

### Componente `NoteDetailModal`
- **Props**:
  - `note`: Nota activa.
  - `isOpen`: Estado de visibilidad.
  - `onClose`: Cierre.
  - `onNext` / `onPrev`: Navegación.
  - `hasNext` / `hasPrev`: Estado de botones de navegación.
  - `onEdit` / `onDelete`: Acciones.

### Modificaciones en `ContactNotes`
- Estado `selectedNote`: Controla qué nota se está viendo.
- Lógica de navegación: Calcular índices basándose en el array `notes` ordenado.
- UI Update: Las tarjetas de notas ahora tienen hover effect y cursor pointer para indicar expansibilidad.
