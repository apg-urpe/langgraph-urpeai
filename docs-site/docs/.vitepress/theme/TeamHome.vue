<script setup>
const useCases = [
  {
    icon: '\u{1F916}',
    title: 'Agentes IA Multicanal',
    description: 'Agentes IA en WhatsApp, Instagram, Facebook, TikTok, SMS, email y web. Responden 24/7, cualifican leads y escalan al humano cuando importa.',
    highlights: ['7 canales', 'Respuestas 24/7', 'Cualificacion automatica'],
    link: '/modules/chat/',
    accent: '#22d3ee',
  },
  {
    icon: '\u{1F399}\u{FE0F}',
    title: 'Monica en tus Llamadas',
    description: 'Monica sube a las llamadas y hace transcripcion en tiempo real. Analiza conversaciones, identifica oportunidades y genera resumenes automaticos para tu CRM.',
    highlights: ['Transcripcion en vivo', 'Analisis automatico', 'Resumenes inteligentes'],
    link: '/modules/monica-ai/',
    accent: '#a78bfa',
  },
  {
    icon: '\u{1F4C8}',
    title: 'Eficiencia Comercial',
    description: 'Pipeline automatizado con seguimientos inteligentes. Lead scoring que prioriza los prospectos con mayor potencial y genera tareas automaticas para tu equipo.',
    highlights: ['Lead scoring', 'Seguimiento automatico', 'Pipeline visual'],
    link: '/modules/funnel/',
    accent: '#34d399',
  },
  {
    icon: '\u{1F4CA}',
    title: 'Recoleccion Inteligente de Datos',
    description: 'Cada conversacion — WhatsApp, Instagram, llamada, email — alimenta automaticamente tu CRM. Sin formularios. Sin datos perdidos.',
    highlights: ['Captura automatica', 'CRM centralizado', 'Historial completo'],
    link: '/modules/contacts/',
    accent: '#60a5fa',
  },
  {
    icon: '\u{1F3C6}',
    title: 'Gamificacion del Equipo',
    description: 'XP, niveles, logros y rankings que motivan a tu equipo comercial a superar objetivos diarios y cerrar mas ventas. Competencia sana que impulsa resultados.',
    highlights: ['Sistema de XP', 'Rankings en vivo', 'Misiones diarias'],
    link: '/modules/gamification/',
    accent: '#f0abfc',
  },
  {
    icon: '\u{1F4E7}',
    title: 'Marketing Automatizado',
    description: 'Segmentacion inteligente de audiencias y secuencias de email que nutren tus leads en el momento perfecto. Metricas en tiempo real para optimizar campanas.',
    highlights: ['Audiencias dinamicas', 'Secuencias automaticas', 'Metricas en vivo'],
    link: '/modules/marketing/',
    accent: '#2dd4bf',
  },
]

const modules = [
  { icon: '\u{1F4AC}', title: 'Chat', link: '/modules/chat/' },
  { icon: '\u{1F465}', title: 'Contactos', link: '/modules/contacts/' },
  { icon: '\u{1F4CB}', title: 'Tareas', link: '/modules/tasks/' },
  { icon: '\u{1F4B0}', title: 'Finanzas', link: '/modules/finance/' },
  { icon: '\u{1F4CA}', title: 'Dashboard', link: '/modules/dashboard/' },
  { icon: '\u{1F4E7}', title: 'Marketing', link: '/modules/marketing/' },
  { icon: '\u{1F514}', title: 'Alertas', link: '/modules/notifications/' },
  { icon: '\u{1F91D}', title: 'Equipo', link: '/modules/team/' },
  { icon: '\u{1F5D3}\u{FE0F}', title: 'Calendario', link: '/modules/calendar/' },
  { icon: '\u{1F4F1}', title: 'Movil', link: '/mobile/' },
  { icon: '\u{1F52C}', title: 'Research', link: '/modules/deep-research/' },
  { icon: '\u{26A1}', title: 'Arquitectura', link: '/architecture/' },
]

const metrics = [
  { value: '+40%', label: 'Eficiencia Comercial' },
  { value: '24/7', label: 'Cobertura Multicanal' },
  { value: '0', label: 'Leads Perdidos' },
  { value: '100%', label: 'Datos Capturados' },
]

const tags = [
  { text: 'IA Conversacional', icon: '\u{1F916}' },
  { text: 'Multicanal', icon: '\u{1F4F1}' },
  { text: 'CRM', icon: '\u{1F465}' },
  { text: 'Llamadas', icon: '\u{1F399}\u{FE0F}' },
]
</script>

