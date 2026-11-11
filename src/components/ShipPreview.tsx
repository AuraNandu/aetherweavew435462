"use client";

import type { ShipChassis } from "@/lib/game-types";

export function ShipPreview({
  chassis,
  auraColor,
  size = 64,
  className = "",
}: {
  chassis: ShipChassis;
  auraColor: string;
  size?: number;
  className?: string;
}) {
  const renderHull = () => {
    switch (chassis) {
      case "interceptor":
        return (
          <g>
            <path
              d="M50 8 L63 52 L80 76 L56 68 L50 86 L44 68 L20 76 L37 52 Z"
              fill="#0b1224"
              stroke={auraColor}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            <path
              d="M50 18 L56 50 L50 64 L44 50 Z"
              fill={auraColor}
              fillOpacity="0.35"
            />
            <ellipse cx="50" cy="40" rx="4" ry="10" fill="#e2f8ff" />
          </g>
        );
      case "phoenix":
        return (
          <g>
            <path
              d="M50 10 L62 34 L88 46 L72 68 L58 62 L50 84 L42 62 L28 68 L12 46 L38 34 Z"
              fill="#0b1224"
              stroke={auraColor}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            <path
              d="M22 48 L38 42 M78 48 L62 42"
              stroke={auraColor}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <polygon
              points="50,24 57,46 50,58 43,46"
              fill={auraColor}
              fillOpacity="0.45"
            />
            <circle cx="50" cy="40" r="4.5" fill="#fff" />
          </g>
        );
      case "mantis":
        return (
          <g>
            <path
              d="M50 18 L62 42 L84 22 L76 66 L58 64 L50 84 L42 64 L24 66 L16 22 L38 42 Z"
              fill="#0b1224"
              stroke={auraColor}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            <path
              d="M50 26 L56 48 L50 60 L44 48 Z"
              fill={auraColor}
              fillOpacity="0.4"
            />
            <circle cx="50" cy="42" r="4" fill="#e2f8ff" />
          </g>
        );
      case "valkyrie":
      default:
        return (
          <g>
            <path
              d="M50 10 L66 44 L86 72 L60 66 L50 84 L40 66 L14 72 L34 44 Z"
              fill="#0b1224"
              stroke={auraColor}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            <path
              d="M50 22 L58 48 L50 62 L42 48 Z"
              fill={auraColor}
              fillOpacity="0.4"
            />
            <ellipse cx="50" cy="42" rx="4.5" ry="9" fill="#e2f8ff" />
          </g>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{
        filter: `drop-shadow(0 0 10px ${auraColor}66)`,
      }}
    >
      <defs>
        <radialGradient id={`glow-${chassis}-${auraColor.replace("#", "")}`} cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor={auraColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={auraColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx="50"
        cy="54"
        r="38"
        fill={`url(#glow-${chassis}-${auraColor.replace("#", "")})`}
      />
      {/* Thruster flame */}
      <polygon
        points="45,76 55,76 50,94"
        fill={auraColor}
        opacity="0.85"
      />
      {renderHull()}
    </svg>
  );
}
