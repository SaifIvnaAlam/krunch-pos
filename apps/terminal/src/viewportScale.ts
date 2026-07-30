import { useLayoutEffect } from "react";

/** Design canvas size for desktop POS layout scaling. */
export const POS_DESIGN_WIDTH = 1280;
export const POS_DESIGN_HEIGHT = 800;

/** Match Tailwind `lg` — below this, use real responsive CSS (no transform scale). */
export const POS_SCALE_MIN_WIDTH = 1024;

export function computePosViewportScale(
  width = window.innerWidth,
  height = window.innerHeight,
): number {
  if (width <= 0 || height <= 0) return 1;
  // Phone/tablet layouts already use `lg:` / mobile nav — scaling them to a
  // 1280×800 canvas makes every rem/px tiny and breaks responsiveness.
  if (width < POS_SCALE_MIN_WIDTH) return 1;
  return Math.min(width / POS_DESIGN_WIDTH, height / POS_DESIGN_HEIGHT);
}

export function syncPosViewportScale(): void {
  const scale = computePosViewportScale();
  document.documentElement.style.setProperty("--pos-ui-scale", String(scale));
}

export function usePosViewportScale(enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled) {
      document.documentElement.style.setProperty("--pos-ui-scale", "1");
      return;
    }

    syncPosViewportScale();

    const onResize = () => syncPosViewportScale();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [enabled]);
}
