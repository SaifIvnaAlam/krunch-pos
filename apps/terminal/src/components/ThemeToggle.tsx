import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

type Props = {
  className?: string;
  title?: string;
};

export function ThemeToggle({ className = "", title }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = title ?? (isDark ? "Switch to light mode" : "Switch to dark mode");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex size-9 shrink-0 items-center justify-center rounded-[8px] border [border-color:var(--pos-border-medium)] bg-[var(--pos-signout-bg)] text-[var(--pos-text-2)] transition-colors hover:[border-color:var(--pos-border-strong)] hover:text-[var(--pos-text-1)] ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun className="size-4" strokeWidth={2} />
      ) : (
        <Moon className="size-4" strokeWidth={2} />
      )}
    </button>
  );
}
