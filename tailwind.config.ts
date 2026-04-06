import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        zinc: {
          850: '#1f1f22',
          900: '#18181b',
          950: '#09090b',
        },
        primary: {
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          glow: 'rgb(var(--primary-400) / 0.15)',
        },
        secondary: {
          400: 'rgb(var(--secondary-400) / <alpha-value>)',
          500: 'rgb(var(--secondary-500) / <alpha-value>)',
        },
      },
      animation: {
        'pop-in': 'popIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'zoom-in-x': 'zoomInX 0.3s ease-out forwards',
        'zoom-in-y': 'zoomInY 0.3s ease-out forwards',
        'slide-in-top': 'slideInTop 0.3s ease-out forwards',
        'slide-in-bottom': 'slideInBottom 0.3s ease-out forwards',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'cursor-blink': 'cursorBlink 0.8s step-end infinite',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'shimmer': 'shimmer 3s linear infinite',
        'blob-1': 'blob1 25s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)',
        'blob-2': 'blob2 30s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)',
        'blob-3': 'blob3 35s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-slow': 'pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'grain': 'grain 8s steps(10) infinite',
        'char-fade-in': 'charFadeIn 0.25s ease-out forwards',
        'word-reveal': 'wordReveal 0.4s ease-out forwards',
        'text-shimmer': 'textShimmer 0.6s ease-out forwards',
        'card-appear': 'cardAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'text-reveal': 'textReveal 0.3s ease-out forwards',
        'message-in': 'messageIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'progress-indeterminate': 'progressIndeterminate 1.5s ease-in-out infinite',
        'content-update': 'contentUpdate 0.3s ease-out',
        'scan': 'scan 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        zoomInX: {
          '0%': { opacity: '0', transform: 'scaleX(0)' },
          '100%': { opacity: '1', transform: 'scaleX(1)' },
        },
        zoomInY: {
          '0%': { opacity: '0', transform: 'scaleY(0)' },
          '100%': { opacity: '1', transform: 'scaleY(1)' },
        },
        slideInTop: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInBottom: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        cursorBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        blob1: {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30vw, -10vh) scale(1.2)' },
          '66%': { transform: 'translate(-20vw, 20vh) scale(0.9)' },
          '100%': { transform: 'translate(0, 0) scale(1)' },
        },
        blob2: {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(-30vw, 20vh) scale(1.1)' },
          '66%': { transform: 'translate(20vw, -20vh) scale(0.95)' },
          '100%': { transform: 'translate(0, 0) scale(1)' },
        },
        blob3: {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(20vw, 20vh) scale(1.3)' },
          '100%': { transform: 'translate(-10vw, -10vh) scale(1)' },
        },
        grain: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-5%, -10%)' },
          '20%': { transform: 'translate(-15%, 5%)' },
          '30%': { transform: 'translate(7%, -25%)' },
          '40%': { transform: 'translate(-5%, 25%)' },
          '50%': { transform: 'translate(-15%, 10%)' },
          '60%': { transform: 'translate(15%, 0%)' },
          '70%': { transform: 'translate(0%, 15%)' },
          '80%': { transform: 'translate(3%, 35%)' },
          '90%': { transform: 'translate(-10%, 10%)' },
        },
        charFadeIn: {
          '0%': { opacity: '0', filter: 'blur(4px)', transform: 'translateY(2px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
        },
        wordReveal: {
          '0%': { opacity: '0', filter: 'blur(8px)', transform: 'translateY(4px) scale(0.98)' },
          '50%': { opacity: '0.7', filter: 'blur(2px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0) scale(1)' },
        },
        textShimmer: {
          '0%': { opacity: '0.3', textShadow: '0 0 20px rgba(var(--primary-400), 0.8)' },
          '50%': { opacity: '0.8', textShadow: '0 0 10px rgba(var(--primary-400), 0.5)' },
          '100%': { opacity: '1', textShadow: 'none' },
        },
        cardAppear: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        textReveal: {
          '0%': { opacity: '0', filter: 'blur(4px)' },
          '100%': { opacity: '1', filter: 'blur(0)' },
        },
        messageIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        progressIndeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        contentUpdate: {
          '0%': { opacity: '0.7', transform: 'scale(0.99)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '50%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(-100%)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(var(--primary-500), 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(var(--primary-500), 0.6)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '0.9', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
