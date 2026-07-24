import type { LucideIcon } from "lucide-react";
import { useSession } from "@/features/auth";
import { getVisibleNavSections, leavesFromNodes } from "../../data/posNav";

function MobileNavButton({
  leafId,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  leafId: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(leafId)}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-[4.25rem] max-w-[5.25rem] flex-col items-center gap-0.5 rounded-[8px] px-1 py-1.5 transition-colors ${
        active
          ? "bg-[var(--pos-sb-active-bg)] text-[var(--pos-sb-active-text)]"
          : "text-[var(--pos-sb-text-2)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
      }`}
    >
      <Icon
        className={`size-[18px] shrink-0 ${active ? "text-[var(--pos-sb-active-icon)]" : "text-[var(--pos-sb-icon)]"}`}
        strokeWidth={active ? 2.2 : 1.8}
      />
      <span
        className={`w-full truncate text-center text-[9px] leading-tight ${
          active ? "font-semibold" : "font-medium"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export function PosMobileNav({
  activeLeafId,
  onSelectLeaf,
}: {
  activeLeafId: string;
  onSelectLeaf: (id: string) => void;
}) {
  const { permissions } = useSession();
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-solid [border-color:var(--pos-sb-border)] [background:var(--pos-sb-bg)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      <div className="flex flex-col gap-1 px-1 py-1.5">
        {getVisibleNavSections(permissions).map((section, sectionIndex) => {
          const leaves = leavesFromNodes(section.nodes);
          if (leaves.length === 0) return null;
          return (
            <div key={section.id} className="flex min-w-0 items-stretch gap-1">
              {sectionIndex > 0 ? (
                <div
                  className="my-1 w-px shrink-0 self-stretch bg-[var(--pos-sb-divider)]"
                  aria-hidden
                />
              ) : null}
              {section.label ? (
                <p
                  className="flex w-[2.75rem] shrink-0 flex-col justify-center text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-[var(--pos-sb-section-label)]"
                  title={section.label}
                >
                  {section.label}
                </p>
              ) : (
                <p
                  className="flex w-[2.75rem] shrink-0 flex-col justify-center text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-[var(--pos-sb-section-label)]"
                  title="Office"
                >
                  Office
                </p>
              )}
              <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
                {leaves.map((leaf) => (
                  <MobileNavButton
                    key={leaf.id}
                    leafId={leaf.id}
                    label={leaf.label}
                    icon={leaf.icon}
                    active={activeLeafId === leaf.id}
                    onSelect={onSelectLeaf}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
