import { useState, useEffect } from 'react';
import type { HexagramInfo, TextData } from '@/contexts/DivinationContext';

interface HexagramsMap {
  meta: { version: string };
  trigrams: Record<string, { name: string; symbol: string; nature: string }>;
  hexagrams: Record<string, HexagramInfo>;
}

let cachedMap: HexagramsMap | null = null;
const cachedTexts: Record<string, TextData> = {};

/**
 * 根据 bits（6位二进制字符串）查找卦象信息
 */
export async function lookupHexagram(bits: string): Promise<HexagramInfo | null> {
  if (!cachedMap) {
    const res = await fetch('/data/hexagrams_map.json', { cache: 'no-store' });
    cachedMap = await res.json();
  }
  return cachedMap!.hexagrams[bits] ?? null;
}

/**
 * 根据 key（如 "01"）加载经文数据
 * - 使用 cache: 'no-store' 避免浏览器缓存
 * - fetch 成功后 console.log 调试信息，并挂载到 window.__hexDebug[key]
 */
export async function loadTextData(key: string): Promise<TextData | null> {
  if (cachedTexts[key]) {
    const cached = cachedTexts[key]!;
    console.log(
      '[HexagramData] 命中内存缓存',
      '\n  key      :', key,
      '\n  guaCi.length:', cached.gua_ci?.length ?? 0,
    );
    return cached;
  }

  const url = `/data/texts/${key}.json`;

  try {
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      console.error('[HexagramData] fetch 失败 | url:', url, '| status:', res.status);
      return null;
    }

    const data: TextData = await res.json();
    cachedTexts[key] = data;

    // ── 调试日志 ──────────────────────────────────────────────────────────
    const guaCiPreview = (data.gua_ci ?? '').slice(0, 60);
    console.log(
      '[HexagramData] ✅ fetch 成功',
      '\n  key         :', key,
      '\n  url         :', url,
      '\n  name        :', data.name,
      '\n  guaCi[0:60] :', guaCiPreview,
      '\n  guaCi.length:', data.gua_ci?.length ?? 0,
    );

    // 挂载到 window.__hexDebug 方便 DevTools 检查
    (window as any).__hexDebug = (window as any).__hexDebug ?? {};
    (window as any).__hexDebug[key] = {
      key,
      url,
      name: data.name,
      guaCiPreview,
      guaCiLength: data.gua_ci?.length ?? 0,
      fetchedAt: new Date().toISOString(),
    };

    return data;
  } catch (e) {
    console.error('[HexagramData] fetch 异常 | url:', url, '| error:', e);
    return null;
  }
}

/**
 * Hook：加载本卦和变卦信息
 */
export function useHexagramLookup(originalBits: string, changedBits: string) {
  const [originalHexagram, setOriginalHexagram] = useState<HexagramInfo | null>(null);
  const [changedHexagram, setChangedHexagram] = useState<HexagramInfo | null>(null);
  const [originalText, setOriginalText] = useState<TextData | null>(null);
  const [changedText, setChangedText] = useState<TextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!originalBits) return;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const orig = await lookupHexagram(originalBits);
        setOriginalHexagram(orig);

        if (orig) {
          const origText = await loadTextData(orig.key);
          setOriginalText(origText);
        }

        // 变卦（只有有动爻时才有变卦）
        if (changedBits && changedBits !== originalBits) {
          const changed = await lookupHexagram(changedBits);
          setChangedHexagram(changed);
          if (changed) {
            const changedText = await loadTextData(changed.key);
            setChangedText(changedText);
          }
        } else {
          setChangedHexagram(null);
          setChangedText(null);
        }
      } catch (e) {
        setError('卦象数据加载失败');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [originalBits, changedBits]);

  return { originalHexagram, changedHexagram, originalText, changedText, loading, error };
}
