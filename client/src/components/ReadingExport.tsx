import { type RefObject, useState } from 'react';
import { toBlob } from 'html-to-image';
import { Download, Share2 } from 'lucide-react';
import { FANG_SONG } from '@/components/ScrollUI';
import { calculateExportPixelRatio } from '@/lib/exportImage';

type ExportStatus = 'idle' | 'generating' | 'shared' | 'downloaded' | 'cancelled' | 'error';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function getStatusText(status: ExportStatus, errorMessage: string | null) {
  switch (status) {
    case 'generating': return '正在生成长图，请稍候…';
    case 'shared': return '已打开系统分享';
    case 'downloaded': return 'PNG 已开始下载';
    case 'cancelled': return '已取消分享';
    case 'error': return errorMessage ?? '长图生成失败，请稍后重试';
    default: return null;
  }
}

interface ReadingExportActionsProps {
  targetRef: RefObject<HTMLElement | null>;
  title: string;
  filePrefix: string;
  disabled?: boolean;
}

/**
 * 将指定的、无操作控件的解读内容导出为单张纵向 PNG。
 * 移动端优先调用 Web Share API；不可用时自动下载图片。
 */
export function ReadingExportActions({
  targetRef,
  title,
  filePrefix,
  disabled = false,
}: ReadingExportActionsProps) {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const exportAndShare = async () => {
    const target = targetRef.current;
    if (!target || disabled || status === 'generating') return;

    setErrorMessage(null);
    setStatus('generating');

    try {
      // 确保复制节点前，网页字体与图片解码均已尽可能完成。
      await document.fonts?.ready;
      const images = Array.from(target.querySelectorAll('img'));
      await Promise.all(images.map(image => image.decode?.().catch(() => undefined)));

      const { width, height } = target.getBoundingClientRect();
      if (width < 1 || height < 1) {
        throw new Error('导出内容尚未准备完成');
      }

      const pixelRatio = calculateExportPixelRatio(width, height);
      const blob = await toBlob(target, {
        backgroundColor: '#faf6ed',
        cacheBust: true,
        pixelRatio,
        // 关键：交由本组件控制缩放，不让库在超长内容上静默裁切。
        skipAutoScale: true,
        filter: node => !(node instanceof HTMLElement && node.dataset.exportIgnore === 'true'),
      });

      if (!blob) throw new Error('浏览器未能生成图片');

      const fileName = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData = { files: [file], title, text: '六爻占卜解读（仅供文化研究与娱乐参考）' };
      const canNativeShare = typeof navigator.share === 'function'
        && (typeof navigator.canShare !== 'function' || navigator.canShare(shareData));

      if (canNativeShare) {
        try {
          await navigator.share(shareData);
          setStatus('shared');
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === 'AbortError') {
            setStatus('cancelled');
            return;
          }
          // 浏览器宣称支持但实际失败时，仍为用户降级为本地 PNG。
        }
      }

      downloadBlob(blob, fileName);
      setStatus('downloaded');
    } catch (error) {
      console.error('[ReadingExport] failed:', error);
      setErrorMessage(error instanceof Error ? error.message : '长图生成失败，请稍后重试');
      setStatus('error');
    }
  };

  const statusText = getStatusText(status, errorMessage);

  return (
    <div data-export-ignore="true" className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(175,135,55,0.14)' }}>
      <button
        type="button"
        onClick={exportAndShare}
        disabled={disabled || status === 'generating'}
        className="w-full min-h-10 flex items-center justify-center gap-2 rounded-sm transition-colors"
        style={{
          fontFamily: FANG_SONG,
          fontSize: '0.78rem',
          letterSpacing: '0.14em',
          color: disabled || status === 'generating' ? 'rgba(120, 85, 20, 0.42)' : '#76521f',
          background: disabled || status === 'generating' ? 'rgba(180, 150, 90, 0.09)' : 'rgba(255, 247, 220, 0.7)',
          border: '1px solid rgba(160, 110, 35, 0.28)',
          cursor: disabled || status === 'generating' ? 'not-allowed' : 'pointer',
        }}
      >
        {status === 'generating' ? <Download size={15} className="animate-pulse" /> : <Share2 size={15} />}
        {status === 'generating' ? '生成长图中' : '保存／分享长图'}
      </button>
      <p aria-live="polite" className="min-h-4 mt-2 text-center text-[0.68rem] leading-relaxed" style={{ fontFamily: FANG_SONG, color: status === 'error' ? '#9a3412' : 'rgba(105, 77, 37, 0.62)' }}>
        {statusText ?? '手机端优先打开系统分享；其他浏览器将下载 PNG'}
      </p>
    </div>
  );
}
