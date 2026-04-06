<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const currentPath = computed(() => route.path)

const sections = [
  {
    id: 'discover',
    icon: '\u{1F3AF}',
    label: 'Descubre',
    accent: '#22d3ee',
    links: [
      { text: 'Vision General', link: '/overview' },
      { text: 'Primeros Pasos', link: '/getting-started/' },
    ],
  },
  {
    id: 'agents',
    icon: '\u{1F916}',
    label: 'Agentes IA',
    accent: '#a78bfa',
    links: [
      { text: 'Chat Inteligente', link: '/modules/chat/' },
      { text: 'Monica IA', link: '/modules/monica-ai/' },
      { text: 'Roles y Personalizacion', link: '/modules/monica-ai/MONICA_ROLES_CONTEXT' },
      { text: 'Contexto de Monica', link: '/modules/monica-ai/monica-context' },
      { text: 'Artefactos', link: '/modules/artifacts/' },
    ],
  },
  {
    id: 'channels',
    icon: '\u{1F4F1}',
    label: 'Canales',
    accent: '#f0abfc',
    links: [
      { text: 'WhatsApp & Canales', link: '/modules/chat/CHAT_AUDIT_REPORT' },
      { text: 'Email Intelligence', link: '/modules/email-intelligence/' },
      { text: 'Notificaciones', link: '/modules/notifications/' },
      { text: 'Menciones', link: '/modules/mentions/' },
    ],
  },
  {
    id: 'crm',
    icon: '\u{1F465}',
    label: 'CRM & Ventas',
    accent: '#34d399',
    links: [
      { text: 'Gestion de Contactos', link: '/modules/contacts/' },
      { text: 'Perfil de Contacto', link: '/modules/contacts/CONTACT_PROFILE_CONTEXT' },
      { text: 'Busqueda Avanzada', link: '/modules/contacts/SUPER_SEARCH' },
      { text: 'Pipeline de Ventas', link: '/modules/funnel/' },
      { text: 'Engagement', link: '/modules/engagement/' },
    ],
  },
  {
    id: 'marketing',
    icon: '\u{1F4CA}',
    label: 'Marketing & Analytics',
    accent: '#60a5fa',
    links: [
      { text: 'Dashboard', link: '/modules/dashboard/' },
      { text: 'Email Marketing', link: '/modules/marketing/' },
      { text: 'Audiencias', link: '/modules/marketing-audience-filters/' },
      { text: 'Deep Research', link: '/modules/deep-research/' },
    ],
  },
  {
    id: 'productivity',
    icon: '\u{1F3C6}',
    label: 'Productividad',
    accent: '#2dd4bf',
    links: [
      { text: 'Equipo', link: '/modules/team/' },
      { text: 'Tareas', link: '/modules/tasks/' },
      { text: 'Gamificacion', link: '/modules/gamification/' },
      { text: 'Calendario', link: '/modules/calendar/' },
      { text: 'Training', link: '/modules/training/' },
    ],
  },
  {
    id: 'finance',
    icon: '\u{1F4B0}',
    label: 'Finanzas',
    accent: '#fbbf24',
    links: [
      { text: 'Cartera de Clientes', link: '/modules/finance/' },
      { text: 'Facturacion', link: '/modules/finance/INVOICING_SYSTEM_PLAN' },
    ],
  },
  {
    id: 'tech',
    icon: '\u{26A1}',
    label: 'Zona Tecnica',
    accent: '#71717a',
    defaultCollapsed: true,
    links: [
      { text: 'Arquitectura', link: '/architecture/' },
      { text: 'Core', link: '/core/contexto' },
      { text: 'API', link: '/api/' },
      { text: 'Integraciones', link: '/integrations/' },
      { text: 'Performance', link: '/technical/performance/' },
      { text: 'Seguridad', link: '/technical/security/' },
      { text: 'Observabilidad', link: '/technical/observability/' },
      { text: 'Multimedia', link: '/modules/multimedia/' },
      { text: 'Experiencia Movil', link: '/mobile/' },
      { text: 'Guia del Equipo Dev', link: '/contributing/' },
    ],
  },
]

const expanded = ref(new Set())

function findSectionForPath(path) {
  for (const section of sections) {
    for (const link of section.links) {
      const n = link.link.replace(/\/$/, '')
      const p = path.replace(/\/$/, '')
      if (p === n || p.startsWith(n + '/')) return section.id
    }
  }
  return 'discover'
}

