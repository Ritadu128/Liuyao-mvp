import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { getLocalReadings, type LocalReading } from '@/hooks/useLocalHistory';
import { rebuildHexagram } from '@/lib/liuyao';
import type { LineValue } from '@/lib/liuyao';
import { HexagramDisplay } from '@/components/HexagramLine';
import { cn } from '@/lib/utils';
import { Streamdown } from 'streamdown';

export default function HistoryPage() {
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 匿名版本只读取当前浏览器的 localStorage；刷新或重新打开页面后仍可恢复。
  const readings = useMemo<LocalReading[]>(() => getLocalReadings(), []);

  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return readings.find(reading => reading.id === selectedId) ?? null;
  }, [readings, selectedId]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间未知';
    return date.toLocaleDateString('zh-CN', {
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
          ← 返回
        </button>
        <h1 className="text-lg font-medium text-stone-700 tracking-wide">占卜历史</h1>
        <span className="ml-auto text-xs text-stone-400">仅保存在本浏览器</span>
      </div>

      {readings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📜</div>
          <p className="text-stone-400 text-sm">暂无占卜记录</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-amber-600 text-sm hover:text-amber-800 transition-colors"
          >
            开始第一次占卜 →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {readings.map(item => {
            const hexResult = getHexagram(item.linesJson);
            const isSelected = selectedId === item.id;

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
                      <div className="h-16 flex items-center justify-center text-xs text-stone-400">卦象缺失</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-stone-700 text-sm font-medium truncate mb-1">{item.question}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        {item.originalName}
                      </span>
                      {item.changedName && (
                        <>
                          <span className="text-xs text-stone-400">→</span>
                          <span className="text-xs text-stone-600 bg-stone-50 px-2 py-0.5 rounded-full border border-stone-200">
                            {item.changedName}
                          </span>
                        </>
                      )}
                      {hexResult && hexResult.movingLines.length > 0 && (
                        <span className="text-xs text-amber-500">
                          {hexResult.movingLines.map(position => ['初', '二', '三', '四', '五', '上'][position - 1] + '爻').join(' ')} 动
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
                    {selectedItem.integratedReading && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 mb-2">综合解读</h4>
                        <div className="text-sm text-stone-600 leading-relaxed prose prose-stone prose-sm max-w-none">
                          <Streamdown>{selectedItem.integratedReading}</Streamdown>
                        </div>
                      </div>
                    )}
                    {selectedItem.hexagramReading && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 mb-2">卦象解读</h4>
                        <div className="text-sm text-stone-600 leading-relaxed prose prose-stone prose-sm max-w-none">
                          <Streamdown>{selectedItem.hexagramReading}</Streamdown>
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
                      重新占卜 →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-stone-400 text-xs mt-8">
        本结果仅供文化研究与娱乐参考，请合理看待
      </p>
    </div>
  );
}
