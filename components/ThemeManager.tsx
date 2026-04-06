'use client';


import React, { useEffect } from 'react';
import { useChatStore, AppTheme } from '../store/chatStore';

// We now define a PRIMARY (Main) and SECONDARY (Accent) color for dual-tone gradients
const THEME_PALETTES: Record<AppTheme, { 
  primary: { 400: string; 500: string; 600: string };
  secondary: { 400: string; 500: string }; // Secondary color for gradients
}> = {
  // Glacier: Cyan -> Deep Blue
  glacier: {
    primary: {
      400: '34 211 238',   // #22d3ee (Cyan)
      500: '6 182 212',    // #06b6d4
      600: '8 145 178',    // #0891b2
    },
    secondary: {
      400: '96 165 250',   // #60a5fa (Blue)
      500: '59 130 246',   // #3b82f6
    }
  },
  // Nebula: Purple -> Pink
  nebula: {
    primary: {
      400: '192 132 252', // #c084fc (Purple)
      500: '147 51 234',  // #9333ea
      600: '126 34 206',  // #7e22ce
    },
    secondary: {
      400: '244 114 182', // #f472b6 (Pink)
      500: '236 72 153',  // #ec4899
    }
  },
  // Matrix: Green -> Emerald/Teal
  matrix: {
    primary: {
      400: '74 222 128',  // #4ade80 (Green)
      500: '34 197 94',   // #22c55e
      600: '22 163 74',   // #16a34a
    },
    secondary: {
      400: '45 212 191',  // #2dd4bf (Teal)
      500: '20 184 166',  // #14b8a6
    }
  },
  // Ember: Orange -> Rose/Red
  ember: {
    primary: {
      400: '251 146 60',  // #fb923c (Orange)
      500: '249 115 22',  // #f97316
      600: '234 88 12',   // #ea580c
    },
    secondary: {
      400: '251 113 133', // #fb7185 (Rose)
      500: '244 63 94',   // #f43f5e
    }
  },
  // Midnight: White -> Indigo/Slate
  midnight: {
    primary: {
      400: '255 255 255', // White
      500: '228 228 231', // #e4e4e7
      600: '161 161 170', // #a1a1aa
    },
    secondary: {
      400: '129 140 248', // #818cf8 (Indigo)
      500: '99 102 241',  // #6366f1
    }
  },
};

export const ThemeManager: React.FC = () => {
  const { currentTheme } = useChatStore();

  useEffect(() => {
    const root = document.documentElement;
    const palette = THEME_PALETTES[currentTheme];

    // Enable smooth transitions for variables
    root.style.setProperty('transition', '--primary-400 1s ease, --primary-500 1s ease, --secondary-500 1s ease');
    
    // Inject RGB values into CSS variables
    // Primary
    root.style.setProperty('--primary-400', palette.primary[400]);
    root.style.setProperty('--primary-500', palette.primary[500]);
    root.style.setProperty('--primary-600', palette.primary[600]);

    // Secondary (For gradients)
    root.style.setProperty('--secondary-400', palette.secondary[400]);
    root.style.setProperty('--secondary-500', palette.secondary[500]);

    root.style.setProperty('color-scheme', 'dark');
  }, [currentTheme]);

  return null;
};

