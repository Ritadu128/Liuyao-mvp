import { useEffect, useRef, useState } from 'react';
import { FANG_SONG } from '@/components/ScrollUI';
import { useI18n } from '@/i18n/I18nContext';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_script_failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile_script_failed'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileChallenge({
  siteKey,
  error,
  onVerified,
}: {
  siteKey: string;
  error?: string;
  onVerified: (token: string) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const onVerifiedRef = useRef(onVerified);
  const [loadError, setLoadError] = useState(false);

  onVerifiedRef.current = onVerified;

  useEffect(() => {
    let disposed = false;
    let widgetId: string | undefined;

    void loadTurnstile().then(() => {
      if (disposed || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: 'reading',
        theme: 'light',
        size: 'flexible',
        appearance: 'always',
        callback: (token: string) => onVerifiedRef.current(token),
        'error-callback': () => setLoadError(true),
        'expired-callback': () => setLoadError(true),
      });
    }).catch(() => setLoadError(true));

    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return (
    <div
      data-export-ignore="true"
      className="px-4 py-5 text-center"
      style={{
        fontFamily: FANG_SONG,
        color: '#6f4a1f',
        background: 'rgba(255,251,238,0.9)',
        border: '1px solid rgba(175,120,35,0.25)',
        borderRadius: '12px',
      }}
    >
      <div className="text-sm tracking-widest">{t('verifyHuman')}</div>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">
        {t('verifyHumanDescription')}
      </p>
      <div ref={containerRef} className="mx-auto mt-4 min-h-[65px] max-w-[300px]" />
      {(error || loadError) && (
        <p className="mt-3 text-xs text-amber-800/80">
          {loadError ? t('verifyFailed') : error}
        </p>
      )}
    </div>
  );
}
