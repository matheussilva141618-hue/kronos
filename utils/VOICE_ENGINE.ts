/**
 * KRONOS — Neural Voice Engine
 * Motor de voz neural bidirecional: Speech-to-Text + Text-to-Speech
 * Voz adaptativa por contexto, zero dependência externa.
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type VoiceTone = 'neutral' | 'focused' | 'analytical' | 'dynamic' | 'alert';

export interface VoiceConfig {
  rate: number;
  pitch: number;
  volume: number;
  voiceName?: string;
  tone: VoiceTone;
}

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export interface VoiceSession {
  isListening: boolean;
  isSpeaking: boolean;
  currentTone: VoiceTone;
  lastTranscript?: string;
  error?: string;
}

// ─── Configuração por tipo de contexto ─────────────────────────────────────────

const TONE_CONFIG: Record<VoiceTone, Partial<VoiceConfig>> = {
  focused:   { rate: 1.0, pitch: 0.9, volume: 0.9 },
  analytical:{ rate: 0.92, pitch: 1.0, volume: 0.85 },
  dynamic:   { rate: 1.08, pitch: 1.05, volume: 0.95 },
  alert:     { rate: 1.05, pitch: 0.85, volume: 1.0 },
  neutral:   { rate: 1.0,  pitch: 1.0,  volume: 0.9 },
};

// Mapeamento de intenção → tom de voz
export function intentToVoiceTone(intent: string, urgency: string): VoiceTone {
  if (urgency === 'critical' || urgency === 'high') return 'alert';
  if (intent === 'analyze' || intent === 'teach')   return 'analytical';
  if (intent === 'create')                         return 'dynamic';
  if (intent === 'question')                        return 'focused';
  return 'neutral';
}

// ─── Seleção de voz ────────────────────────────────────────────────────────────

export function selectBestVoice(lang: string = 'pt-BR'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const pt = voices.filter(v => v.lang.toLowerCase().startsWith('pt'));
  if (pt.length) return pt[0];
  const ptAny = voices.filter(v => v.lang.toLowerCase().includes('pt'));
  if (ptAny.length) return ptAny[0];
  const en = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  if (en.length) return en[0];
  return voices[0] ?? null;
}

// ─── Text-to-Speech ────────────────────────────────────────────────────────────

export function speak(
  text: string,
  tone: VoiceTone = 'neutral',
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError?.('Speech synthesis não suportado');
    return;
  }

  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  const voice = selectBestVoice();
  if (voice) utt.voice = voice;

  const cfg = TONE_CONFIG[tone] ?? TONE_CONFIG.neutral;
  utt.rate   = cfg.rate   ?? 1.0;
  utt.pitch  = cfg.pitch  ?? 1.0;
  utt.volume = cfg.volume ?? 0.9;

  utt.onstart = () => onStart?.();
  utt.onend   = () => onEnd?.();
  utt.onerror = (e) => onError?.(e.error);
  window.speechSynthesis.speak(utt);
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isSTTSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as Record<string, unknown>).SpeechRecognition ||
       !!(window as unknown as Record<string, unknown>).webkitSpeechRecognition;
}