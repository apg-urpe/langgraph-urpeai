# ✨ Módulo de Novedades (Changelog)

> Sistema de visualización de actualizaciones y mejoras de la plataforma.

---

## 🗺️ Vista General

El sistema de novedades permite comunicar a los usuarios las últimas funciones, mejoras y correcciones implementadas en Urpe AI Lab. Se basa en un archivo `CHANGELOG.md` que es parseado y presentado en una interfaz amigable.

### Ubicación Única: Centro de Actividad
Las novedades están **exclusivamente** integradas dentro del **Centro de Actividad** en el header del AdminPanel, junto con las notificaciones. Se accede mediante tabs en un solo dropdown unificado. Ver [Notificaciones](../notifications/README.md) para más detalles.

### Características Principales
- **Badge de Novedad**: Indicador visual (punto azul) cuando hay actualizaciones no vistas.
- **Interfaz Unificada**: Tab "Novedades" dentro del Centro de Actividad (`NotificationDropdown`).
- **Categorización**: Funciones Listas, Mejoras, Próximamente.
- **Persistencia**: Recuerda cuándo fue la última vez que el usuario vio las novedades (`localStorage`).

---

## 🏗️ Arquitectura

### Fuente de Datos: `CHANGELOG.md`
El sistema no utiliza base de datos. Lee directamente el archivo `/CHANGELOG.md` del directorio raíz del proyecto. Esto facilita el mantenimiento por parte de los desarrolladores.

### Estructura del Markdown
Para que el parser funcione correctamente, el archivo debe seguir una estructura específica:

```markdown
### ✅ Funciones Listas
- **Título de la función** - Descripción detallada...
- **Otra función** - Descripción...

### 🚀 Mejoras Importantes
...
```

---

## 📦 Componente UI

### Tab "Novedades" en NotificationDropdown
- **Ubicación**: `components/notifications/NotificationDropdown.tsx` - Tab dentro del Centro de Actividad.
- **Lógica**:
  - Al seleccionar el tab, carga y parsea `CHANGELOG.md`.
  - Llama a `markChangelogAsViewed()` para actualizar el timestamp.
  - Notifica al componente padre via `onChangelogViewed()` para ocultar el badge.
  - Renderiza la lista de novedades con iconos (`CheckCircle2`).

---

## 🧠 Lógica (Parser)

**Archivo**: `lib/changelogParser.ts`

### Interfaces
```typescript
interface ChangelogItem {
  title: string;
  description: string;
}
```

### Funciones Clave
- **`parseChangelog(text)`**: Convierte el texto Markdown en objetos estructurados.
- **`hasNewUpdates(timestamp)`**: Compara la fecha guardada en `localStorage` con la fecha de la última actualización hardcodeada (`LATEST_UPDATE_DATE`).
- **`markChangelogAsViewed()`**: Guarda el timestamp actual en `localStorage` (`changelog_last_viewed`).

---

## 🔄 Flujo de Actualización

1. **Desarrollador**: Actualiza `CHANGELOG.md` y la constante `LATEST_UPDATE_DATE` en `lib/changelogParser.ts`.
2. **Usuario**:
   - Carga la app → `AdminPanel` verifica `localStorage`.
   - Si `lastViewed < LATEST_UPDATE_DATE` → Muestra badge en el botón del Centro de Actividad.
3. **Interacción**:
   - Usuario clic en botón Centro de Actividad → Abre dropdown.
   - Usuario selecciona tab "Novedades" → `markChangelogAsViewed()`.
   - Badge desaparece hasta la próxima actualización de fecha.

---

## 🛠️ Guía de Mantenimiento

Para publicar una nueva novedad:

1. Editar `CHANGELOG.md`:
   ```markdown
   ### ✅ Funciones Listas
   - **Nueva Función** - Descripción para el usuario.
   ```
2. Actualizar fecha en `lib/changelogParser.ts`:
   ```typescript
   const LATEST_UPDATE_DATE = new Date('2025-01-XX').getTime();
   ```
