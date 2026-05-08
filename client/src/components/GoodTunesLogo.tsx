interface GoodTunesLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "white" | "color";
}

export function GoodTunesLogo({ size = "md", className = "", variant = "white" }: GoodTunesLogoProps) {
  const heights: Record<string, number> = { sm: 28, md: 44, lg: 88 };
  const h = heights[size];

  const src = variant === "color" ? "/goodtunes-logo-color.png" : "/goodtunes-logo-white.png";

  return (
    <img
      src={src}
      alt="GoodTunes®"
      style={{
        height: h,
        width: "auto",
        mixBlendMode: "screen",
        display: "block",
      }}
      className={className}
    />
  );
}
