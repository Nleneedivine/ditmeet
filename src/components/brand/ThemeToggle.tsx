import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3 rounded-full border border-[var(--border-soft)] bg-card-velvet text-foreground hover:border-[var(--border-strong)] transition-all",
        className,
      )}
    >
      {isDark ? <Sun className="size-4 text-accent" /> : <Moon className="size-4 text-accent" />}
      <span className="text-xs font-medium hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
