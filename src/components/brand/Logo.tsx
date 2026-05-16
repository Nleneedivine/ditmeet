import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showAnniversary?: boolean;
}

const sizes = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-6xl",
  xl: "text-8xl md:text-9xl",
};

export function Logo({ size = "md", className, showAnniversary }: LogoProps) {
  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <span
        className={cn(
          "font-display font-bold tracking-tight text-gold pulse-gold leading-none",
          sizes[size],
        )}
        style={{ fontFamily: "var(--font-display)" }}
      >
        DITM
      </span>
      {showAnniversary && (
        <span className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-rainbow font-semibold">
          10 Years · Velvet Edition
        </span>
      )}
    </div>
  );
}
