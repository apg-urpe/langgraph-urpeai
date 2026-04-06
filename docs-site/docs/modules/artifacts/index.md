---
title: "Sistema de Artefactos"
---

# Artefactos

> Documentos, visualizaciones y aplicaciones generadas por Monica AI

---

## Proposito

El sistema de artefactos permite a Monica AI generar contenido interactivo que se muestra en un panel dedicado junto al chat. Los usuarios pueden editar, versionar, guardar, compartir y organizar estos artefactos como una biblioteca personal de conocimiento.

---

## Tipos de Artefactos

| Tipo | Descripcion |
|------|-------------|
| HTML | Aplicaciones y paginas interactivas |
| Markdown | Documentos de texto con formato |
| SVG | Imagenes vectoriales y graficos |
| Mermaid | Diagramas de flujo, secuencia y otros |
| React | Componentes interactivos |
| Research | Resultados de investigaciones (Deep Research) |
| Code | Fragmentos de codigo en cualquier lenguaje |

---

## Funcionalidades del Panel de Artefactos

### Modos de Visualizacion

1. **Vista previa**: Renderiza el artefacto como se veria en un navegador
2. **Codigo**: Muestra el codigo fuente (solo lectura)
3. **Edicion**: Permite editar el contenido directamente

### Herramientas Disponibles

- Vista responsive (escritorio, tablet, movil)
- Copiar contenido al portapapeles
- Descargar como archivo
- Abrir en nueva pestana
- Indicador de estado (construyendo, listo, guardando)
- Guardar o descartar cambios

---

## Biblioteca de Artefactos

La barra lateral de artefactos funciona como una biblioteca personal donde puedes:

- **Buscar** por titulo, descripcion o etiquetas
- **Filtrar** por tipo de artefacto, favoritos o fijados
- **Agrupar** por sesion de chat actual vs sesiones anteriores
- **Acciones rapidas**: Abrir, marcar como favorito, eliminar

---

## Versionado

Cada vez que guardas cambios en un artefacto, el sistema crea automaticamente una nueva version. Esto permite:

- Ver el historial completo de cambios
- Restaurar cualquier version anterior
- Comparar versiones diferentes

---

## Compartir Artefactos

| Accion | Descripcion |
|--------|-------------|
| Hacer publico | Genera una URL publica para compartir con cualquier persona |
| Hacer privado | Revoca el acceso publico |
| Fork (copia) | Crea una copia independiente de un artefacto publico |

---

## Renderizado Inteligente de Datos

El sistema detecta automaticamente el tipo de datos y genera visualizaciones apropiadas:

| Patron de Datos | Visualizacion |
|-----------------|---------------|
| Lista de personas | Tarjetas con avatar, nombre, cargo y especialidades |
| Lista de empresas | Tarjetas con logo, industria y fundadores |
| Lista de productos | Tarjetas con precio y categoria |
| Eventos | Lista con fecha y ubicacion |
| Datos tabulares | Tabla responsiva con headers automaticos |
| Pares clave-valor | Lista organizada de informacion |

### Integracion con Deep Research

Los resultados de Monica Deep Research se procesan automaticamente como artefactos con visualizaciones enriquecidas: encabezados, tarjetas visuales por cada elemento y formato profesional.

---

## Deteccion desde el Chat

Cuando Monica genera contenido que puede ser un artefacto (HTML, SVG, codigo complejo), aparece una tarjeta en el chat con la opcion de abrirlo en el panel de artefactos para mejor visualizacion e interaccion.

---

## Documentacion Relacionada

- [Monica AI](../monica-ai/)
- [Deep Research](../deep-research/)
