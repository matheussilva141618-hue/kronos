"use client";

interface KronosAvatarProps {
  size?: number;
  spinning?: boolean;
}

export default function KronosAvatar({ size = 32, spinning = false }: KronosAvatarProps) {
  const id = "kp";
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
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#a21caf" />
          <stop offset="50%"  stopColor="#6b21a8" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id={`${id}-fg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#e879f9" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Premium gradient background */}
      <rect width="32" height="32" rx="8" fill={`url(#${id}-bg)`} />

      {/* Stylized K letter */}
      <path
        d="M9 8v16M9 16l8-8M9 16l8 8"
        stroke={`url(#${id}-fg)`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sparkle accent dot */}
      <circle cx="23" cy="9" r="2" fill="#c084fc" opacity="0.9" />
    </svg>
  );
}