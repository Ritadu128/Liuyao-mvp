import { ExternalLink, Heart, QrCode } from 'lucide-react';
import { FANG_SONG } from '@/components/ScrollUI';
import { PUBLIC_CONFIG } from '@/lib/publicConfig';

function PaymentPlaceholder({ label }: { label: '微信二维码' | '支付宝二维码' }) {
  return (
    <div className="flex-1 min-w-0 rounded-sm p-3 text-center" style={{ background: 'rgba(255, 250, 232, 0.72)', border: '1px dashed rgba(160, 110, 35, 0.35)' }}>
      <div className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-sm" style={{ background: 'rgba(124, 92, 58, 0.08)', color: 'rgba(113, 78, 33, 0.65)' }}>
        <QrCode size={31} strokeWidth={1.25} aria-hidden="true" />
      </div>
      <p className="text-[0.7rem] tracking-[0.12em]" style={{ fontFamily: FANG_SONG, color: '#6f522f' }}>{label}</p>
      <p className="mt-1 text-[0.62rem] leading-relaxed" style={{ fontFamily: FANG_SONG, color: 'rgba(92, 65, 33, 0.62)' }}>待作者提供收款码</p>
    </div>
  );
}

/** 非强制性支持区。二维码和 Ko-fi 链接必须由项目作者提供，默认只显示明确占位。 */
export function SupportAuthor() {
  return (
    <section data-export-ignore="true" className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(175, 135, 55, 0.14)' }} aria-label="随喜支持作者">
      <div className="flex items-center justify-center gap-2 text-center">
        <Heart size={14} strokeWidth={1.4} style={{ color: 'rgba(139, 92, 38, 0.72)' }} aria-hidden="true" />
        <p className="text-[0.78rem] tracking-[0.12em]" style={{ fontFamily: FANG_SONG, color: '#76521f' }}>随喜支持作者</p>
      </div>
      <p className="mx-auto mt-2 max-w-sm text-center text-[0.7rem] leading-relaxed" style={{ fontFamily: FANG_SONG, color: 'rgba(91, 66, 35, 0.68)' }}>
        如果这个项目对你有帮助，欢迎随喜支持作者。完全自愿，不影响任何功能使用。
      </p>

      <div className="mt-3 flex gap-3">
        <PaymentPlaceholder label="微信二维码" />
        <PaymentPlaceholder label="支付宝二维码" />
      </div>

      {PUBLIC_CONFIG.kofiUrl ? (
        <a
          href={PUBLIC_CONFIG.kofiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-sm text-[0.75rem] tracking-[0.12em] transition-colors hover:bg-amber-50"
          style={{ fontFamily: FANG_SONG, color: '#76521f', border: '1px solid rgba(160, 110, 35, 0.3)', background: 'rgba(255, 250, 232, 0.55)' }}
        >
          在 Ko-fi 支持作者 <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : (
        <div className="mt-3 rounded-sm px-3 py-2 text-center text-[0.67rem]" style={{ fontFamily: FANG_SONG, color: 'rgba(91, 66, 35, 0.62)', border: '1px dashed rgba(160, 110, 35, 0.28)' }}>
          Ko-fi 链接待作者提供后启用
        </div>
      )}
    </section>
  );
}
