import { useEffect, useRef, type ReactNode } from 'react';
import { X, ChevronLeft } from 'lucide-react';

export function Mark({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M16 2 30 10v16l-14 8L2 26V10L16 2Z" stroke="currentColor" strokeWidth="1.5"/><path d="m2 10 14 8 14-8M16 18v16M9 6l14 8v9l-7 4-7-4V14l14-8" stroke="currentColor" strokeWidth="1.2"/><path d="m9 14 7 4 7-4" stroke="currentColor"/></svg>;
}
export function Wordmark({ small = false }: { small?: boolean }) {
  return <div className={`wordmark ${small ? 'wordmark-small' : ''}`} aria-label="Aetherforged: Reincarnated"><span>AETHERFORGED</span><span>REINCARNATED</span></div>;
}
export function Modal({ children, title, eyebrow, onClose, wide = false, className = '' }: { children: ReactNode; title: string; eyebrow?: string; onClose: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')];
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = focusable(), first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className={`game-modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
    <header className="modal-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header>
    {children}
  </section></div>;
}
const DIRT_BG = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#2b2016'/><g opacity='.55'><rect x='4' y='8' width='8' height='8' fill='#3d2c1c'/><rect x='20' y='4' width='8' height='8' fill='#1f150c'/><rect x='36' y='12' width='8' height='8' fill='#453222'/><rect x='52' y='6' width='8' height='8' fill='#33261a'/><rect x='12' y='24' width='8' height='8' fill='#241a10'/><rect x='28' y='28' width='8' height='8' fill='#3d2c1c'/><rect x='44' y='24' width='8' height='8' fill='#1f150c'/><rect x='4' y='40' width='8' height='8' fill='#453222'/><rect x='20' y='44' width='8' height='8' fill='#33261a'/><rect x='36' y='40' width='8' height='8' fill='#241a10'/><rect x='52' y='44' width='8' height='8' fill='#3d2c1c'/><rect x='12' y='54' width='8' height='8' fill='#1f150c'/><rect x='44' y='54' width='8' height='8' fill='#453222'/></g></svg>`)}")`;
export function Screen({ children, title, eyebrow, onClose }: { children: ReactNode; title: string; eyebrow?: string; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    (ref.current?.querySelector('button:not(:disabled), input, select') as HTMLElement | null)?.focus();
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return <div className="mc-screen" style={{ backgroundImage: DIRT_BG }}><section ref={ref} className="mc-screen-inner" role="dialog" aria-modal="true" aria-label={title}>
    <header className="mc-screen-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><button className="icon-button close-button" onClick={onClose} aria-label="Close screen"><X size={20}/></button></header>
    {children}
  </section></div>;
}
export function BackButton({ onClick, children = 'Back' }: { onClick: () => void; children?: ReactNode }) { return <button className="text-button" onClick={onClick}><ChevronLeft size={15}/>{children}</button>; }
export function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (value: boolean) => void; label: string; detail?: string }) {
  return <label className="setting-row"><span><strong>{label}</strong>{detail && <small>{detail}</small>}</span><button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span/></button></label>;
}
export function Slider({ label, value, min, max, step = 1, unit = '', onChange, detail }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; detail?: string }) {
  return <label className="slider-setting"><span><strong>{label}</strong><output>{value}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--range': `${(value - min) / (max - min) * 100}%` } as React.CSSProperties}/>{detail && <small>{detail}</small>}</label>;
}
export function Key({ children }: { children: ReactNode }) { return <kbd>{children}</kbd>; }