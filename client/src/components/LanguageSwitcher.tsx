import { useEffect, useRef, useState } from 'react';
import { useI18n, type Locale } from '@/i18n/I18nContext';
import { FANG_SONG } from '@/components/ScrollUI';

const choices: { locale: Locale; label: string }[] = [
  { locale: 'zh-CN', label: '简体中文' },
  { locale: 'zh-TW', label: '繁體中文' },
  { locale: 'en-US', label: 'English' },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const languageLabel = locale === 'en-US' ? 'Language' : locale === 'zh-TW' ? '語言' : '语言';

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6" style={{ fontFamily: FANG_SONG }}>
      <button
        type="button"
        aria-label={languageLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="flex h-10 min-w-20 items-center justify-center border px-3 text-xs text-[#7c5a2a] transition-colors hover:bg-[#fff8e6]"
        style={{ background: 'rgba(255,252,242,0.7)', borderColor: 'rgba(175,120,35,0.28)', borderRadius: '3px' }}
      >
        {languageLabel}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={languageLabel}
          className="absolute right-0 top-11 min-w-32 border p-1 shadow-md"
          style={{ background: '#fffcf2', borderColor: 'rgba(175,120,35,0.28)', borderRadius: '3px' }}
        >
          {choices.map(choice => (
            <button
              key={choice.locale}
              type="button"
              role="option"
              aria-selected={locale === choice.locale}
              onClick={() => { setLocale(choice.locale); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm text-[#7c5a2a] hover:bg-[#fff4da]"
              style={{ background: locale === choice.locale ? 'rgba(245,226,181,0.58)' : undefined }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
