import { useEffect, useState } from 'react';

/**
 * Measures an element and updates when it is resized.
 * `ref` is a "callback ref": it works even if the element appears later (after a loading state).
 * `el` is the element itself, once it exists.
 */
export function useElementSize<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, el, ...size };
}
