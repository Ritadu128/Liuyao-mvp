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
    const res = await fetch('/data/hexagrams_map.json');
    cachedMap = await res.json();
  }
  return cachedMap!.hexagrams[bits] ?? null;
}

/**
 * 根据 key（如 "01"）加载经文数据
 */
export async function loadTextData(key: string): Promise<TextData | null> {
  if (cachedTexts[key]) return cachedTexts[key]!;
  try {
    const res = await fetch(`/data/texts/${key}.json`);
    if (!res.ok) return null;
    const data: TextData = await res.json();
    cachedTexts[key] = data;
    return data;
  } catch {
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
