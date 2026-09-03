import type { SVGProps } from "react";

export type PressTemplateIconKind =
  | "jacket"
  | "labels"
  | "sleeve"
  | "booklet"
  | "insert"
  | "sticker"
  | "other";

export function PressTemplateComponentIcon({
  kind,
  color,
  fill,
  size = 44,
}: {
  kind: PressTemplateIconKind;
  color: string;
  fill: string;
  size?: number;
}) {
  const s: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 26 26",
    fill: "none",
    stroke: color,
    strokeWidth: 0.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (kind) {
    case "jacket":
      return (
        <svg {...s} aria-hidden>
          <circle cx="17.5" cy="13" r="6.5" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="17.5" cy="13" r="1.4" strokeDasharray="1.2 1.6" opacity={0.7} />
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill={fill} />
        </svg>
      );
    case "labels":
      return (
        <svg {...s} aria-hidden>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill={fill} />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case "sleeve":
      return (
        <svg {...s} aria-hidden>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill={fill} />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill={fill} />
        </svg>
      );
    case "booklet":
      return (
        <svg {...s} aria-hidden>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill={fill} />
          <path d="M13 4.5v17" strokeDasharray="2 2.2" opacity={0.7} />
          <path d="M7 9.5h3.5M7 12.5h3.5M7 15.5h2.5M15.5 9.5h3.5M15.5 12.5h3.5" opacity={0.7} />
        </svg>
      );
    case "insert":
      return (
        <svg {...s} aria-hidden>
          <rect x="6" y="3" width="14" height="20" rx="1.2" fill={fill} />
          <path d="M9 7h8M9 10h8M9 13h6M9 17h8M9 20h5" opacity={0.7} />
        </svg>
      );
    case "sticker":
      return (
        <svg {...s} aria-hidden>
          <path d="M5 3.5h11l5 5v11.5A2.5 2.5 0 0 1 18.5 22h-13A2.5 2.5 0 0 1 3 19.5V6A2.5 2.5 0 0 1 5 3.5Z" fill={fill} />
          <path d="M16 3.5V9h5M7 13h10M7 16h7" opacity={0.7} />
        </svg>
      );
    case "other":
      return (
        <svg {...s} aria-hidden>
          <path d="M5 2.5h12l4 4v17H5z" fill={fill} />
          <path d="M17 2.5v4h4M8 11h10M8 14h10M8 17h7" opacity={0.7} />
        </svg>
      );
  }
}