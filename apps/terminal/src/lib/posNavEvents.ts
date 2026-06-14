/** Programmatic sidebar navigation (listened to in PosTerminalPage). */
export const POS_SELECT_LEAF_EVENT = "pos-select-leaf";

export function dispatchPosSelectLeaf(leafId: string): void {
  window.dispatchEvent(
    new CustomEvent(POS_SELECT_LEAF_EVENT, { detail: { leafId } }),
  );
}
