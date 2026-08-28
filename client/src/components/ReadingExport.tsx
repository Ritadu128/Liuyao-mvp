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
  // 部分桌面浏览器在事件循环稍后才真正读取 Blob；过早释放会得到空下载。
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

async function createReadingImage(target: HTMLElement) {
  // 不等待 document.fonts.ready：Google Fonts 在部分网络会长时间 pending，
  // 过去会让“保存长图”看起来完全没反应。导出使用当前可用字体并跳过
  // 跨域字体嵌入，系统宋体会作为稳定兜底。
  const images = Array.from(target.querySelectorAll('img'));
  await Promise.all(images.map(image => image.decode?.().catch(() => undefined)));

  const { width, height } = target.getBoundingClientRect();
  if (width < 1 || height < 1) throw new Error('导出内容尚未准备完成');
  const pixelRatio = calculateExportPixelRatio(width, height);
  const blob = await toBlob(target, {
    width: Math.ceil(width),
    height: Math.ceil(height),
    backgroundColor: '#faf6ed',
    cacheBust: false,
    pixelRatio,
    skipAutoScale: true,
    skipFonts: true,
    style: {
      margin: '0',
      transform: 'none',
    },
    filter: node => !(node instanceof HTMLElement && node.dataset.exportIgnore === 'true'),
  });
  if (!blob) throw new Error('浏览器未能生成图片');
  return blob;
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

  const beginGeneration = () => {
    setErrorMessage(null);
    setStatus('generating');
  };

  const failGeneration = (error: unknown) => {
    console.error('[ReadingExport] failed:', error);
    setErrorMessage(error instanceof Error ? error.message : '长图生成失败，请稍后重试');
    setStatus('error');
  };

  const saveLongImage = async () => {
    const target = targetRef.current;
    if (!target || disabled || status === 'generating') return;

    const fileName = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.png`;
    beginGeneration();
    try {
      const blob = await createReadingImage(target);
      downloadBlob(blob, fileName);
      setStatus('downloaded');
    } catch (error) {
      failGeneration(error);
    }
  };

  const shareLongImage = async () => {
    const target = targetRef.current;
    if (!target || disabled || status === 'generating') return;
    beginGeneration();
    try {
      const blob = await createReadingImage(target);
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

      // 浏览器不支持文件分享时仍保证用户能拿到 PNG。
      downloadBlob(blob, fileName);
      setStatus('downloaded');
    } catch (error) {
      failGeneration(error);
    }
  };

  const statusText = getStatusText(status, errorMessage);
  const canShare = typeof navigator.share === 'function';

  return (
    <div data-export-ignore="true" className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(175,135,55,0.14)' }}>
      <div className={canShare ? 'grid grid-cols-2 gap-2' : ''}>
        <button
          type="button"
          onClick={saveLongImage}
          disabled={disabled || status === 'generating'}
          className="w-full min-h-10 flex items-center justify-center gap-2 rounded-sm transition-colors"
          style={{
            fontFamily: FANG_SONG,
            fontSize: '0.78rem',
            letterSpacing: '0.12em',
            color: disabled || status === 'generating' ? 'rgba(120, 85, 20, 0.42)' : '#76521f',
            background: disabled || status === 'generating' ? 'rgba(180, 150, 90, 0.09)' : 'rgba(255, 247, 220, 0.7)',
            border: '1px solid rgba(160, 110, 35, 0.28)',
          }}
        >
          <Download size={15} className={status === 'generating' ? 'animate-pulse' : ''} />
          {status === 'generating' ? '生成中' : '保存长图'}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={shareLongImage}
            disabled={disabled || status === 'generating'}
            className="w-full min-h-10 flex items-center justify-center gap-2 rounded-sm transition-colors"
            style={{
              fontFamily: FANG_SONG,
              fontSize: '0.78rem',
              letterSpacing: '0.12em',
              color: disabled || status === 'generating' ? 'rgba(120, 85, 20, 0.42)' : '#76521f',
              background: disabled || status === 'generating' ? 'rgba(180, 150, 90, 0.09)' : 'rgba(255, 247, 220, 0.7)',
              border: '1px solid rgba(160, 110, 35, 0.28)',
            }}
          >
            <Share2 size={15} />
            分享长图
          </button>
        )}
      </div>
      <p aria-live="polite" className="min-h-4 mt-2 text-center text-[0.68rem] leading-relaxed" style={{ fontFamily: FANG_SONG, color: status === 'error' ? '#9a3412' : 'rgba(105, 77, 37, 0.62)' }}>
        {statusText ?? '电脑端保存 PNG；支持的手机浏览器可直接分享'}
      </p>
    </div>
  );
}
