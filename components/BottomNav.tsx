"use client";

import { useState } from "react";
import { Home, Sparkles, Briefcase, User, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "chat" | "studio" | "projects" | "profile";

interface BottomNavProps {
  currentView: Tab;
  onViewChange: (view: Tab) => void;
  notificationBadge?: number;
}

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "chat", label: "Chat", icon: Home },
  { id: "studio", label: "Studio", icon: Sparkles },
  { id: "projects", label: "Projetos", icon: Briefcase },
  { id: "profile", label: "Perfil", icon: User },
];

export default function BottomNav({ currentView, onViewChange, notificationBadge }: BottomNavProps) {
  const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800/50" />
      
      {/* Gradient line on top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-600/50 to-transparent" />

      <div className="relative flex items-center justify-around px-2 py-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentView === tab.id;
          const isHovered = hoveredTab === tab.id;

          return (
            <motion.button
              key={tab.id}
              onClick={() => onViewChange(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              className="relative flex flex-col items-center gap-1 p-2 rounded-xl transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              {/* Active indicator */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gradient-to-r from-violet-600 to-blue-600"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </AnimatePresence>

              {/* Icon container */}
              <div className="relative">
                <motion.div
                  className={`p-2 rounded-xl transition-colors ${
                    isActive
                      ? "bg-gradient-to-br from-violet-600/20 to-blue-600/20 text-violet-400"
                      : isHovered
                      ? "bg-zinc-800/50 text-zinc-300"
                      : "text-zinc-600"
                  }`}
                  animate={{
                    scale: isActive ? 1.1 : isHovered ? 1.05 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <Icon strokeWidth={isActive ? 2 : 1.5} className="w-5 h-5" />
                </motion.div>

                {/* Notification badge */}
                {tab.id === "studio" && notificationBadge && notificationBadge > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 text-[9px] font-bold text-white flex items-center justify-center shadow-lg shadow-violet-900/50"
                  >
                    {notificationBadge > 9 ? "9+" : notificationBadge}
                  </motion.span>
                )}
              </div>

              {/* Label */}
              <motion.span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? "text-violet-400" : isHovered ? "text-zinc-400" : "text-zinc-600"
                }`}
                animate={{
                  y: isActive ? -2 : 0,
                }}
              >
                {tab.label}
              </motion.span>

              {/* Hover glow effect */}
              {isHovered && !isActive && (
                <motion.div
                  layoutId="hoverGlow"
                  className="absolute inset-0 rounded-xl bg-zinc-800/30 -z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}