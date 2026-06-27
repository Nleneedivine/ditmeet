import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "gold" | "outline" | "ghost" | "danger" | "holo";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] whitespace-nowrap";

const variants: Record<Variant, string> = {
  gold:
    "bg-[image:var(--gradient-gold)] text-[#0a1a3a] font-semibold shadow-[0_0_24px_-6px_var(--accent-glow)] hover:shadow-[0_0_40px_0_var(--accent-glow)] hover:-translate-y-0.5",
  outline:
    "border border-[var(--border-soft)] text-foreground bg-transparent hover:bg-[color:var(--accent)]/10 hover:border-[var(--border-strong)] hover:shadow-[0_0_24px_-6px_var(--accent-glow)]",
  ghost:
    "text-foreground/85 hover:text-foreground hover:bg-[color:var(--accent)]/10",
  danger:
    "bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-400 hover:to-red-500 shadow-[0_0_20px_-4px_rgba(244,63,94,0.6)]",
  holo:
    "relative bg-holo text-[#0a1a3a] font-semibold shadow-[0_0_30px_-4px_var(--accent-glow)] hover:shadow-[0_0_40px_0_var(--accent-glow)]",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

export interface GoldButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const GoldButton = React.forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ className, variant = "gold", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
GoldButton.displayName = "GoldButton";