<template>
  <div class="mi-home">
    <!-- BG orbs -->
    <div class="mi-bg">
      <div class="mi-orb mi-orb-cyan" />
      <div class="mi-orb mi-orb-violet" />
      <div class="mi-orb mi-orb-pink" />
    </div>

    <!-- Hero -->
    <div class="mi-hero">
      <div class="mi-tags">
        <span v-for="tag in tags" :key="tag.text" class="mi-tag">
          <span class="mi-tag-icon">{{ tag.icon }}</span>
          {{ tag.text }}
        </span>
      </div>

      <h1 class="mi-title">
        <span class="mi-gradient">Monica Inteligent</span>
      </h1>

      <p class="mi-tagline">
        Plataforma de negocio con IA — CRM conversacional con agentes en WhatsApp,
        transcripcion de llamadas y automatizacion comercial.
      </p>

      <a href="/overview" class="mi-cta">
        Explorar la plataforma
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    </div>

    <!-- Use Cases -->
    <div class="mi-section-label">
      <span class="mi-section-line" />
      <span class="mi-section-text">Casos de Uso</span>
      <span class="mi-section-line" />
    </div>

    <div class="mi-cases">
      <a
        v-for="(uc, i) in useCases"
        :key="uc.title"
        :href="uc.link"
        class="mi-case"
        :style="{ '--uc-accent': uc.accent, '--uc-delay': `${i * 0.08}s` }"
      >
        <div class="mi-case-header">
          <span class="mi-case-icon">{{ uc.icon }}</span>
          <h3 class="mi-case-title">{{ uc.title }}</h3>
        </div>
        <p class="mi-case-desc">{{ uc.description }}</p>
        <div class="mi-case-pills">
          <span v-for="h in uc.highlights" :key="h" class="mi-pill">
            <span class="mi-pill-dot" />
            {{ h }}
          </span>
        </div>
        <div class="mi-case-foot">
          <span class="mi-case-link">
            Ver mas
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        </div>
      </a>
    </div>

    <!-- Modules grid -->
    <div class="mi-section-label">
      <span class="mi-section-line" />
      <span class="mi-section-text">Todos los Modulos</span>
      <span class="mi-section-line" />
    </div>

    <div class="mi-modules">
      <a v-for="m in modules" :key="m.title" :href="m.link" class="mi-mod">
        <span class="mi-mod-icon">{{ m.icon }}</span>
        <span class="mi-mod-title">{{ m.title }}</span>
        <svg class="mi-mod-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </a>
    </div>

    <!-- Metrics -->
    <div class="mi-metrics">
      <div class="mi-metrics-inner">
        <div v-for="m in metrics" :key="m.label" class="mi-metric">
          <span class="mi-metric-val">{{ m.value }}</span>
          <span class="mi-metric-lbl">{{ m.label }}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="mi-footer">
      <p class="mi-footer-text">
        <kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar cualquier cosa
      </p>
    </div>
  </div>
</template>

<style scoped>
.mi-home {
  position: relative;
  padding: 16px 0 60px;
  overflow: hidden;
}

/* ── BG ── */
.mi-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.mi-orb { position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.18; }
.mi-orb-cyan { width: 420px; height: 420px; background: #22d3ee; top: -100px; right: -40px; animation: team-float 12s ease-in-out infinite; }
.mi-orb-violet { width: 350px; height: 350px; background: #a78bfa; bottom: 15%; left: -60px; animation: team-float-reverse 14s ease-in-out infinite; }
.mi-orb-pink { width: 250px; height: 250px; background: #f0abfc; top: 40%; right: 25%; animation: team-float 16s ease-in-out infinite 3s; }

/* ── Hero ── */
.mi-hero { position: relative; z-index: 1; text-align: center; padding: 36px 20px 44px; }

.mi-tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 24px; }
.mi-tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 14px; border-radius: 20px;
  background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);
  color: #a1a1aa; font-size: 12px; font-weight: 500;
}
.mi-tag-icon { font-size: 13px; }

.mi-title {
  font-size: clamp(2.4rem, 6vw, 3.8rem);
  font-weight: 900; line-height: 1.1;
  margin: 0 0 18px; letter-spacing: -0.03em;
}

