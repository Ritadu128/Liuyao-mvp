import { type RefObject, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useDivination } from '@/contexts/DivinationContext';
import { useHexagramLookup } from '@/hooks/useHexagramData';
import { HexagramDisplay } from '@/components/HexagramLine';
import { cn } from '@/lib/utils';
import { ReadingStreamError, streamReading } from '@/lib/readingStream';
import { SafeMarkdown } from '@/components/SafeMarkdown';
import {
  FANG_SONG, SONG,
  CloudPattern, ScrollCard, ScrollDivider, WaveLine, AncientTabs,
  AncientLoading, Disclaimer,
} from '@/components/ScrollUI';
import { addLocalReading } from '@/hooks/useLocalHistory';
import { ReadingExportActions } from '@/components/ReadingExport';
import { SupportAuthor } from '@/components/SupportAuthor';
import { TurnstileChallenge } from '@/components/TurnstileChallenge';
import { useI18n } from '@/i18n/I18nContext';
import { localizeHexagram } from '@/i18n/hexagrams';

type TabType = 'integrated' | 'hexagram';

export default function ResultPage() {
  const { locale, t } = useI18n();
  const [, navigate] = useLocation();
  const { state, setOriginalHexagram, setChangedHexagram, setOriginalText, setChangedText,
    setIntegratedReading, setHexagramReading, setIsLoadingReading, setSavedReadingId } = useDivination();
  const [activeTab, setActiveTab] = useState<TabType>('integrated');
  const [revealed, setRevealed] = useState(false);
  const [streamError, setStreamError] = useState<string | undefined>();
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | undefined>();
  const [turnstileError, setTurnstileError] = useState<string | undefined>();
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const exportTargetRef = useRef<HTMLDivElement>(null);
  const requestStartedRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const integratedBufferRef = useRef('');
  const hexagramBufferRef = useRef('');
  const previousLocaleRef = useRef(locale);

  useEffect(() => {
    if (previousLocaleRef.current === locale) return;
    previousLocaleRef.current = locale;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    requestStartedRef.current = false;
    integratedBufferRef.current = '';
    hexagramBufferRef.current = '';
    setIntegratedReading('');
    setHexagramReading('');
    setIsLoadingReading(false);
    setStreamError(undefined);
    setTurnstileError(undefined);
  }, [locale, setHexagramReading, setIntegratedReading, setIsLoadingReading]);
  useEffect(() => {
    if (!state.hexagramResult) navigate('/');
  }, [state.hexagramResult, navigate]);

  const hexResult = state.hexagramResult;

  const { originalHexagram, changedHexagram, originalText, changedText, loading: hexLoading } =
    useHexagramLookup(
      hexResult?.originalBits ?? '',
      hexResult?.changedBits ?? ''
    );

  useEffect(() => { if (originalHexagram) setOriginalHexagram(originalHexagram); }, [originalHexagram]);
  useEffect(() => { if (changedHexagram !== undefined) setChangedHexagram(changedHexagram); }, [changedHexagram]);
  useEffect(() => {
    if (originalText) setOriginalText(originalText);
  }, [originalText, originalHexagram]);
  useEffect(() => { if (changedText !== undefined) setChangedText(changedText); }, [changedText]);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!hexLoading && originalHexagram && originalText && hexResult &&
      !state.integratedReading && !state.isLoadingReading && !requestStartedRef.current) {
      requestStartedRef.current = true;
      setIsLoadingReading(true);
      setStreamError(undefined);
      setTurnstileError(undefined);
      integratedBufferRef.current = '';
      hexagramBufferRef.current = '';
      const controller = new AbortController();
      streamAbortRef.current = controller;

      void streamReading({
        locale,
        question: state.question,
        originalKey: originalHexagram.key,
        originalName: originalHexagram.name,
        originalBits: hexResult.originalBits,
        changedKey: changedHexagram?.key ?? null,
        changedName: changedHexagram?.name ?? null,
        changedBits: hexResult.changedBits !== hexResult.originalBits ? hexResult.changedBits : null,
        movingLines: hexResult.movingLines,
        guaCi: originalText.gua_ci,
        xiangYue: originalText.xiang_yue,
        yaoCi: hexResult.movingLines.map(pos => ({
          position: pos,
          text: originalText.yao_ci[String(pos)] ?? ''
        })),
        linesJson: JSON.stringify(hexResult.lines),
        turnstileToken,
      }, {
        signal: controller.signal,
        onDelta: (section, text) => {
          if (section === 'integrated') {
            integratedBufferRef.current += text;
            setIntegratedReading(integratedBufferRef.current);
          } else {
            hexagramBufferRef.current += text;
            setHexagramReading(hexagramBufferRef.current);
          }
        },
        onReset: () => {
          integratedBufferRef.current = '';
          hexagramBufferRef.current = '';
          setIntegratedReading('');
          setHexagramReading('');
        },
      }).then(data => {
        setTurnstileSiteKey(undefined);
        setTurnstileToken(undefined);
        setIntegratedReading(data.integratedReading);
        setHexagramReading(data.hexagramReading);
        if (data.readingId) setSavedReadingId(data.readingId);

        // 匿名版本始终保存到当前浏览器，避免 OAuth 或服务端历史成为使用前提。
        addLocalReading({
          locale,
          question: state.question,
          linesJson: JSON.stringify(hexResult.lines),
          originalKey: originalHexagram.key,
          originalName: originalHexagram.name,
          originalBits: hexResult.originalBits,
          changedKey: changedHexagram?.key ?? null,
          changedName: changedHexagram?.name ?? null,
          changedBits: hexResult.changedBits !== hexResult.originalBits ? hexResult.changedBits : null,
          movingLinesJson: JSON.stringify(hexResult.movingLines),
          integratedReading: data.integratedReading,
          hexagramReading: data.hexagramReading,
        });
      }).catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof ReadingStreamError
          && (error.code === 'TURNSTILE_REQUIRED' || error.code === 'TURNSTILE_FAILED')) {
          requestStartedRef.current = false;
          setTurnstileSiteKey(error.siteKey);
          setTurnstileToken(undefined);
          setTurnstileError(error.code === 'TURNSTILE_FAILED' ? error.message : undefined);
          return;
        }
        const message = error instanceof Error ? error.message : t('readingFailed');
        setStreamError(message);
        console.error('[Reading] stream error:', message);
      }).finally(() => {
        if (!controller.signal.aborted) setIsLoadingReading(false);
        if (streamAbortRef.current === controller) streamAbortRef.current = null;
      });
    }
  }, [hexLoading, originalHexagram, originalText, changedHexagram, hexResult, turnstileToken, locale]);

  useEffect(() => () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);

  if (!hexResult) return null;

  const isLoading = hexLoading || state.isLoadingReading;
  const displayOriginal = localizeHexagram(originalHexagram, locale);
  const displayChanged = localizeHexagram(changedHexagram, locale);

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-paper, #faf6ed)' }}>
      {/* 云纹背景（固定） */}
      <div className="fixed inset-0 pointer-events-none">
        <CloudPattern opacity={0.03} />
      </div>

      {/* 背景大字 */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <span className="absolute top-4 left-4 text-[8rem] leading-none text-amber-900/[0.04]"
          style={{ fontFamily: SONG, fontWeight: 700 }}>{locale === 'zh-CN' ? '卦' : 'I'}</span>
        <span className="absolute bottom-4 right-4 text-[6rem] leading-none text-amber-900/[0.03]"
          style={{ fontFamily: SONG, fontWeight: 700 }}>{locale === 'zh-CN' ? '象' : 'Ching'}</span>
      </div>

      {/* 主内容 */}
      <div className={cn(
        'relative z-10 min-h-screen flex flex-col transition-all duration-700',
        revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      )} style={{ background: 'transparent' }}>

        {/* 顶部导航栏（书卷风格） */}
        <div
          className="sticky top-0 z-20 backdrop-blur-sm px-4 py-3"
          style={{
            background: 'rgba(255,251,238,0.92)',
            borderBottom: '1px solid rgba(175,135,55,0.18)',
            boxShadow: '0 2px 12px rgba(100,70,15,0.08)',
          }}
        >
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigate('/')}
                className="text-amber-700/55 hover:text-amber-700/80 text-[0.78rem] tracking-[0.15em] transition-colors"
                style={{ fontFamily: FANG_SONG }}
              >
                {t('restart')}
              </button>
              <div className="inline-flex items-center gap-2">
                <WaveLine />
                <span className="text-amber-700/50 text-[0.72rem] tracking-[0.35em]" style={{ fontFamily: FANG_SONG }}>
                  {t('readingTitle')}
                </span>
                <WaveLine flip />
              </div>
              <button
                onClick={() => navigate('/history')}
                className="text-amber-600/60 hover:text-amber-700/80 text-[0.78rem] tracking-[0.1em] transition-colors"
                style={{ fontFamily: FANG_SONG }}
              >
                {t('history')}
              </button>
            </div>

            {/* 古风 Tab */}
            <AncientTabs
              tabs={[
                { key: 'integrated', label: t('integratedReading') },
                { key: 'hexagram', label: t('hexagramReading') },
              ]}
              active={activeTab}
              onChange={k => setActiveTab(k as TabType)}
            />
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5">
          <div ref={exportTargetRef} className="space-y-4" style={{ background: '#faf6ed' }}>
          {/* 问题回顾 */}
          <div
            className="px-4 py-3"
            style={{
              background: 'linear-gradient(to right, rgba(255,248,225,0.7), rgba(255,252,240,0.85), rgba(255,248,225,0.7))',
              border: '1px solid rgba(175,135,55,0.18)',
              borderRadius: '1px',
              borderLeft: '3px solid rgba(160,100,35,0.4)',
            }}
          >
            <p className="text-[0.7rem] text-amber-700/55 mb-1 tracking-[0.25em]" style={{ fontFamily: FANG_SONG }}>
              {t('questionAsked')}
            </p>
            <p className="text-stone-700 text-[0.88rem] leading-relaxed tracking-wide" style={{ fontFamily: FANG_SONG }}>
              {state.question}
            </p>
          </div>

          {/* 卦象信息卡 */}
          <ScrollCard>
            <ScrollDivider label={t('originalAndChanged')} />
            <div className="mt-4">
              <div className="flex gap-6 items-start">
                {/* 本卦 */}
                <div className="flex-1">
                  <div className="text-xs text-stone-400/70 mb-2 text-center tracking-widest" style={{ fontFamily: FANG_SONG }}>
                    {t('originalHexagram')}
                  </div>
                  {hexLoading ? (
                    <div className="h-32 flex items-center justify-center">
                      <div className="text-2xl animate-spin" style={{ animationDuration: '3s', color: 'rgba(160,100,35,0.4)' }}>☯</div>
                    </div>
                  ) : (
                    <>
                      <HexagramDisplay lines={hexResult.lines} movingLines={hexResult.movingLines} size="md" />
                      <div className="text-center mt-2">
                        <span className="text-stone-700 text-sm tracking-widest" style={{ fontFamily: SONG }}>
                          {displayOriginal?.name ?? t('noReading')}
                        </span>
                        {originalHexagram && (
                          <div className="text-xs text-stone-400/65 mt-0.5 tracking-wide" style={{ fontFamily: FANG_SONG }}>
                            {t('aboveBelow', { upper: displayOriginal?.upper ?? '', lower: displayOriginal?.lower ?? '' })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 变卦 */}
                {hexResult.hasMoving && (
                  <>
                    <div className="flex flex-col items-center justify-center pt-8">
                      <div className="text-amber-600/60 text-base" style={{ fontFamily: FANG_SONG }}>→</div>
                      <div className="text-xs text-stone-400/50 mt-1 tracking-widest" style={{ fontFamily: FANG_SONG }}>{t('change')}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-stone-400/70 mb-2 text-center tracking-widest" style={{ fontFamily: FANG_SONG }}>
                        {t('changedHexagram')}
                      </div>
                      {hexLoading ? (
                        <div className="h-32 flex items-center justify-center">
                          <div className="text-2xl animate-spin" style={{ animationDuration: '3s', color: 'rgba(160,100,35,0.4)' }}>☯</div>
                        </div>
                      ) : (
                        <>
                          <ChangedHexagramDisplay
                            originalLines={hexResult.lines}
                            changedBits={hexResult.changedBits}
                            movingLines={hexResult.movingLines}
                          />
                          <div className="text-center mt-2">
                            <span className="text-stone-700 text-sm tracking-widest" style={{ fontFamily: SONG }}>
                              {displayChanged?.name ?? t('noReading')}
                            </span>
                            {changedHexagram && (
                              <div className="text-xs text-stone-400/65 mt-0.5 tracking-wide" style={{ fontFamily: FANG_SONG }}>
                                {t('aboveBelow', { upper: displayChanged?.upper ?? '', lower: displayChanged?.lower ?? '' })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 动爻标注 */}
              {hexResult.movingLines.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(175,135,55,0.12)' }}>
                  <span className="text-xs text-stone-400/60 tracking-widest" style={{ fontFamily: FANG_SONG }}>
                    {t('movingLines')}
                  </span>
                  {hexResult.movingLines.map(pos => (
                    <span
                      key={pos}
                      className="inline-block ml-1 text-xs px-2 py-0.5"
                      style={{
                        fontFamily: FANG_SONG,
                        background: 'rgba(255,235,180,0.6)',
                        color: '#7c4a10',
                        border: '1px solid rgba(175,120,35,0.25)',
                      }}
                    >
                      {[t('lineInitial'), t('lineSecond'), t('lineThird'), t('lineFourth'), t('lineFifth'), t('lineTop')][pos - 1]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </ScrollCard>

          {turnstileSiteKey && !turnstileToken && (
            <TurnstileChallenge
              siteKey={turnstileSiteKey}
              error={turnstileError}
              onVerified={token => {
                setTurnstileError(undefined);
                setTurnstileToken(token);
              }}
            />
          )}

          {/* Tab 内容 */}
          {activeTab === 'integrated' && (
            <IntegratedTab
              reading={state.integratedReading}
              isLoading={isLoading}
              error={streamError}
              exportTargetRef={exportTargetRef}
            />
          )}

          {activeTab === 'hexagram' && (
            <HexagramTab
              reading={state.hexagramReading}
              originalText={state.originalText}
              changedText={state.changedText}
              movingLines={hexResult.movingLines}
              isLoading={isLoading}
              error={streamError}
              exportTargetRef={exportTargetRef}
              locale={locale}
            />
          )}
          </div>

          {/* 支持作者与解读、导出内容分离，且永不进入长图。 */}
          <div className="mt-4">
            <ScrollCard>
              <SupportAuthor />
            </ScrollCard>
          </div>
          <div className="mt-4">
            <Disclaimer />
          </div>
        </div>

        <div className="pb-6" />
      </div>
    </div>
  );
}

// ─── 变卦显示 ──────────────────────────────────────────────────
function ChangedHexagramDisplay({
  originalLines, changedBits, movingLines,
}: {
  originalLines: number[];
  changedBits: string;
  movingLines: number[];
}) {
  const changedLines = originalLines.map((val, i) => {
    const pos = i + 1;
    if (movingLines.includes(pos)) {
      return val === 9 ? 8 : 7;
    }
    return val;
  }) as (6 | 7 | 8 | 9)[];

  return <HexagramDisplay lines={changedLines} movingLines={[]} size="md" />;
}

// ─── 综合解读 Tab ──────────────────────────────────────────────
function IntegratedTab({ reading, isLoading, error, exportTargetRef }: {
  reading: string;
  isLoading: boolean;
  error?: string;
  exportTargetRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  return (
    <ScrollCard>
      <ScrollDivider label={t('integratedReading')} />
      <div className="mt-4 min-h-[160px]">
        {reading ? (
          <>
            <div
              className="leading-[2.2] prose prose-stone prose-sm max-w-none ancient-reading-content"
              style={{ fontFamily: FANG_SONG, fontSize: '0.9rem', color: '#3d2e1a' }}
            >
              <SafeMarkdown>{reading}</SafeMarkdown>
              {isLoading && <span className="streaming-caret" aria-label={t('continuingGeneration')} />}
            </div>
            {error && <PartialReadingWarning error={error} />}
          </>
        ) : error ? (
          <div className="py-6 text-center space-y-2" style={{ fontFamily: FANG_SONG }}>
            <div className="text-2xl">{error.includes('次数已达上限') ? '☄' : '✶'}</div>
            <div className="text-sm tracking-wide" style={{ color: '#8b5a2b' }}>{error}</div>
          </div>
        ) : isLoading ? <AncientLoading text={t('generatingIntegrated')} /> : null}
      </div>
      <ReadingExportActions
        targetRef={exportTargetRef}
        filePrefix={t('exportIntegratedPrefix')}
        disabled={!reading || isLoading || Boolean(error)}
      />
    </ScrollCard>
  );
}

// ─── 卦象解读 Tab ──────────────────────────────────────────────
function HexagramTab({ reading, originalText, changedText, movingLines, isLoading, error, exportTargetRef, locale }: {
  reading: string;
  originalText: any;
  changedText: any;
  movingLines: number[];
  isLoading: boolean;
  error?: string;
  exportTargetRef: RefObject<HTMLDivElement | null>;
  locale: 'zh-CN' | 'en-US';
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      {/* LLM 卦象解读 */}
      <ScrollCard>
        <ScrollDivider label={t('hexagramReading')} />
        <div className="mt-4 min-h-[160px]">
          {reading ? (
            <>
              <div
                className="leading-[2.2] prose prose-stone prose-sm max-w-none ancient-reading-content"
                style={{ fontFamily: FANG_SONG, fontSize: '0.9rem', color: '#3d2e1a' }}
              >
                <SafeMarkdown>{reading}</SafeMarkdown>
                {isLoading && <span className="streaming-caret" aria-label={t('continuingGeneration')} />}
              </div>
              {error && <PartialReadingWarning error={error} />}
            </>
          ) : error ? (
            <div className="py-6 text-center space-y-2" style={{ fontFamily: FANG_SONG }}>
              <div className="text-2xl">{error.includes('次数已达上限') ? '☄' : '✶'}</div>
              <div className="text-sm tracking-wide" style={{ color: '#8b5a2b' }}>{error}</div>
            </div>
          ) : isLoading ? <AncientLoading text={t('generatingHexagram')} /> : null}
        </div>
        <ReadingExportActions
          targetRef={exportTargetRef}
          filePrefix={t('exportHexagramPrefix')}
          disabled={!reading || isLoading || Boolean(error)}
        />
      </ScrollCard>

      {/* 经文原文 */}
      {originalText && locale === 'zh-CN' && (
        <div data-export-ignore="true">
          <ScrollCard>
            <ScrollDivider label={t('classicOriginal', { name: originalText.name })} />
            <div className="mt-4 space-y-4">
              <ClassicSection label={t('guaCi')} content={originalText.gua_ci} />
              <ClassicSection label={t('xiangYue')} content={originalText.xiang_yue} />
              {movingLines.length > 0 && (
                <div>
                  <span
                    className="text-xs tracking-widest"
                    style={{ fontFamily: FANG_SONG, color: 'rgba(160,100,35,0.8)' }}
                  >
                    {t('movingLineText')}
                  </span>
                  <div
                    className="mt-1 h-px"
                    style={{ background: 'linear-gradient(to right, rgba(175,130,50,0.3), transparent)' }}
                  />
                  <div className="mt-2 space-y-2">
                    {movingLines.map(pos => (
                      <p key={pos} className="leading-relaxed" style={{ fontFamily: FANG_SONG, fontSize: '0.88rem', color: '#4a3520' }}>
                        <span style={{ color: 'rgba(160,100,35,0.9)' }}>
                          {[t('lineInitial'), t('lineSecond'), t('lineThird'), t('lineFourth'), t('lineFifth'), t('lineTop')][pos - 1]}：
                        </span>
                        {originalText.yao_ci[String(pos)]}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollCard>
        </div>
      )}
    </div>
  );
}

function PartialReadingWarning({ error }: { error: string }) {
  const { t } = useI18n();
  return (
    <div
      className="mt-5 px-3 py-2 text-xs leading-relaxed tracking-wide"
      style={{
        fontFamily: FANG_SONG,
        color: '#8b5a2b',
        background: 'rgba(255,248,225,0.72)',
        border: '1px solid rgba(175,120,35,0.2)',
      }}
    >
      {t('interruptedReading', { error })}
    </div>
  );
}

// ─── 经文段落 ──────────────────────────────────────────────────
function ClassicSection({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <span
        className="text-xs tracking-widest"
        style={{ fontFamily: FANG_SONG, color: 'rgba(160,100,35,0.8)' }}
      >
        {label}
      </span>
      <div
        className="mt-1 h-px"
        style={{ background: 'linear-gradient(to right, rgba(175,130,50,0.3), transparent)' }}
      />
      <p
        className="mt-2 leading-[2] tracking-wide"
        style={{ fontFamily: FANG_SONG, fontSize: '0.88rem', color: '#4a3520' }}
      >
        {content}
      </p>
    </div>
  );
}
