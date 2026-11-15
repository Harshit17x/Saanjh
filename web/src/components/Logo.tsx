import { useId } from 'react';

/** The Saanjh mark: a sun setting over a calm horizon. Decorative; the name sits beside it. */
export function LogoMark({ className = 'brand-mark' }: { className?: string }) {
  const id = `logo${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf7a" />
          <stop offset="1" stopColor="#e2557f" />
        </linearGradient>
      </defs>
      <path d="M8 28a16 16 0 0 1 32 0Z" fill={`url(#${id}-sun)`} />
      <rect x="4" y="31" width="40" height="3.2" rx="1.6" fill="currentColor" />
      <rect x="10" y="37" width="28" height="3.2" rx="1.6" fill="currentColor" opacity="0.7" />
      <rect x="17" y="43" width="14" height="3.2" rx="1.6" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <a className="brand" href={to}>
      <LogoMark />
      <span className="brand-name">Saanjh</span>
    </a>
  );
}
