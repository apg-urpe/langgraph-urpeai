/**
 * 🎨 Paleta de Colores para Tarjetas - Estética Minimalista y Alto Contraste
 * 
 * Basada en el estilo actual de la aplicación (fondo oscuro #020204)
 * Diseñada para UI Blocks dinámicos con coherencia visual perfecta
 * 
 * 🎯 Principios:
 * - Minimalista: Elementos esenciales sin decoración innecesaria
 * - Alto Contraste: Máxima legibilidad en fondos oscuros
 * - Consistente: Unificación visual con el sistema existente
 * - Interactiva: Estados claros para mejor UX
 */

export const cardPalette = {
  // 🌑 FONDOS - Jerarquía visual sutil
  background: {
    primary: 'bg-black/40',           // Fondo principal con transparencia
    secondary: 'bg-zinc-900/40',      // Fondo secundario ligeramente más claro
    accent: 'bg-zinc-900/70',         // Para elementos destacados
    overlay: 'bg-zinc-950/80',        // Para overlays y modales
    success: 'bg-emerald-500/10',     // Éxito muy sutil
    warning: 'bg-amber-500/10',      // Advertencia muy sutil
    error: 'bg-rose-500/10',         // Error muy sutil
    info: 'bg-blue-500/10',          // Información muy sutil
  },

  // 🎨 BORDES - Definición y estados interactivos
  border: {
    default: 'border-white/10',       // Borde por defecto muy sutil
    hover: 'border-primary-500/30',   // Borde en estado hover
    active: 'border-primary-500/50',  // Borde en estado activo
    subtle: 'border-white/5',         // Borde muy sutil para secciones
    muted: 'border-zinc-800/50',      // Borde apagado para elementos inactivos
    success: 'border-emerald-500/30', // Borde para éxito
    warning: 'border-amber-500/30',  // Borde para advertencia
    error: 'border-rose-500/30',     // Borde para error
    info: 'border-blue-500/30',      // Borde para información
  },

  // ✏️ TEXTO - Jerarquía de alto contraste
  text: {
    primary: 'text-zinc-50',          // Texto principal (blanco puro)
    secondary: 'text-zinc-300',       // Texto secundario
    muted: 'text-zinc-400',           // Texto apagado
    accent: 'text-primary-400',       // Texto con color primario
    title: 'text-zinc-100',           // Títulos
    subtitle: 'text-zinc-400',        // Subtítulos
    success: 'text-emerald-400',      // Texto para éxito
    warning: 'text-amber-400',       // Texto para advertencia
    error: 'text-rose-400',          // Texto para error
    info: 'text-blue-400',           // Texto para información
  },

  // 🌟 SOMBRAS - Profundidad y efectos sutiles
  shadow: {
    card: 'shadow-[0_20px_60px_rgba(0,0,0,0.45)]',           // Sombra principal de tarjeta
    cardHover: 'shadow-[0_25px_70px_rgba(0,0,0,0.55)]',       // Sombra en hover
    inner: 'shadow-inner',                                    // Sombra interior para secciones
    glow: 'shadow-[0_0_20px_rgb(var(--primary-500)/0.3)]',    // Efecto glow primario
    glowSuccess: 'shadow-[0_0_20px_rgb(16,185,129)/0.3]',     // Efecto glow éxito
    glowWarning: 'shadow-[0_0_20px_rgb(245,158,11)/0.3]',     // Efecto glow advertencia
    glowError: 'shadow-[0_0_20px_rgb(244,63,94)/0.3]',        // Efecto glow error
    glowInfo: 'shadow-[0_0_20px_rgb(59,130,246)/0.3]',        // Efecto glow información
  },

  // 🎮 ESTADOS INTERACTIVOS - Respuesta visual clara
  interactive: {
    hover: 'hover:border-primary-500/30 hover:shadow-[0_25px_70px_rgba(0,0,0,0.55)]',
    active: 'active:border-primary-500/50 active:shadow-[0_30px_80px_rgba(0,0,0,0.65)]',
    disabled: 'opacity-50 cursor-not-allowed border-zinc-800/30',
    hoverSuccess: 'hover:border-emerald-500/40 hover:shadow-[0_25px_70px_rgba(16,185,129,0.2)]',
    hoverWarning: 'hover:border-amber-500/40 hover:shadow-[0_25px_70px_rgba(245,158,11,0.2)]',
    hoverError: 'hover:border-rose-500/40 hover:shadow-[0_25px_70px_rgba(244,63,94,0.2)]',
    hoverInfo: 'hover:border-blue-500/40 hover:shadow-[0_25px_70px_rgba(59,130,246,0.2)]',
  },

  // 🎨 COLORES DE ACENTO - Por tipo de contenido/estado
  accentColors: {
    blue: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-400',
      icon: 'text-blue-500',
      glow: 'shadow-[0_0_20px_rgb(59,130,246)/0.3]',
    },
    green: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      icon: 'text-emerald-500',
      glow: 'shadow-[0_0_20px_rgb(16,185,129)/0.3]',
    },
    orange: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      icon: 'text-amber-500',
      glow: 'shadow-[0_0_20px_rgb(245,158,11)/0.3]',
    },
    purple: {
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/30',
      text: 'text-violet-400',
      icon: 'text-violet-500',
      glow: 'shadow-[0_0_20px_rgb(139,92,246)/0.3]',
    },
    red: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      text: 'text-rose-400',
      icon: 'text-rose-500',
      glow: 'shadow-[0_0_20px_rgb(244,63,94)/0.3]',
    },
    cyan: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      text: 'text-cyan-400',
      icon: 'text-cyan-500',
      glow: 'shadow-[0_0_20px_rgb(6,182,212)/0.3]',
    },
  },

  // 🌈 GRADIENTES - Transiciones sutiles para fondos
  gradients: {
    card: 'bg-gradient-to-br from-zinc-900/70 via-zinc-900/40 to-black/60',
    header: 'bg-gradient-to-r from-zinc-900/50 to-zinc-800/30',
    section: 'bg-gradient-to-b from-zinc-900/20 to-zinc-900/10',
    success: 'bg-gradient-to-br from-emerald-900/20 to-emerald-900/5',
    warning: 'bg-gradient-to-br from-amber-900/20 to-amber-900/5',
    error: 'bg-gradient-to-br from-rose-900/20 to-rose-900/5',
    info: 'bg-gradient-to-br from-blue-900/20 to-blue-900/5',
  },

  // 🪟 EFECTOS BACKDROP - Desenfoque y transparencia
  backdrop: {
    blur: 'backdrop-blur-xl',
    blurLight: 'backdrop-blur-lg',
    blurSubtle: 'backdrop-blur-sm',
    blurHeavy: 'backdrop-blur-2xl',
  },

  // 🔄 REDONDEADOS - Consistencia visual
  radius: {
    card: 'rounded-3xl',           // Tarjetas principales
    section: 'rounded-2xl',        // Secciones internas
    button: 'rounded-xl',          // Botones
    small: 'rounded-lg',           // Elementos pequeños
    icon: 'rounded-xl',            // Iconos y avatares
    input: 'rounded-lg',           // Campos de formulario
    modal: 'rounded-3xl',          // Modales y diálogos
  },
};

