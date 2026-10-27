import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type MessageKey } from './messages';

export type Locale = keyof typeof messages;
const STORAGE_KEY = 'liuyao_locale';

function resolveInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en-US') return saved;
  } catch {
    // Storage can be unavailable in strict privacy modes; browser language is a safe fallback.
  }
  // Keep the current Chinese product as the stable default; visitors can switch explicitly.
  return 'zh-CN';
}

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = (next: Locale) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* keep the in-memory selection */ }
    setLocaleState(next);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].siteName;
    document.querySelector('meta[name="description"]')?.setAttribute('content', messages[locale].siteDescription);
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key, values) => interpolate(messages[locale][key], values),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
