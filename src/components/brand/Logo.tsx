import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import darkLogo from "@/assets/ditm-logo-dark.asset.json";
import lightLogo from "@/assets/ditm-logo-light.asset.json";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showAnniversary?: boolean;
}

const heights: Record<NonNullable<LogoProps["size"]>, string> = {
  sm: "h-8",
  md: "h-12",
  lg: "h-20",
  xl: "h-28 md:h-40",
};

export function Logo({ size = "md", className, showAnniversary }: LogoProps) {
  const { theme } = useTheme();
  const src = theme === "light" ? lightLogo.url : darkLogo.url;
  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <img
        src={src}
        alt="DITM — Divine Intelligence Team"
        className={cn("w-auto select-none", heights[size])}
        draggable={false}
      />
      {showAnniversary && (
        <span className="mt-2 text-[0.6rem] uppercase tracking-[0.4em] text-brand-soft font-semibold">
          Divine Intelligence Team
        </span>
      )}
    </div>
  );
}
