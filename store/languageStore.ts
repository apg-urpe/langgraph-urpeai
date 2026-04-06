
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'es';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'es', // Default to Spanish
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'urpe-language-storage',
    }
  )
);
