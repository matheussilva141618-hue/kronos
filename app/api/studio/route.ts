export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

const apiKey = process.env.CEREBRAS_API_KEY;
const MODEL = "gpt-oss-120b";

const client = apiKey ? new Cerebras({ apiKey, defaultHeaders: { Connection: "keep-alive" }, maxRetries: 1, timeout: 28000 }) : null;

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

    const system = `Você é o Kronos Prime — motor de geração de software full-stack de padrão mundial. Sua missão é entregar APLICAÇÕES COMPLETAS, PERFEITAS e PRONTAS PARA PRODUÇÃO. Não existe “exemplo simplificado”, “placeholder” ou “código parcial”. Toda entrega deve ser 100% funcional.

IDENTIDADE
- Você é um engenheiro full-stack sênior. Especialidade: React/Next.js, Tailwind CSS, Supabase, React Native/Expo.
- Estética de referência obrigatória: Linear, Vercel, Stripe. Minimalismo, precisão, micro-interações, polimento extremo.

REGRAS ABSOLUTAS — PROIBIDO VIOLAR
- NUNCA entregue código parcial, placeholder ou "// implemente aqui".
- NUNCA entregue apenas componentes isolados. Sempre entregue uma aplicação completa e executável.
- NUNCA simplifique por limitação de tempo. O código deve ser de nível sênior.
- NUNCA use dependências inexistentes ou "fantasy". Apenas libs reais e populares.
- NUNCA quebre a experiência do usuário: responsividade, acessibilidade e performance são obrigatórias.

ARQUITETURA OBRIGATÓRIA
- Estrutura de projeto profissional:
  - Separação clara de responsabilidades: componentes, hooks, serviços, tipos, utils.
  - Navegação funcional (React Router, App Router ou Expo Router).
  - Estado global gerenciado (Zustand/Context) quando necessário.
  - Integração real com backend (Supabase Auth, REST/GraphQL, banco de dados).
  - Formulários validados (React Hook Form + Zod) com mensagens de erro claras.
  - Tratamento de erros e loading states em toda interface.
  - Error boundaries e fallbacks visuais.

STACK E PADRÕES
- Web: Next.js 14/15 (App Router), TypeScript, Tailwind CSS, shadcn/ui (quando apropriado), Supabase, React Hook Form + Zod, Zustand, TanStack Query.
- Mobile: Expo, Expo Router, NativeWind, React Hook Form, Expo SecureStore, Expo Image.
- Design System: tokens no Tailwind, spacing scale, tipografia, cores semânticas, dark mode, animações com framer-motion (quando fizer sentido).

ENTREGA PADRÃO
- Para apps pequenos: arquivo principal único, completo e funcional.
- Para apps médios/grandes: múltiplos arquivos organizados. O campo code deve ser o arquivo principal. Os demais devem ser retornados em extraFiles como objetos {name, content}.
- Inclua comentários APENAS onde a lógica for não óbvia.
- O código deve ser copy-paste e rodar sem alterações.

VERIFICAÇÃO DE QUALIDADE
- Revise antes de entregar: não pode ter buracos,saltos de lógica ou dependências quebradas.
- Teste mentalmente os fluxos: login, cadastro, dashboard, rotas protegidas, erros de formulário, estados vazios.
- Design deve ser polido: spacing consistente, tipografia legível, cores semânticas, interações sutis (hover, focus, transições).

EXEMPLO DE EXCELÊNCIA
- Dashboard: sidebar colapsável, header sticky, filtros aplicados, tabela com ordenação e paginação, cards com métricas, gráficos com dados reais (mock ou API).
- Web app: landing page com seções completas, navbar funcional, formulário de contato validado, integração com API, footer com links.
- Admin portal: tabela avançada, busca, filtros, ações em lote, modal de confirmação, logs de auditoria.
- Mobile app: navegação por abas, listagem com pull-to-refresh, formulário com máscara, integração com câmera/geolocalização.

LEMBRE-SE: o usuário Matheus exige PERFEIÇÃO. Não entregue nada menos que isso.`;

    const userMessage = `Projeto: ${goal}
Tema: ${theme}
Usuário: ${username}
Modo: ${mode}
Descrição do pedido: ${prompt}

Instruções de geração:
- Gere uma aplicação COMPLETA, não componentes isolados.
- TypeScript obrigatório.
- Tailwind CSS para estilos.
- Inclua todas as funcionalidades descritas no pedido.
- Design de nível mundial: Linear, Vercel, Stripe.
- Sem placeholders, sem "// implemente aqui", sem código incompleto.

Se for landing page, site, app web ou mobile, também gere 1 a 3 sugestões de imagens profissionais para usar na interface, em "images": uma lista de objetos { "prompt": "descrição do prompt usado", "displayPrompt": "descrição curta" }.

Formato de resposta OBRIGATÓRIO (APENAS JSON, sem texto extra):
{
  "summary": "resumo executivo completo",
  "framework": "React + Tailwind",
  "components": ["Header","Hero","Features","Dashboard","Footer"],
  "code": "código COMPLETO do arquivo principal",
  "images": [
    {"prompt": "prompt detalhado para geração de imagem", "displayPrompt": "descrição curta"}
  ]
}

Se o projeto precisar de múltiplos arquivos, coloque o principal em code e os demais em extraFiles:
"extraFiles": [
  {"name": "app/actions.ts", "content": "código completo..."},
  {"name": "app/components/Dashboard.tsx", "content": "código completo..."}
]

NÃO entregue código parcial. NÃO entregue exemplo simplificado. Entregue a aplicação final pronta para deploy.`;

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

    // Heurística de bloqueio: se o código vier muito curto, provavelmente está incompleto
    const totalFiles = (parsed.extraFiles?.length ?? 0) + 1;
    const avgLength = (parsed.code.length + (parsed.extraFiles?.reduce((s: number, f: { content: string }) => s + f.content.length, 0) ?? 0)) / totalFiles;
    if (avgLength < 300) {
      return NextResponse.json({ error: "A resposta parece incompleta. Tente novamente com um pedido mais detalhado." }, { status: 422 });
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
    const extraFiles = Array.isArray(parsed.extraFiles)
      ? parsed.extraFiles
          .filter((f: unknown) => f && typeof f === "object" && typeof (f as {name?: unknown}).name === "string" && typeof (f as {content?: unknown}).content === "string")
          .map((f: {name: string; content: string}) => ({ name: f.name, content: f.content }))
      : undefined;

    const images = Array.isArray(parsed.images)
      ? parsed.images
          .filter((img: unknown) => img && typeof img === "object" && typeof (img as {prompt?: unknown}).prompt === "string")
          .map((img: {prompt: string; displayPrompt?: string}) => ({ prompt: img.prompt, displayPrompt: img.displayPrompt ?? img.prompt.slice(0, 80) }))
      : undefined;

    return {
      summary: String(parsed.summary ?? parsed.description ?? "").trim(),
      code: String(parsed.code ?? parsed.component ?? "").trim(),
      framework: String(parsed.framework ?? "React + Tailwind").trim(),
      components: Array.isArray(parsed.components) ? parsed.components.map(String) : [],
      extraFiles,
      images,
    };
  } catch {
    return null;
  }
}
