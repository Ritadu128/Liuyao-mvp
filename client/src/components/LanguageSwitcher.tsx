import { useI18n } from '@/i18n/I18nContext';
import { FANG_SONG } from '@/components/ScrollUI';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
      aria-label={t('switchLanguage')}
      className="fixed bottom-4 right-4 z-50 rounded-full border border-amber-700/20 bg-[#fffaf0]/90 px-3 py-1.5 text-xs text-amber-900/70 shadow-sm backdrop-blur hover:text-amber-900"
      style={{ fontFamily: FANG_SONG }}
    >
      {t('switchLanguage')}
    </button>
  );
}
