# 🤖 Agent Configuration Module

Sistema de configuración de agentes IA para empresas.

## Descripción

Este módulo permite a los usuarios con rol 1 (Dev) y rol 2 (Admin) configurar los agentes IA que procesan conversaciones y mensajes en n8n. Incluye:

- **Lista de agentes** con vista previa de configuración
- **Editor de campos** con modo vista/edición similar a ArtifactPanel
- **Historial de cambios** tipo Git para cada campo
- **Gestión de roles** de agentes (solo rol 1)

## Estructura de Archivos

```
components/admin/agents/
├── README.md                 # Esta documentación
├── index.ts                  # Exports del módulo
├── AgentsSection.tsx         # Contenedor principal (integrado en SettingsView)
├── AgentsList.tsx            # Lista de agentes con cards
├── AgentConfigPanel.tsx      # Panel de configuración con secciones colapsables
├── AgentFieldCard.tsx        # Tarjeta de campo con preview
├── AgentFieldEditor.tsx      # Modal full-screen para editar (estilo ArtifactPanel)
├── AgentHistoryViewer.tsx    # Vista de historial de cambios
├── AgentRolesSection.tsx     # CRUD de roles (solo rol 1)
└── CreateAgentModal.tsx      # Modal para crear nuevo agente
```

## Permisos

| Acción | Rol 1 (Dev) | Rol 2 (Admin) | Rol 3 (User) |
|--------|-------------|---------------|--------------|
| Ver agentes | ✅ | ✅ | ❌ |
| Editar agentes | ✅ | ✅ | ❌ |
| Ver campos avanzados (LLM, MCP) | ✅ | ❌ | ❌ |
| Editar roles | ✅ | ❌ | ❌ |

## Campos por Sección

### Identidad
- `nombre_agente` - Nombre identificador
- `idioma` - es/en/pt
- `url_imagen_agente` - Avatar del agente

### Comportamiento
- `comportamiento` - Cómo debe actuar
- `uso_de_emojis` - Políticas de emojis
- `formato_respuesta` - Formato de mensajes

### Instrucciones
- `instrucciones` - Instrucciones principales
- `prompt_personalizado` - Prompt adicional
- `areas_de_expertise` - Áreas de conocimiento

### Restricciones
- `restricciones` - Qué NO debe hacer

### Avanzado (Solo Rol 1)
- `llm` - Modelo LLM a usar
- `mcp_url` - URL del servidor MCP
- `manejo_herramientas` - Config de tools
- `instrucciones_multimedia` - Manejo de media
- `metadata_contacto` - JSON adicional

### Campos Ocultos (No se usan)
- `rol` - Deprecado
- `instrucciones_mensajes` - Deprecado
- `url_videos` - Deprecado

## Store

`store/agentsStore.ts` maneja:

```typescript
// State
agents: Agent[]
selectedAgentId: number | null
roles: AgentRole[]
history: AgentHistoryEntry[]
unsavedChanges: Partial<Agent> | null

// Actions
fetchAgents(enterpriseId, forceRefresh?)
selectAgent(agentId)
createAgent(payload)
updateAgent(agentId, updates, commitMessage?)
deleteAgent(agentId)
fetchRoles(forceRefresh?)
createRole(payload)
updateRole(roleId, updates)
deleteRole(roleId)
fetchHistory(agentId, campo?)
restoreFromHistory(historialId, userId?)
```

## Base de Datos

### Tablas
- `wp_agentes` - Configuración de agentes
- `wp_agente_roles` - Roles personalizados
- `wp_agentes_historial` - Historial de cambios (nueva)

### Script SQL
Ejecutar `scripts/AGENT_AUDIT_SCHEMA.sql` para crear:
- Tabla `wp_agentes_historial`
- Trigger `trg_agentes_historial` 
- Funciones `fn_get_agent_history` y `fn_restore_agent_field`
- Políticas RLS

## Uso

La sección se integra automáticamente en **Configuración > Agentes IA**.

```typescript
// En SettingsView.tsx
import { AgentsSection } from './agents';

// Renderizado condicional
{activeSection === 'agentes' && <AgentsSection />}
```

## Flujo de Usuario

1. Usuario va a **Configuración** > tab **Agentes IA**
2. Ve lista de agentes de su empresa
3. Selecciona un agente → abre panel de configuración
4. Expande secciones para ver campos
5. Click en campo de texto → abre editor full-screen
6. Edita contenido con preview markdown
7. Guarda cambios (se registra en historial automáticamente)
8. Puede ver historial y restaurar versiones anteriores

## Historial (Git-like)

El sistema registra automáticamente cada cambio mediante un trigger de PostgreSQL:

- **Campo modificado**
- **Valor anterior**
- **Valor nuevo**
- **Usuario que hizo el cambio**
- **Timestamp**
- **Mensaje de commit** (opcional)

Los usuarios pueden:
- Ver todo el historial de un agente
- Filtrar por campo específico
- Restaurar valores anteriores con un click

## Integración con n8n

Los agentes configurados aquí son utilizados por workflows de n8n para:
- Procesar conversaciones de WhatsApp
- Generar respuestas automáticas
- Clasificar y enrutar mensajes
- Ejecutar herramientas (tools)

La configuración se lee desde `wp_agentes` filtrada por `empresa_id`.
