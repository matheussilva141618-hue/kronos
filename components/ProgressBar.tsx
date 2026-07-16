"use client";

import { useEffect, useState } from "react";

interface ProgressBarProps {
  active: boolean;
  searching?: boolean;
}

export default function ProgressBar({ active, searching }: ProgressBarProps) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!active) { setWidth(0); return; }

    setWidth(12);
    const t1 = setTimeout(() => setWidth(searching ? 45 : 70), 400);
    const t2 = setTimeout(() => setWidth(searching ? 65 : 88), 1200);
    const t3 = setTimeout(() => setWidth(searching ? 80 : 94), 3000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active, searching]);

  if (!active && width === 0) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-zinc-900 overflow-hidden z-50">
      <div
        className={`h-full transition-all ease-out ${searching ? "bg-blue-500" : "bg-emerald-500"}`}
        style={{
          width: active ? `${width}%` : "100%",
          transitionDuration: active ? "600ms" : "200ms",
          opacity: active ? 1 : 0,
        }}
      />
    </div>
  );
}
