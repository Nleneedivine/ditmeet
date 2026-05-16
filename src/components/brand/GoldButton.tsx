import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "gold" | "outline" | "ghost" | "danger" | "holo";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.82_0.16_88)]";

const variants: Record<Variant, string> = {
  gold:
    "bg-[var(--gradient-gold)] text-[#0a0a2e] font-semibold shadow-[0_0_24px_-4px_oklch(0.82_0.16_88/0.55)] hover:shadow-[0_0_40px_0_oklch(0.88_0.18_88/0.75)] hover:-translate-y-0.5",
  outline:
    "border border-[oklch(0.82_0.16_88/0.55)] text-[oklch(0.92_0.10_88)] hover:bg-[oklch(0.82_0.16_88/0.1)] hover:border-[oklch(0.82_0.16_88/0.9)] hover:shadow-[0_0_24px_-4px_oklch(0.82_0.16_88/0.45)]",
  ghost: "text-foreground/80 hover:text-foreground hover:bg-white/5",
  danger:
    "bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-400 hover:to-red-500 shadow-[0_0_20px_-4px_rgba(244,63,94,0.6)]",
  holo:
    "relative bg-holo text-[#0a0a2e] font-semibold shadow-[0_0_30px_-4px_rgba(192,132,252,0.6)] hover:shadow-[0_0_40px_0_rgba(255,217,61,0.7)]",
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
  ({ className, variant = "gold", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);
GoldButton.displayName = "GoldButton";
