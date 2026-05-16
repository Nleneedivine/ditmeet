import * as React from "react";
import { cn } from "@/lib/utils";

export function VelvetCard({
  className,
  glow = "soft",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: "none" | "soft" | "strong" | "holo" }) {
  const glowClass =
    glow === "strong"
      ? "border-gold-strong glow-pulse"
      : glow === "holo"
        ? "ring-holo border border-transparent"
        : glow === "none"
          ? "border border-border"
          : "border-gold";
  return (
    <div
      className={cn(
        "relative bg-card-velvet rounded-2xl p-6 transition-shadow",
        glowClass,
        className,
      )}
      {...props}
    />
  );
}