// 🎯 CLASES COMBINADAS - Para desarrollo rápido
export const cardClasses = {
  // 📇 Tarjeta principal estándar
  primary: `
    ${cardPalette.background.primary}
    ${cardPalette.border.default}
    ${cardPalette.shadow.card}
    ${cardPalette.radius.card}
    ${cardPalette.backdrop.blur}
    ${cardPalette.interactive.hover}
    transition-all duration-300
  `,

  // 📋 Sección interna
  section: `
    ${cardPalette.background.secondary}
    ${cardPalette.border.subtle}
    ${cardPalette.shadow.inner}
    ${cardPalette.radius.section}
    p-4 md:p-5
    space-y-3
  `,

  // 🎨 Header de tarjeta
  header: `
    ${cardPalette.gradients.card}
    ${cardPalette.border.default}
    px-6 md:px-7
    py-5
    border-b
  `,

  // ✅ Tarjeta de éxito
  success: `
    ${cardPalette.background.success}
    ${cardPalette.border.success}
    ${cardPalette.shadow.glowSuccess}
    ${cardPalette.radius.card}
    ${cardPalette.backdrop.blur}
    ${cardPalette.interactive.hoverSuccess}
    transition-all duration-300
  `,

  // ⚠️ Tarjeta de advertencia
  warning: `
    ${cardPalette.background.warning}
    ${cardPalette.border.warning}
    ${cardPalette.shadow.glowWarning}
    ${cardPalette.radius.card}
    ${cardPalette.backdrop.blur}
    ${cardPalette.interactive.hoverWarning}
    transition-all duration-300
  `,

  // ❌ Tarjeta de error
  error: `
    ${cardPalette.background.error}
    ${cardPalette.border.error}
    ${cardPalette.shadow.glowError}
    ${cardPalette.radius.card}
    ${cardPalette.backdrop.blur}
    ${cardPalette.interactive.hoverError}
    transition-all duration-300
  `,

  // ℹ️ Tarjeta informativa
  info: `
    ${cardPalette.background.info}
    ${cardPalette.border.info}
    ${cardPalette.shadow.glowInfo}
    ${cardPalette.radius.card}
    ${cardPalette.backdrop.blur}
    ${cardPalette.interactive.hoverInfo}
    transition-all duration-300
  `,

  // 🎨 Tarjeta con acento de color específico
  withAccent: (accent: keyof typeof cardPalette.accentColors) => `
    ${cardPalette.background.primary}
    ${cardPalette.accentColors[accent].border}
    ${cardPalette.accentColors[accent].glow}
    ${cardPalette.radius.card}
    ${cardPalette.backdrop.blur}
    transition-all duration-300
    hover:${cardPalette.accentColors[accent].border}
  `,
};

