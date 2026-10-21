import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { getLocalReadings, type LocalReading } from '@/hooks/useLocalHistory';
import { rebuildHexagram } from '@/lib/liuyao';
import type { LineValue } from '@/lib/liuyao';
import { HexagramDisplay } from '@/components/HexagramLine';
import { cn } from '@/lib/utils';
import { SafeMarkdown } from '@/components/SafeMarkdown';
import { lookupHexagram } from '@/hooks/useHexagramData';
import { useI18n } from '@/i18n/I18nContext';
import { localizeHexagram, localizedHexagramName } from '@/i18n/hexagrams';

export default function HistoryPage() {
  const { locale, t } = useI18n();
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verifiedNames, setVerifiedNames] = useState<Record<string, {
    original: string;
    changed: string | null;
  }>>({});

  // 匿名版本只读取当前浏览器的 localStorage；刷新或重新打开页面后仍可恢复。
  const readings = useMemo<LocalReading[]>(() => getLocalReadings().filter(item => (item.locale ?? 'zh-CN') === locale), [locale]);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return readings.find(reading => reading.id === selectedId) ?? null;
  }, [readings, selectedId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(readings.map(async item => {
      const hexResult = getHexagram(item.linesJson);
      if (!hexResult) return [item.id, null] as const;
      const original = await lookupHexagram(hexResult.originalBits);
      const changed = hexResult.hasMoving
        ? await lookupHexagram(hexResult.changedBits)
        : null;
      return [item.id, {
        original: localizeHexagram(original, locale)?.name ?? t('hexagramRecord'),
        changed: localizeHexagram(changed, locale)?.name ?? null,
      }] as const;
    })).then(entries => {
      if (cancelled) return;
      const next: Record<string, { original: string; changed: string | null }> = {};
      for (const [id, names] of entries) {
        if (names) next[id] = names;
      }
      setVerifiedNames(next);
    });
    return () => { cancelled = true; };
  }, [readings, locale]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('unknownTime');
    return date.toLocaleDateString(locale, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getHexagram = (linesJson: string) => {
    try {
      const lines = JSON.parse(linesJson) as LineValue[];
      if (!Array.isArray(lines) || lines.length !== 6) return null;
      return rebuildHexagram(lines);
    } catch {
      return null;
    }
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-stone-400 hover:text-stone-600 text-sm transition-colors"
        >
          {t('back')}
        </button>
        <h1 className="text-lg font-medium text-stone-700 tracking-wide">{t('historyTitle')}</h1>
        <span className="ml-auto text-xs text-stone-400">{t('localOnly')}</span>
      </div>

      {readings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📜</div>
          <p className="text-stone-400 text-sm">{t('noHistory')}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-amber-600 text-sm hover:text-amber-800 transition-colors"
          >
            {t('startFirst')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {readings.map(item => {
            const hexResult = getHexagram(item.linesJson);
            const isSelected = selectedId === item.id;
            const verified = verifiedNames[item.id];
            const isLegacyCasting = item.castingVersion !== 2;

            return (
              <div
                key={item.id}
                className={cn(
                  'bg-white/80 border rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer',
                  isSelected
                    ? 'border-amber-300 shadow-md shadow-amber-100'
                    : 'border-amber-200/40 hover:border-amber-200 hover:shadow-sm'
                )}
                onClick={() => setSelectedId(isSelected ? null : item.id)}
              >
                <div className="p-4 flex gap-4 items-start">
                  <div className="shrink-0 w-16">
                    {hexResult ? (
                      <HexagramDisplay
                        lines={hexResult.lines}
                        movingLines={hexResult.movingLines}
                        size="sm"
                      />
                    ) : (
                      <div className="h-16 flex items-center justify-center text-xs text-stone-400">{t('missingHexagram')}</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-stone-700 text-sm font-medium truncate mb-1">{item.question}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        {verified?.original ?? (isLegacyCasting ? t('legacyUnverified') : localizedHexagramName(item.originalKey, item.originalName, locale))}
                      </span>
                      {(verified?.changed ?? (!isLegacyCasting ? item.changedName : null)) && (
                        <>
                          <span className="text-xs text-stone-400">→</span>
                          <span className="text-xs text-stone-600 bg-stone-50 px-2 py-0.5 rounded-full border border-stone-200">
                            {verified?.changed ?? (item.changedName ? localizedHexagramName(item.changedKey ?? '', item.changedName, locale) : null)}
                          </span>
                        </>
                      )}
                      {hexResult && hexResult.movingLines.length > 0 && (
                        <span className="text-xs text-amber-500">
                          {hexResult.movingLines.map(position => [t('lineInitial'), t('lineSecond'), t('lineThird'), t('lineFourth'), t('lineFifth'), t('lineTop')][position - 1]).join(', ')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 mt-1.5">{formatDate(item.createdAt)}</p>
                  </div>

                  <div className={cn(
                    'shrink-0 text-stone-300 transition-transform duration-200',
                    isSelected && 'rotate-180'
                  )}>
                    ▼
                  </div>
                </div>

                {isSelected && selectedItem?.id === item.id && (
                  <div className="border-t border-amber-100 px-4 py-4 space-y-4 bg-amber-50/30">
                    {isLegacyCasting && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-900">
                        {t('legacyWarning')}
                      </div>
                    )}
                    {!isLegacyCasting && selectedItem.integratedReading && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 mb-2">{t('integratedReading')}</h4>
                        <div className="text-sm text-stone-600 leading-relaxed prose prose-stone prose-sm max-w-none">
                          <SafeMarkdown>{selectedItem.integratedReading}</SafeMarkdown>
                        </div>
                      </div>
                    )}
                    {!isLegacyCasting && selectedItem.hexagramReading && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 mb-2">{t('hexagramReading')}</h4>
                        <div className="text-sm text-stone-600 leading-relaxed prose prose-stone prose-sm max-w-none">
                          <SafeMarkdown>{selectedItem.hexagramReading}</SafeMarkdown>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        navigate('/');
                      }}
                      className="text-xs text-amber-600 hover:text-amber-800 transition-colors"
                    >
                      {t('divineAgain')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-stone-400 text-xs mt-8">
        {t('culturalDisclaimer')}
      </p>
    </div>
  );
}
