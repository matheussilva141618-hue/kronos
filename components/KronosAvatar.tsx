"use client";

interface KronosAvatarProps {
  size?: number;
  spinning?: boolean;
}

export default function KronosAvatar({ size = 32, spinning = false }: KronosAvatarProps) {
  const id = "kg";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={spinning ? "animate-spin" : ""}
      style={{ animationDuration: "3s" }}
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1d4ed8" />
          <stop offset="50%"  stopColor="#0f172a" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#10b981" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="32" height="32" rx="8" fill={`url(#${id}-a)`} />

      {/* K letter */}
      <path
        d="M9 8v16M9 16l8-8M9 16l8 8"
        stroke={`url(#${id}-b)`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Corner accent */}
      <circle cx="23" cy="9" r="2" fill="#10b981" opacity="0.8" />
    </svg>
  );
}
