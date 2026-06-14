import { useLayoutEffect } from "react";

/** Matches default Tauri window size in tauri.conf.json */
export const POS_DESIGN_WIDTH = 1280;
export const POS_DESIGN_HEIGHT = 800;

export function computePosViewportScale(
  width = window.innerWidth,
  height = window.innerHeight,
): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(width / POS_DESIGN_WIDTH, height / POS_DESIGN_HEIGHT);
}

export function syncPosViewportScale(): void {
  const scale = computePosViewportScale();
  document.documentElement.style.setProperty("--pos-ui-scale", String(scale));
}

export function usePosViewportScale(): void {
  useLayoutEffect(() => {
    syncPosViewportScale();

    const onResize = () => syncPosViewportScale();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);
}