.mi-gradient {
  background: linear-gradient(135deg, #22d3ee 0%, #a78bfa 40%, #f0abfc 80%, #22d3ee 100%);
  background-size: 300% 300%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: team-gradient-shift 8s ease infinite;
}

.mi-tagline {
  font-size: clamp(0.95rem, 2.2vw, 1.12rem);
  color: #71717a; line-height: 1.7;
  margin: 0 auto 28px; max-width: 580px;
}

.mi-cta {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 26px; border-radius: 50px;
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  color: #020204; font-size: 13px; font-weight: 700;
  text-decoration: none; letter-spacing: 0.01em;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.3);
}
.mi-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(6, 182, 212, 0.4); }
.mi-cta svg { transition: transform 0.2s ease; }
.mi-cta:hover svg { transform: translateX(3px); }

/* ── Section label ── */
.mi-section-label {
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: 16px;
  padding: 0 20px; margin: 0 auto 28px; max-width: 960px;
}
.mi-section-line { flex: 1; height: 1px; background: rgba(255, 255, 255, 0.05); }
.mi-section-text {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.12em; color: #52525b;
}

/* ── Use Case Cards (2 col) ── */
.mi-cases {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
  padding: 0 20px; max-width: 960px; margin: 0 auto 40px;
}

.mi-case {
  display: flex; flex-direction: column; padding: 22px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  animation: team-card-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--uc-delay);
  position: relative; overflow: hidden;
}
.mi-case::before {
  content: ''; position: absolute; top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent);
  transition: left 0.6s ease;
}
.mi-case:hover::before { left: 200%; }
.mi-case:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  background: rgba(19, 19, 22, 0.6);
}

.mi-case-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.mi-case-icon {
  font-size: 26px; width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: all 0.3s ease;
}
.mi-case:hover .mi-case-icon { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.1); }
.mi-case-title { font-size: 15px; font-weight: 700; color: #fafafa; margin: 0; letter-spacing: -0.01em; }
.mi-case-desc { font-size: 12.5px; color: #71717a; line-height: 1.65; margin: 0 0 14px; flex: 1; }
.mi-case:hover .mi-case-desc { color: #a1a1aa; }

.mi-case-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.mi-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 600; color: #a1a1aa;
  padding: 3px 9px; border-radius: 20px;
  background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05);
}
.mi-pill-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--uc-accent); flex-shrink: 0; }

.mi-case-foot { padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05); }
.mi-case-link {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600; color: var(--uc-accent);
}
.mi-case-link svg { transition: transform 0.2s ease; }
.mi-case:hover .mi-case-link svg { transform: translateX(3px); }

/* ── Module grid (4 col compact) ── */
.mi-modules {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;
  padding: 0 20px; max-width: 960px; margin: 0 auto 40px;
}

.mi-mod {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 12px;
  background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.05);
  text-decoration: none;
  transition: all 0.2s ease;
}
.mi-mod:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(19, 19, 22, 0.5);
}
.mi-mod-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.mi-mod-title { font-size: 13px; font-weight: 600; color: #a1a1aa; flex: 1; }
.mi-mod:hover .mi-mod-title { color: #fafafa; }
.mi-mod-arrow { color: #3f3f46; flex-shrink: 0; transition: all 0.2s ease; }
.mi-mod:hover .mi-mod-arrow { color: #22d3ee; transform: translateX(2px); }

/* ── Metrics ── */
.mi-metrics {
  position: relative; z-index: 1;
  padding: 0 20px; max-width: 960px; margin: 0 auto 0;
}
.mi-metrics-inner {
  display: flex; justify-content: space-around;
  padding: 24px 16px; border-radius: 16px;
  background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.mi-metric { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 8px; }
.mi-metric-val {
  font-size: clamp(1.2rem, 2.5vw, 1.6rem); font-weight: 900;
  background: linear-gradient(135deg, #22d3ee, #a78bfa);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  letter-spacing: -0.02em;
}
.mi-metric-lbl {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #52525b; text-align: center;
}

/* ── Footer ── */
.mi-footer { position: relative; z-index: 1; text-align: center; margin-top: 36px; padding: 0 20px; }
.mi-footer-text { font-size: 11px; color: #3f3f46; }
.mi-footer-text kbd {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 1px 5px; border-radius: 4px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 10px; color: #52525b; min-width: 20px;
  font-family: var(--vp-font-family-base);
}

/* ── Responsive ── */
@media (max-width: 700px) {
  .mi-cases { grid-template-columns: 1fr; }
  .mi-modules { grid-template-columns: repeat(2, 1fr); }
  .mi-hero { padding: 20px 16px 32px; }
  .mi-metrics-inner { flex-wrap: wrap; gap: 12px; }
  .mi-metric { min-width: 40%; }
  .mi-orb-cyan { width: 260px; height: 260px; }
  .mi-orb-violet { width: 200px; height: 200px; }
  .mi-orb-pink { width: 150px; height: 150px; }
}
</style>
