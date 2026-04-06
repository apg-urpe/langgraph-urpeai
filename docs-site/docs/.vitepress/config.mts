import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Monica Inteligent',
  description: 'Plataforma SaaS de Business Intelligence con IA conversacional',
  lang: 'es-ES',
  cleanUrls: true,
  ignoreDeadLinks: 'localhostLinks',

  head: [
    ['meta', { name: 'theme-color', content: '#6c63ff' }],
    ['script', {}, `
      ;(function() {
        try {
          document.documentElement.setAttribute('data-docs-mode', 'team');
          document.documentElement.classList.add('dark');
        } catch(e) {}
      })();
    `],
  ],

  vite: {
    build: {
      chunkSizeWarningLimit: 1500,
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Plataforma', link: '/overview' },
      { text: 'Comenzar', link: '/getting-started/' },
      { text: 'Producto', link: '/modules/' },
      { text: 'Canales', link: '/modules/chat/CHAT_AUDIT_REPORT' },
      { text: 'Novedades', link: '/changelog/' },
    ],

    sidebar: [
      {
        text: 'Changelog',
        collapsed: false,
        items: [
          { text: 'Todas las versiones', link: '/changelog/' },
          { text: 'v4.6.0 — Kapso + Presence + Role 3', link: '/changelog/v4.6.0' },
          { text: 'v4.5.2 — Limpieza versionado', link: '/changelog/v4.5.2' },
          { text: 'v4.5.1 — Nav plantillas + multicanal', link: '/changelog/v4.5.1' },
          { text: 'v4.5.0 — Plantillas desde Monica', link: '/changelog/v4.5.0' },
          { text: 'v4.4.0 — Monica Inteligent + Canales', link: '/changelog/v4.4.0' },
        ],
      },
      {
        text: 'Inicio',
        items: [
          { text: 'Overview del Proyecto', link: '/overview' },
        ],
      },
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Guía de Inicio', link: '/getting-started/' },
          { text: 'Setup del Entorno', link: '/getting-started/environment-setup' },
        ],
      },
      {
        text: 'Arquitectura',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/architecture/' },
          { text: 'Modelo de Datos', link: '/architecture/data-model' },
          { text: 'Contextos Empresariales', link: '/architecture/enterprise-contexts' },
          { text: 'Database Context', link: '/architecture/database-context-minimal' },
          { text: 'Monolithic Files Review', link: '/architecture/MONOLITHIC_FILES_REVIEW' },
        ],
      },
      {
        text: 'Core',
        collapsed: true,
        items: [
          { text: 'Contexto', link: '/core/contexto' },
          { text: 'Main Chat Context', link: '/core/main-chat-context' },
          { text: 'UI Dynamic Protocol v5', link: '/core/UI_DYNAMIC_PROTOCOL_v5' },
          { text: 'Unified Data Layer Plan', link: '/core/UNIFIED_DATA_LAYER_PLAN' },
        ],
      },
      {
        text: 'Módulos',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/modules/' },
          {
            text: 'Contactos',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/contacts/' },
              { text: 'Perfil de Contacto', link: '/modules/contacts/CONTACT_PROFILE_CONTEXT' },
              { text: 'Lista Square UI', link: '/modules/contacts/CONTACTS_LIST_SQUARE_UI' },
              { text: 'Super Search', link: '/modules/contacts/SUPER_SEARCH' },
              { text: 'Search Deep Context', link: '/modules/contacts/SEARCH_CONTACTS_DEEP_CONTEXT' },
              { text: 'Mejoras de Notas', link: '/modules/contacts/NOTES_IMPROVEMENT_PLAN' },
              { text: 'Pipeline Optimization', link: '/modules/contacts/PIPELINE_OPTIMIZATION_PLAN' },
            ],
          },
          {
            text: 'Chat',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/chat/' },
              { text: 'WhatsApp & Canales', link: '/modules/chat/CHAT_AUDIT_REPORT' },
            ],
          },
          {
            text: 'Monica AI',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/monica-ai/' },
              { text: 'Monica Context', link: '/modules/monica-ai/monica-context' },
              { text: 'Gemini 3 Summary', link: '/modules/monica-ai/gemini-3-summary' },
              { text: 'Full Context Plan', link: '/modules/monica-ai/MONICA_FULL_CONTEXT_PLAN' },
              { text: 'Roles Context', link: '/modules/monica-ai/MONICA_ROLES_CONTEXT' },
              { text: 'Multi Agent Plan', link: '/modules/monica-ai/MULTI_AGENT_PLAN' },
            ],
          },
          {
            text: 'Notifications',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/notifications/' },
              { text: 'Centro de Actividad', link: '/modules/notifications/CENTRO_ACTIVIDAD_CONTEXT' },
              { text: 'Notifications V2', link: '/modules/notifications/NOTIFICATIONS_V2_UPGRADE' },
            ],
          },
          {
            text: 'Tasks',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/tasks/' },
              { text: 'Activity Logging Plan', link: '/modules/tasks/ACTIVITY_LOGGING_PLAN' },
              { text: 'Tareas V3 Plan', link: '/modules/tasks/TAREAS_V3_PLAN' },
            ],
          },
          {
            text: 'Finance',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/finance/' },
              { text: 'Cartera Module Plan', link: '/modules/finance/CARTERA_MODULE_PLAN' },
              { text: 'Invoicing System Plan', link: '/modules/finance/INVOICING_SYSTEM_PLAN' },
            ],
          },
          {
            text: 'Gamificación',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/gamification/' },
              { text: 'Gamification Context', link: '/modules/gamification/GAMIFICATION_CONTEXT' },
              { text: 'Gamification Update Plan', link: '/modules/gamification/GAMIFICATION_UPDATE_PLAN' },
            ],
          },
          {
            text: 'Team',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/team/' },
              { text: 'Invitations V2', link: '/modules/team/INVITATIONS_V2' },
              { text: 'Magic Link Invitations', link: '/modules/team/MAGIC_LINK_INVITATIONS' },
            ],
          },
          {
            text: 'Marketing',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/marketing/' },
              { text: 'Email Marketing UX Plan', link: '/modules/marketing/EMAIL_MARKETING_UX_PLAN' },
            ],
          },
          {
            text: 'Marketing Audience Filters',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/modules/marketing-audience-filters/' },
            ],
          },
          { text: 'Calendar', link: '/modules/calendar/' },
          { text: 'Dashboard', link: '/modules/dashboard/' },
          { text: 'Artifacts', link: '/modules/artifacts/' },
          { text: 'Changelog', link: '/modules/changelog/' },
          { text: 'Deep Research', link: '/modules/deep-research/' },
          { text: 'Email Intelligence', link: '/modules/email-intelligence/' },
          { text: 'Engagement', link: '/modules/engagement/' },
          { text: 'Funnel', link: '/modules/funnel/' },
          { text: 'Lab Agent', link: '/modules/lab-agent/' },
          { text: 'Mentions', link: '/modules/mentions/' },
          { text: 'Multimedia', link: '/modules/multimedia/' },
          { text: 'Training', link: '/modules/training/' },
        ],
      },
      {
        text: 'API',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/api/' },
          { text: 'Alerts API', link: '/api/alerts-api' },
          { text: 'Chat API', link: '/api/chat-api' },
        ],
      },
      {
        text: 'Integraciones',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/integrations/' },
          { text: 'Supabase', link: '/integrations/supabase' },
          { text: 'Gemini AI', link: '/integrations/gemini' },
          { text: 'Nylas', link: '/integrations/nylas' },
          { text: 'OpenRouter Fallback', link: '/integrations/openrouter-fallback' },
          { text: 'MCP Tools', link: '/integrations/mcp-tools' },
        ],
      },
      {
        text: 'Technical',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/technical/' },
          { text: 'Anti Error Architecture', link: '/technical/ANTI_ERROR_ARCHITECTURE' },
          { text: 'React Best Practices', link: '/technical/REACT_BEST_PRACTICES' },
          { text: 'Storage System', link: '/technical/storage-system' },
          { text: 'Version Update Context', link: '/technical/VERSION_UPDATE_CONTEXT' },
          {
            text: 'Performance',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/technical/performance/' },
              { text: 'Strategy', link: '/technical/PERFORMANCE_STRATEGY' },
              { text: 'Audit', link: '/technical/PERFORMANCE_AUDIT' },
              { text: 'Audit 2026-01-20', link: '/technical/PERFORMANCE_AUDIT_2026-01-20' },
              { text: 'Optimization Context', link: '/technical/performance/PERFORMANCE_OPTIMIZATION_CONTEXT' },
            ],
          },
          {
            text: 'Observability',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/technical/observability/' },
              { text: 'System', link: '/technical/observability/OBSERVABILITY_SYSTEM' },
              { text: 'Roadmap', link: '/technical/observability/OBSERVABILITY_ROADMAP' },
              { text: 'Monica Observability', link: '/technical/observability/MONICA_OBSERVABILITY_CONTEXT' },
            ],
          },
          {
            text: 'Security',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/technical/security/' },
              { text: 'Security & Observability', link: '/technical/security/SECURITY_OBSERVABILITY' },
              { text: 'Multi-Tenant Audit', link: '/technical/security/MULTI_TENANT_SECURITY_AUDIT' },
            ],
          },
        ],
      },
      {
        text: 'Mobile',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/mobile/' },
          { text: 'UX Context', link: '/mobile/MOBILE_UX_CONTEXT' },
          { text: 'Navigation Plan', link: '/mobile/MOBILE_NAVIGATION_IMPROVEMENT_PLAN' },
          { text: 'Contact Detail', link: '/mobile/MOBILE_CONTACT_DETAIL_CONTEXT' },
          { text: 'Current State', link: '/mobile/MOBILE_VIEW_CURRENT_STATE' },
          { text: 'Notifications', link: '/mobile/NOTIFICATIONS_MOBILE_CONTEXT' },
        ],
      },
      {
        text: 'Contributing',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/contributing/' },
          { text: 'Code Style', link: '/contributing/code-style' },
          { text: 'Documentation Guide', link: '/contributing/documentation-guide' },
        ],
      },
      {
        text: 'Referencia',
        collapsed: true,
        items: [
          { text: 'Agent Tools Best Practices', link: '/reference/AGENT_TOOLS_BEST_PRACTICES' },
          { text: 'Artifacts Monica Integration', link: '/reference/ARTIFACTS_MONICA_INTEGRATION' },
          { text: 'Chat System Audit', link: '/reference/CHAT_SYSTEM_AUDIT' },
          { text: 'Marketing Filters Doc', link: '/reference/MARKETING_FILTERS_DOC' },
          { text: 'MCP Tools Migration Plan', link: '/reference/MCP_TOOLS_MIGRATION_PLAN' },
          { text: 'Monica Chat Context', link: '/reference/MONICA_CHAT_CONTEXT' },
          { text: 'Multi Session Chat Plan', link: '/reference/MULTI_SESSION_CHAT_PLAN' },
          { text: 'Refactor Chat Tools Plan', link: '/reference/REFACTOR_CHAT_TOOLS_PLAN' },
          { text: 'Testing Results Feb 13', link: '/reference/TESTING_RESULTS_FEB13' },
          { text: 'Tools Refactoring Proposal', link: '/reference/TOOLS_REFACTORING_PROPOSAL' },
        ],
      },
    ],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: 'Buscar',
            buttonAriaLabel: 'Buscar',
          },
          modal: {
            displayDetails: 'Ver detalles',
            noResultsText: 'Sin resultados para',
            resetButtonTitle: 'Limpiar',
            backButtonTitle: 'Volver',
            footer: {
              selectText: 'Seleccionar',
              selectKeyAriaLabel: 'enter',
              navigateText: 'Navegar',
              navigateUpKeyAriaLabel: 'arriba',
              navigateDownKeyAriaLabel: 'abajo',
              closeText: 'Cerrar',
              closeKeyAriaLabel: 'escape',
            },
          },
        },
      },
    },

    outline: {
      level: [2, 3],
      label: 'En esta página',
    },

    docFooter: {
      prev: 'Anterior',
      next: 'Siguiente',
    },

    lastUpdated: {
      text: 'Última actualización',
    },

    editLink: {
      pattern: 'https://github.com/durquijop/Chat-Urpe-AI-LAB-1.1/edit/main/docs-site/docs/:path',
      text: 'Editar esta página en GitHub',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/durquijop/Chat-Urpe-AI-LAB-1.1' },
    ],
  },
});
