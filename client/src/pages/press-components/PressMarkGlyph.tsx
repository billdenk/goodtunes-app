// Shared white press-mark glyph for DARK component faces (jackets, inner
// sleeves, inserts, center labels). Uploaded press logos are often dark
// artwork on transparent alpha (e.g. Hellbender's black rune), which
// vanishes on the dark mocks. We render the mark as a white CSS mask of
// the uploaded image so ANY monochrome upload reads white on dark faces.
// Light faces (e.g. the white sticker) keep the raw <img> — logos stay
// their uploaded color on light backgrounds.

export function WhiteMarkGlyph({
  logoUrl,
  size,
  opacity = 0.92,
  style,
}: {
  logoUrl: string;
  size: number;
  opacity?: number;
  style?: React.CSSProperties;
}) {
  const mask = `url("${logoUrl}")`;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "#fff",
        opacity,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
    />
  );
}
