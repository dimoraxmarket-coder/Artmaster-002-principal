import Image from 'next/image';
import type { SVGProps } from 'react';

export type IconName = 'arrow' | 'chevron' | 'phone' | 'mail' | 'pin' | 'menu' | 'close' | 'check' | 'spark' | 'layers' | 'precision' | 'printer' | 'cube' | 'clock' | 'upload' | 'search' | 'shield' | 'chat' | 'globe';

const paths: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  phone: <path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9.6 21 3 14.4 3 5a2 2 0 0 1 2-2Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="M20 2v4M18 4h4" /></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5Z" /><path d="m2 12 10 5 10-5M2 16l10 5 10-5" /></>,
  precision: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  printer: <><path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7Z" /><path d="M16 11h1" /></>,
  cube: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18Z" /></>,
};

export function Icon({ name, className, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>{paths[name]}</svg>;
}

export function Logo({ light = false }: { light?: boolean }) {
  return <span className={`brand${light ? ' brand-light' : ''}`}>
    <Image src="/branding/artmaster-symbol.webp" width={44} height={40} alt="" aria-hidden="true" className="brand-symbol" unoptimized />
    <span className="brand-words"><span className="brand-name">ARTMASTER</span><span className="brand-caption">ADVERTISING GROUP</span></span>
  </span>;
}