function toggle(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function isExpanded(id) { return expanded.value.has(id) }
function isActive(link) {
  return currentPath.value.replace(/\/$/, '') === link.replace(/\/$/, '')
}
function isInSection(section) { return section.links.some(l => isActive(l.link)) }

onMounted(() => {
  const active = findSectionForPath(currentPath.value)
  expanded.value = new Set([active])
})

watch(currentPath, (path) => {
  const active = findSectionForPath(path)
  if (!expanded.value.has(active)) {
    const next = new Set(expanded.value)
    next.add(active)
    expanded.value = next
  }
})
</script>

<template>
  <div class="mn-nav">
    <div class="mn-header">
      <span class="mn-badge">MONICA INTELIGENT</span>
    </div>

    <div class="mn-sections">
      <div v-for="s in sections" :key="s.id" class="mn-section" :class="{ active: isInSection(s) }">
        <button class="mn-btn" :class="{ expanded: isExpanded(s.id) }" @click="toggle(s.id)">
          <span class="mn-icon">{{ s.icon }}</span>
          <span class="mn-label">{{ s.label }}</span>
          <svg class="mn-chev" :class="{ open: isExpanded(s.id) }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <Transition name="mn-expand">
          <div v-show="isExpanded(s.id)" class="mn-links">
            <a
              v-for="l in s.links" :key="l.link" :href="l.link"
              class="mn-link" :class="{ 'is-active': isActive(l.link) }"
              :style="isActive(l.link) ? `--la: ${s.accent}` : ''"
            >
              <span class="mn-dot" />
              <span>{{ l.text }}</span>
            </a>
          </div>
        </Transition>
      </div>
    </div>

    <div class="mn-foot">
      <div class="mn-hint"><kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar</div>
    </div>
  </div>
</template>

<style scoped>
.mn-nav { padding: 8px 0 20px; }

.mn-header { padding: 4px 16px 16px; }
.mn-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 20px;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.12), rgba(167, 139, 250, 0.12));
  border: 1px solid rgba(34, 211, 238, 0.2);
  color: #22d3ee; font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
}

.mn-sections { display: flex; flex-direction: column; gap: 2px; }

.mn-btn {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 16px; border: none; background: transparent;
  color: #a1a1aa; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.2s ease; text-align: left;
  font-family: var(--vp-font-family-base);
}
.mn-btn:hover { color: #fafafa; background: rgba(255, 255, 255, 0.03); }
.mn-btn.expanded { color: #fafafa; }
.mn-section.active > .mn-btn { color: #22d3ee; }

.mn-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; }
.mn-label { flex: 1; min-width: 0; }

.mn-chev {
  flex-shrink: 0; opacity: 0.4;
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.mn-chev.open { transform: rotate(180deg); opacity: 0.7; }
.mn-btn:hover .mn-chev { opacity: 0.7; }

.mn-links { display: flex; flex-direction: column; padding: 2px 0 6px; overflow: hidden; }

.mn-link {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 16px 6px 46px;
  color: #52525b; font-size: 12.5px; text-decoration: none;
  transition: all 0.15s ease;
}
.mn-link:hover { color: #fafafa; background: rgba(255, 255, 255, 0.03); }
.mn-link.is-active { color: var(--la, #22d3ee); font-weight: 600; }

.mn-dot {
  width: 4px; height: 4px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.1); flex-shrink: 0;
  transition: all 0.2s ease;
}
.mn-link:hover .mn-dot { background: rgba(255, 255, 255, 0.3); }
.mn-link.is-active .mn-dot {
  background: var(--la, #22d3ee);
  box-shadow: 0 0 6px color-mix(in srgb, var(--la, #22d3ee) 50%, transparent);
  width: 5px; height: 5px;
}

.mn-expand-enter-active, .mn-expand-leave-active { transition: all 0.25s ease; max-height: 500px; }
.mn-expand-enter-from, .mn-expand-leave-to { opacity: 0; max-height: 0; }

.mn-foot { margin-top: 20px; padding: 16px; border-top: 1px solid rgba(255, 255, 255, 0.05); }
.mn-hint { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #3f3f46; }
.mn-hint kbd {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 1px 5px; border-radius: 4px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 10px; color: #52525b; min-width: 20px;
  font-family: var(--vp-font-family-base);
}
</style>