// 🛠️ UTILIDADES - Para aplicar colores dinámicamente
export const getAccentColor = (type: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'cyan' = 'blue') => {
  return cardPalette.accentColors[type];
};

// 🎭 TEMAS PREDEFINIDOS - Para diferentes tipos de contenido
export const cardThemes = {
  default: cardClasses.primary,
  success: cardClasses.success,
  warning: cardClasses.warning,
  error: cardClasses.error,
  info: cardClasses.info,
  special: cardClasses.withAccent('purple'),
  neutral: cardClasses.withAccent('cyan'),
  primary: cardClasses.withAccent('blue'),
  secondary: cardClasses.withAccent('green'),
};

// 🎨 UTILIDADES ADICIONALES
export const cardUtils = {
  // Obtener clases de texto por jerarquía
  getTextClass: (level: 'primary' | 'secondary' | 'muted' | 'title' | 'subtitle') => {
    return cardPalette.text[level];
  },

  // Obtener clases de fondo por tipo
  getBackgroundClass: (type: 'primary' | 'secondary' | 'accent' | 'overlay' | 'success' | 'warning' | 'error' | 'info') => {
    return cardPalette.background[type];
  },

  // Obtener clases de borde por estado
  getBorderClass: (state: 'default' | 'hover' | 'active' | 'subtle' | 'muted' | 'success' | 'warning' | 'error' | 'info') => {
    return cardPalette.border[state];
  },

  // Obtener clases de sombra por efecto
  getShadowClass: (effect: 'card' | 'cardHover' | 'inner' | 'glow' | 'glowSuccess' | 'glowWarning' | 'glowError' | 'glowInfo') => {
    return cardPalette.shadow[effect];
  },

  // Obtener clases de redondeado por elemento
  getRadiusClass: (element: 'card' | 'section' | 'button' | 'small' | 'icon' | 'input' | 'modal') => {
    return cardPalette.radius[element];
  },

  // Crear clase de tarjeta personalizada
  createCustomCard: (config: {
    background?: keyof typeof cardPalette.background;
    border?: keyof typeof cardPalette.border;
    shadow?: keyof typeof cardPalette.shadow;
    radius?: keyof typeof cardPalette.radius;
    interactive?: keyof typeof cardPalette.interactive;
  }) => {
    const bg = config.background ? cardPalette.background[config.background] : cardPalette.background.primary;
    const border = config.border ? cardPalette.border[config.border] : cardPalette.border.default;
    const shadow = config.shadow ? cardPalette.shadow[config.shadow] : cardPalette.shadow.card;
    const radius = config.radius ? cardPalette.radius[config.radius] : cardPalette.radius.card;
    const interactive = config.interactive ? cardPalette.interactive[config.interactive] : cardPalette.interactive.hover;
    
    return `${bg} ${border} ${shadow} ${radius} ${cardPalette.backdrop.blur} ${interactive} transition-all duration-300`;
  },
};
