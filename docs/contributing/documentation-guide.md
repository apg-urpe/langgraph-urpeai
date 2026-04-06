# 📖 Guía de Documentación

> Cómo documentar módulos y funcionalidades en Urpe AI Lab

---

## 🎯 Principio Fundamental

> **Todas las carpetas deben mantener un README de documentación + lógica de negocio**

---

## 📁 Estructura de Documentación

```
docs/
├── README.md                    # Índice principal
├── getting-started/             # Instalación y configuración
├── architecture/                # Arquitectura general
├── modules/                     # Documentación por módulo
│   └── [módulo]/
│       ├── README.md            # Lógica de negocio principal
│       └── [FEATURE]_CONTEXT.md # Contexto específico
├── api/                         # Endpoints
├── integrations/                # Servicios externos
├── mobile/                      # UX mobile
├── technical/                   # Observabilidad, seguridad, performance
└── contributing/                # Guías de contribución
```

---

## 📝 Plantilla de README de Módulo

```markdown
# 📦 Módulo: [Nombre]

> Descripción breve en una línea

---

## 🎯 Propósito

Explicación de qué hace el módulo y por qué existe.
- Funcionalidad 1
- Funcionalidad 2
- Funcionalidad 3

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `Component.tsx` | `/components/` | Descripción |

---

## 💾 Modelo de Datos

### Tabla Principal
\`\`\`typescript
interface Entity {
  id: number;
  // campos...
}
\`\`\`

---

## 🔄 Flujo de Datos

### Store: `entityStore.ts`
\`\`\`typescript
// Estado
entities: Entity[];

// Acciones
fetchEntities(params)
createEntity(data)
\`\`\`

---

## 📚 Documentación Relacionada

- [Link a doc relacionada](./FILE.md)
```

---

## ✍️ Convenciones de Escritura

### Títulos
- Usar emojis para identificación visual rápida
- Formato: `# 📦 Módulo: Nombre`

### Tablas
```markdown
| Columna 1 | Columna 2 | Columna 3 |
|-----------|-----------|-----------|
| Valor | Valor | Valor |
```

### Código
- Siempre especificar lenguaje
- Usar `typescript` para tipos y código
- Usar `sql` para queries
- Usar `bash` para comandos

### Links
```markdown
// Relativos dentro de docs
[Arquitectura](../architecture/README.md)

// Absolutos para archivos de código
`/components/admin/TasksView.tsx`
```

---

## 📋 Tipos de Documentos

### README.md
- Índice y visión general
- Siempre presente en cada carpeta
- Links a documentos detallados

### *_CONTEXT.md
- Contexto detallado de una feature
- Arquitectura de componentes
- Flujos de datos

### *_PLAN.md
- Planes de implementación
- Roadmaps
- Diseños técnicos

---

## 🔄 Cuándo Actualizar

### Crear Documentación
- Nuevo módulo
- Nueva feature significativa
- Nueva integración

### Actualizar Documentación
- Cambio en modelo de datos
- Cambio en arquitectura
- Nuevos componentes principales

### Archivar Documentación
- Feature deprecada (mover a `/docs/archive/`)
- Integración removida

---

## ✅ Checklist de Documentación

- [ ] README.md existe en la carpeta
- [ ] Propósito claramente definido
- [ ] Componentes listados con ubicación
- [ ] Modelo de datos documentado
- [ ] Flujo de datos explicado
- [ ] Links a docs relacionadas
- [ ] Sin información desactualizada
