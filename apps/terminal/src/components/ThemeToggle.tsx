import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

type Props = {
  className?: string;
  title?: string;
  variant?: "default" | "sidebar";
};

export function ThemeToggle({ className = "", title, variant = "default" }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = title ?? (isDark ? "Switch to light mode" : "Switch to dark mode");

  const variantClass =
    variant === "sidebar"
      ? "size-7 rounded-[5px] border-transparent bg-[var(--pos-sb-brand-bg)] text-[var(--pos-sb-text-1)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-1)]"
      : "size-9 rounded-[8px] border [border-color:var(--pos-border-medium)] bg-[var(--pos-signout-bg)] text-[var(--pos-text-2)] hover:[border-color:var(--pos-border-strong)] hover:text-[var(--pos-text-1)]";

  const iconClass = variant === "sidebar" ? "size-3.5" : "size-4";
  const iconStroke = variant === "sidebar" ? 1.8 : 2;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex shrink-0 items-center justify-center transition-colors ${variantClass} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun className={iconClass} strokeWidth={iconStroke} />
      ) : (
        <Moon className={iconClass} strokeWidth={iconStroke} />
      )}
    </button>
  );
}
