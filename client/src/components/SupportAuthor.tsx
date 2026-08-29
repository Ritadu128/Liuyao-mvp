import { useState } from 'react';
import { ExternalLink, Heart, QrCode } from 'lucide-react';
import { FANG_SONG } from '@/components/ScrollUI';
import { PUBLIC_CONFIG } from '@/lib/publicConfig';

type PaymentMethod = 'wechat' | 'alipay';

const PAYMENT_OPTIONS: Record<PaymentMethod, {
  label: string;
  actionLabel: string;
  imageSrc: string;
  imageAlt: string;
}> = {
  wechat: {
    label: '微信',
    actionLabel: '显示微信收款码',
    imageSrc: '/support/wechat-pay.jpg',
    imageAlt: '作者提供的微信收款码，请使用微信扫码',
  },
  alipay: {
    label: '支付宝',
    actionLabel: '显示支付宝收款码',
    imageSrc: '/support/alipay-pay.webp',
    imageAlt: '作者提供的支付宝收款码，请使用支付宝扫码',
  },
};

/**
 * 非强制性支持区。收款码与外链由项目作者明确授权提供；
 * 二维码按用户选择加载，且整个组件不会包含在解读长图导出中。
 */
export function SupportAuthor() {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const selectedOption = selectedMethod ? PAYMENT_OPTIONS[selectedMethod] : null;

  const selectMethod = (method: PaymentMethod) => {
    setSelectedMethod((current) => (current === method ? null : method));
  };

  return (
    <section
      data-export-ignore="true"
      aria-label="随喜支持作者"
    >
      <div className="flex items-center justify-center gap-2 text-center">
        <Heart size={14} strokeWidth={1.4} style={{ color: 'rgba(139, 92, 38, 0.72)' }} aria-hidden="true" />
        <p className="text-[0.78rem] tracking-[0.12em]" style={{ fontFamily: FANG_SONG, color: '#76521f' }}>随喜支持作者</p>
      </div>
      <p className="mx-auto mt-2 max-w-sm text-center text-[0.7rem] leading-relaxed" style={{ fontFamily: FANG_SONG, color: 'rgba(91, 66, 35, 0.68)' }}>
        如果这个项目对你有帮助，欢迎随喜支持作者。完全自愿，不影响任何功能使用。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {(Object.keys(PAYMENT_OPTIONS) as PaymentMethod[]).map((method) => {
          const option = PAYMENT_OPTIONS[method];
          const selected = selectedMethod === method;
          return (
            <button
              key={method}
              type="button"
              aria-pressed={selected}
              aria-controls="support-payment-code"
              onClick={() => selectMethod(method)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-sm px-3 text-[0.72rem] tracking-[0.08em] transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/60"
              style={{
                fontFamily: FANG_SONG,
                color: '#76521f',
                border: selected ? '1px solid rgba(139, 92, 38, 0.62)' : '1px solid rgba(160, 110, 35, 0.3)',
                background: selected ? 'rgba(255, 244, 211, 0.9)' : 'rgba(255, 250, 232, 0.55)',
              }}
            >
              <QrCode size={15} strokeWidth={1.35} aria-hidden="true" />
              {selected ? `收起${option.label}收款码` : option.actionLabel}
            </button>
          );
        })}
      </div>

      {selectedOption ? (
        <div id="support-payment-code" className="mx-auto mt-3 max-w-xs rounded-sm p-3" style={{ border: '1px solid rgba(160, 110, 35, 0.22)', background: 'rgba(255, 250, 232, 0.68)' }}>
          <p className="mb-2 text-center text-[0.7rem] tracking-[0.08em]" style={{ fontFamily: FANG_SONG, color: 'rgba(91, 66, 35, 0.72)' }}>
            请使用{selectedOption.label}扫码，感谢您的支持
          </p>
          <img
            src={selectedOption.imageSrc}
            alt={selectedOption.imageAlt}
            loading="lazy"
            decoding="async"
            className="mx-auto block w-full rounded-sm"
            style={{ maxHeight: '24rem', objectFit: 'contain', background: '#fff' }}
          />
        </div>
      ) : null}

      <a
        href={PUBLIC_CONFIG.kofiUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-sm text-[0.75rem] tracking-[0.12em] transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/60"
        style={{ fontFamily: FANG_SONG, color: '#76521f', border: '1px solid rgba(160, 110, 35, 0.3)', background: 'rgba(255, 250, 232, 0.55)' }}
      >
        在 Ko-fi 支持作者 <ExternalLink size={13} aria-hidden="true" />
      </a>
    </section>
  );
}
