import { cn } from '@/lib/utils';
import type { LineValue } from '@/lib/liuyao';
import { getLineDisplay } from '@/lib/liuyao';

interface HexagramLineProps {
  value: LineValue;
  position: number; // 1-6，从下到上
  isMoving?: boolean;
  animate?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function HexagramLine({ value, position, animate = false, size = 'md' }: HexagramLineProps) {
  const display = getLineDisplay(value);
  const sizeMap = {
    sm: { bar: 'h-1', gap: 'gap-1.5', text: 'text-xs' },
    md: { bar: 'h-1.5', gap: 'gap-2', text: 'text-sm' },
    lg: { bar: 'h-2', gap: 'gap-2.5', text: 'text-base' },
  };
  const s = sizeMap[size];

  return (
    <div className={cn('flex items-center', s.gap, animate && 'animate-fade-in')}>
      {/* 爻线图形 */}
      <div className="flex items-center gap-1 flex-1">
        {display.isYang ? (
          // 阳爻：实线
          <div className={cn('flex-1 rounded-full', s.bar,
            display.isMoving ? 'bg-amber-500' : 'bg-stone-700'
          )} />
        ) : (
          // 阴爻：断线
          <div className="flex-1 flex gap-1.5">
            <div className={cn('flex-1 rounded-full', s.bar,
              display.isMoving ? 'bg-amber-500' : 'bg-stone-700'
            )} />
            <div className={cn('flex-1 rounded-full', s.bar,
              display.isMoving ? 'bg-amber-500' : 'bg-stone-700'
            )} />
          </div>
        )}
        {/* 动爻标记 */}
        {display.isMoving && (
          <div className={cn('shrink-0 font-bold text-amber-500', s.text)}>
            {value === 9 ? '○' : '×'}
          </div>
        )}
      </div>
      {/* 爻位标注 */}
      <div className={cn('shrink-0 text-stone-400 w-8 text-right', s.text)}>
        {getPositionLabel(position)}
      </div>
    </div>
  );
}

function getPositionLabel(pos: number): string {
  const labels = ['初', '二', '三', '四', '五', '上'];
  return labels[pos - 1] ?? '';
}

/**
 * 完整卦象显示（6爻，从下到上）
 */
interface HexagramDisplayProps {
  lines: LineValue[];
  movingLines?: number[];
  size?: 'sm' | 'md' | 'lg';
  showPosition?: boolean;
  animate?: boolean;
}

export function HexagramDisplay({ lines, movingLines = [], size = 'md', animate = false }: HexagramDisplayProps) {
  // 从上到下显示（爻6在上，爻1在下）
  const reversed = [...lines].reverse();
  const reversedPositions = [6, 5, 4, 3, 2, 1];

  const sizeMap = {
    sm: 'gap-1.5 py-2',
    md: 'gap-2.5 py-3',
    lg: 'gap-3 py-4',
  };

  return (
    <div className={cn('flex flex-col', sizeMap[size])}>
      {reversed.map((value, idx) => {
        const position = reversedPositions[idx]!;
        return (
          <HexagramLine
            key={position}
            value={value}
            position={position}
            isMoving={movingLines.includes(position)}
            animate={animate}
            size={size}
          />
        );
      })}
    </div>
  );
}
