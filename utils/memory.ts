"use client";

import type { KronosMode } from '@/app/api/chat/route';

export interface MemoryEntry {
  topic: string;
  detail: string;
  importance_score: number;
  mode: KronosMode;
  updated_at: string;
}

const MEMORY_KEY = (u: string) => `kronos_memory_${u}`;
const MAX_ENTRIES = 60;

export function loadMemory(username: string, mode?: KronosMode): MemoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MEMORY_KEY(username));
    const all: MemoryEntry[] = raw ? JSON.parse(raw) : [];
    return mode ? all.filter((e) => e.mode === mode) : all;
  } catch {
    return [];
  }
}

export function mergeMemory(username: string, incoming: MemoryEntry[]): void {
  if (typeof window === 'undefined') return;
  const existing = loadMemory(username);
  const map = new Map<string, MemoryEntry>();

  for (const e of existing) map.set(`${e.mode}::${e.topic.toLowerCase()}`, e);

  for (const n of incoming) {
    const key  = `${n.mode}::${n.topic.toLowerCase()}`;
    const prev = map.get(key);
    if (!prev || n.importance_score >= prev.importance_score) {
      map.set(key, { ...n, updated_at: new Date().toISOString() });
    }
  }

  const sorted = [...map.values()]
    .sort((a, b) => b.importance_score - a.importance_score)
    .slice(0, MAX_ENTRIES);

  localStorage.setItem(MEMORY_KEY(username), JSON.stringify(sorted));
}

export function formatMemoryForPrompt(entries: MemoryEntry[]): string {
  if (!entries.length) return '';
  const top = entries
    .sort((a, b) => b.importance_score - a.importance_score)
    .slice(0, 12);
  const lines = top.map((e) => `- [${e.topic}] ${e.detail}`).join('\n');
  return `\n\nCONTEXTO MEMORIZADO DO USUÁRIO (use para personalizar respostas):\n${lines}`;
}
