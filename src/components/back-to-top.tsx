'use client';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/content/types';
import { Icon } from './icons';
import styles from './floating-actions.module.css';

export function BackToTop({ locale, suppressed = false }: { locale: Locale; suppressed?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; setScrolled(window.scrollY > 400); }); };
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('scroll', update); cancelAnimationFrame(frame); };
  }, []);
  const visible = scrolled && !suppressed;
  return <button type="button" className={`${styles.round} ${styles.backTop}`} data-visible={visible || undefined} disabled={!visible} aria-hidden={!visible || undefined} aria-label={({ ro: 'Înapoi sus', ru: 'Наверх', en: 'Back to top' })[locale]} onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><Icon name="arrow" /></button>;
}
