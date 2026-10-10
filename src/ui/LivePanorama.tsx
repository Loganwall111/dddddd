import { useEffect, useRef, useState } from 'react';
import type { Panorama } from '../rendering/Panorama';

/**
 * Live 3D title panorama. The WebGL engine is created once per app session and only paused
 * while menus are hidden, so it never recreates WebGL contexts (that churn caused black flashes).
 */
export function LivePanorama({ reducedMotion, active, onReady }: { reducedMotion: boolean; active: boolean; onReady?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<Panorama | null>(null);
  const [ready, setReady] = useState(false);
  const motion = useRef(reducedMotion); motion.current = reducedMotion;
  const activeRef = useRef(active); activeRef.current = active;
  const readyRef = useRef(onReady); readyRef.current = onReady;

  useEffect(() => {
    let disposed = false;
    let instance: Panorama | undefined;
    const timer = setTimeout(() => {
      void import('../rendering/Panorama').then(async ({ Panorama: Renderer }) => {
        if (disposed || !canvas.current) return;
        instance = await Renderer.create(canvas.current, motion.current, () => { if (!disposed) { setReady(true); readyRef.current?.(); } });
        if (disposed) { instance.dispose(); return; }
        instance.reducedMotion = motion.current;
        instance.paused = !activeRef.current;
        view.current = instance;
      }).catch(error => console.warn('Live panorama unavailable; original title artwork remains visible.', error));
    }, 300);
    return () => { disposed = true; clearTimeout(timer); instance?.dispose(); view.current = null; };
  }, []);

  useEffect(() => { if (view.current) view.current.reducedMotion = reducedMotion; }, [reducedMotion]);
  useEffect(() => { if (view.current) view.current.paused = !active; }, [active]);

  return <canvas ref={canvas} className={`live-panorama ${ready ? 'ready' : ''}`} aria-hidden="true" />;
}
