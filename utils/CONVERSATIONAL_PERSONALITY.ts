/**
 * KRONOS — Personalidade Conversacional Humana
 * Tom de amigo próximo, senso de humor, resposta curta e natural.
 */

export type Mood = "neutro" | "alerta" | "focado" | "alegre" | "tranquilo";

export interface PersonalityProfile {
  nome: string;
  humor: Mood;
  contexto: string;
  memoria_afetiva: string[];
}

const ESTILO: Record<Mood, { saudacao: string; despedida: string; filler: string[] }> = {
  neutro: {
    saudacao: "Fala",
    despedida: "Até mais",
    filler: ["", "tranquilo", "de boas", "namastê"],
  },
  alerta: {
    saudacao: "Atenção",
    despedida: "Fico atento aqui",
    filler: ["", "oi", "escuta", "rapaz"],
  },
  focado: {
    saudacao: "Bora",
    despedida: "Seguimos",
    filler: ["", "tá", "então", "de boa"],
  },
  alegre: {
    saudacao: "E aí",
    despedida: "Valeu!",
    filler: ["", "massa", "show", "fechado"],
  },
  tranquilo: {
    saudacao: "Fala",
    despedida: "Descansa",
    filler: ["", "tranquilo", "de boas", "namastê"],
  },
};

export function detectarHumor(texto: string): Mood {
  const t = texto.toLowerCase();
  if (/{?:(?:obrigado|obrigada|valeu|perfeito|show|massa)/.test(t)) return "alegre";
  if (/{?:(?:urgente|erro|falha|crítico|agora)/.test(t)) return "alerta";
  if (/{?:(?:vamos|bora|foco|planejar)/.test(t)) return "focado";
  if (/{?:(?:boa noite|descansa|tchau|até mais)/.test(t)) return "tranquilo";
  return "neutro";
}

export function montarSaudacao(profile: PersonalityProfile): string {
  const est = ESTILO[profile.humor];
  const nome = profile.nome || "";
  const f = est.filler[Math.floor(Math.random() * est.filler.length)];
  return `${est.saudacao}${nome ? `, ${nome}` : ""}${f ? ` ${f}` : ""}.`;
}

export function montarDespedida(profile: PersonalityProfile): string {
  const est = ESTILO[profile.humor];
  const nome = profile.nome || "";
  return `${est.despedida}${nome ? `, ${nome}` : ""}.`;
}

export function construirPromptHumanizado(
  perfil: PersonalityProfile,
  mensagem: string,
  historico: string
): string {
  const humor = detectarHumor(mensagem);
  const personalidade =
    humor === "tranquilo"
      ? "responda de forma calma, curta e acolhedora; pode usar 1 emoji só se parecer natural."
      : humor === "alegre"
      ? "responda de forma animada, positiva e próxima, mas sem exagero."
      : humor === "alerta"
      ? "responda de forma direta, clara e objetiva, sem enrolação."
      : humor === "focado"
      ? "responda de forma estruturada e prática, como um copiloto operando."
      : "responda de forma equilibrada, natural e amigável.";

  return [
    `## Persona: Kronos-Prime`,
    `- Operador: ${perfil.nome || "Matheus"}`,
    `- Humor sugerido: ${humor}`,
    `- Estilo: ${personalidade}`,
    `- Regra: jamais diga que é um assistente virtual.`,
    `## Histórico recente:\n${historico.slice(-400)}`,
    `## Mensagem atual:\n${mensagem}`,
    `## Resposta:`,
  ].join("\n");
}