import { NextResponse } from "next/server";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

const apiKey = process.env.CEREBRAS_API_KEY;
const MODEL = "gpt-oss-120b";

const client = new Cerebras({ apiKey, defaultHeaders: { Connection: "keep-alive" }, maxRetries: 1, timeout: 28000 });

export async function POST(req: Request) {
  if (!apiKey) return NextResponse.json({ error: "Chave da API não configurada." }, { status: 500 });

  try {
    const body = await req.json();
    const { prompt, goal, theme, username, mode } = body as {
      prompt: string;
      goal: string;
      theme: string;
      username: string;
      mode: string;
    };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt inválido." }, { status: 400 });
    }

    const system = `Você é o Kronos Studio, um gerador de UI front-end de alto padrão. Converta descrições de produto em código React + Tailwind CSS modular, com componentes reutilizáveis, responsividade e foco em produção. Sempre forneça:
- um resumo de alto nível
- lista de componentes sugeridos
- o código principal completo de um componente React funcional
- instruções de uso concisas
`;

    const userMessage = `Projeto: ${goal}\nTema: ${theme}\nUsuário: ${username}\nModo: ${mode}\nDescrição: ${prompt}\n\nEntregue apenas JSON com as chaves: summary, components, code, framework.`;

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      stream: false,
    }) as { choices: Array<{ message: { content: string } }> };

    const raw = res.choices[0]?.message?.content ?? "";
    const parsed = parseStudioResponse(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Não foi possível interpretar a resposta do modelo." }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseStudioResponse(raw: string) {
  const jsonMatch = raw.match(/\{[\s\S]*\}$/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: String(parsed.summary ?? parsed.description ?? "").trim(),
      code: String(parsed.code ?? parsed.component ?? "").trim(),
      framework: String(parsed.framework ?? "React + Tailwind").trim(),
      components: Array.isArray(parsed.components) ? parsed.components.map(String) : [],
    };
  } catch {
    return null;
  }
}
