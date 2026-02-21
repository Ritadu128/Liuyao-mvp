import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useDivination } from '@/contexts/DivinationContext';
import { rebuildHexagram } from '@/lib/liuyao';
import type { LineValue } from '@/lib/liuyao';
import { HexagramDisplay } from '@/components/HexagramLine';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Streamdown } from 'streamdown';

export default function HistoryPage() {
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: list, isLoading } = trpc.reading.list.useQuery({ limit: 30 });
  const { data: detail } = trpc.reading.getById.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null }
  );

  const formatDate = (d: Date | string) => {
    const date = new Date(d);
    return date.toLocaleDateString('zh-CN', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-6">
      {/* 顶部 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-stone-400 hover:text-stone-600 text-sm transition-colors"
        >
          ← 返回
        </button>
        <h1 className="text-lg font-medium text-stone-700 tracking-wide">占卜历史</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      ) : !list || list.length === 0 ? (
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
          {list.map(item => {
            const lines = JSON.parse(item.linesJson) as LineValue[];
            const hexResult = rebuildHexagram(lines);
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
                {/* 列表项头部 */}
                <div className="p-4 flex gap-4 items-start">
                  {/* 卦象缩略图 */}
                  <div className="shrink-0 w-16">
                    <HexagramDisplay
                      lines={hexResult.lines}
                      movingLines={hexResult.movingLines}
                      size="sm"
                    />
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-700 text-sm font-medium truncate mb-1">
                      {item.question}
                    </p>
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
                      {hexResult.movingLines.length > 0 && (
                        <span className="text-xs text-amber-500">
                          {hexResult.movingLines.map(p => ['初','二','三','四','五','上'][p-1] + '爻').join(' ')} 动
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 mt-1.5">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <div className={cn(
                    'shrink-0 text-stone-300 transition-transform duration-200',
                    isSelected && 'rotate-180'
                  )}>
                    ▼
                  </div>
                </div>

                {/* 展开详情 */}
                {isSelected && detail && detail.id === item.id && (
                  <div className="border-t border-amber-100 px-4 py-4 space-y-4 bg-amber-50/30">
                    {detail.integratedReading && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 mb-2">综合解读</h4>
                        <div className="text-sm text-stone-600 leading-relaxed prose prose-stone prose-sm max-w-none">
                          <Streamdown>{detail.integratedReading}</Streamdown>
                        </div>
                      </div>
                    )}
                    {detail.hexagramReading && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 mb-2">卦象解读</h4>
                        <div className="text-sm text-stone-600 leading-relaxed prose prose-stone prose-sm max-w-none">
                          <Streamdown>{detail.hexagramReading}</Streamdown>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
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
