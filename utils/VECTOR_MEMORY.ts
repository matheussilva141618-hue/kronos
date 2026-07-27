/**
 * KRONOS — Vector Memory Service v2.0
 * Memória vetorial com HNSW-style index em memória + Grafo de Conhecimento Cross-Domain.
 *
 * Arquitetura:
 * - Embedding esparso 1536D (TF-IDF determinístico) — sem API externa
 * - HNSW aproximado em memória para buscas sub-lineares quando o índice está quente
 * - Grafo de conhecimento: nós são memórias, arestas são similaridade > threshold
 * - Cross-domain: conecta memórias de usuário + conhecimento do cognitive worker
 *
 * Para produção com embeddings densos: substitua generateEmbedding() por
 * OpenAI text-embedding-3-small ou Cohere embed-multilingual-v3.
 */

import { createServiceClient } from '@/utils/supabase/service';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MemoryVector {
  id:         string;
  content:    string;
  metadata:   Record<string, unknown>;
  similarity: number;
}

export interface SelfCorrection {
  id:         string;
  original:   string;
  correction: string;
  context?:   string;
  priority:   number;
  created_at: string;
}

export interface KnowledgeNode {
  id:       string;
  content:  string;
  domain:   string;
  weight:   number;
  edges:    string[];  // IDs de nós conectados (similaridade > threshold)
}

export interface CrossDomainResult {
  memories:    MemoryVector[];
  knowledge:   MemoryVector[];
  graph:       KnowledgeNode[];
  fusedContext: string;
}

// ─── HNSW-style Index em memória ──────────────────────────────────────────────
// Índice hierárquico de nós: camadas superiores têm poucos nós (skip-graph),
// camada base tem todos. Busca O(log n) no caso médio.

interface HNSWNode {
  id:        string;
  vector:    number[];
  content:   string;
  metadata:  Record<string, unknown>;
  neighbors: Map<number, string[]>;  // layer → neighbor IDs
}

class HNSWIndex {
  private nodes = new Map<string, HNSWNode>();
  private layers: string[][] = [[]];  // layer 0 = base
  private entryPoint: string | null = null;
  private readonly M = 16;       // max connections per node per layer
  private readonly efSearch = 40; // size of dynamic candidate list
  private readonly mL = 1 / Math.log(this.M); // level normalization factor

  // Gera nível aleatório (distribuição exponencial — igual ao HNSW real)
  private randomLevel(): number {
    let l = 0;
    while (Math.random() < 0.5 && l < 6) l++;
    return l;
  }

  insert(id: string, vector: number[], content: string, metadata: Record<string, unknown> = {}): void {
    const level = this.randomLevel();
    const node: HNSWNode = { id, vector, content, metadata, neighbors: new Map() };
    for (let l = 0; l <= level; l++) node.neighbors.set(l, []);
    this.nodes.set(id, node);

    // Expande camadas se necessário
    while (this.layers.length <= level) this.layers.push([]);
    for (let l = 0; l <= level; l++) this.layers[l].push(id);

    if (!this.entryPoint) { this.entryPoint = id; return; }

    // Conecta novo nó: greedy search a partir do entry point
    let ep = this.entryPoint;
    for (let l = Math.min(level, this.layers.length - 1); l >= 0; l--) {
      const candidates = this.searchLayer(vector, ep, this.efSearch, l);
      const neighbors = candidates.slice(0, this.M).map(c => c.id);
      node.neighbors.set(l, neighbors);

      // Atualiza vizinhos (add back-edge, prune se > M)
      for (const nid of neighbors) {
        const nnode = this.nodes.get(nid);
        if (!nnode) continue;
        const existing = nnode.neighbors.get(l) ?? [];
        existing.push(id);
        // Prune: mantém os M mais próximos
        if (existing.length > this.M) {
          const pruned = existing
            .map(eid => ({ id: eid, d: cosineSimilarity(vector, this.nodes.get(eid)?.vector ?? []) }))
            .sort((a, b) => b.d - a.d)
            .slice(0, this.M)
            .map(e => e.id);
          nnode.neighbors.set(l, pruned);
        } else {
          nnode.neighbors.set(l, existing);
        }
      }
      if (candidates.length > 0) ep = candidates[0].id;
    }
  }

  // Greedy best-first search em uma camada
  private searchLayer(
    query: number[], ep: string, ef: number, layer: number
  ): { id: string; similarity: number }[] {
    const epNode = this.nodes.get(ep);
    if (!epNode) return [];

    const visited  = new Set<string>([ep]);
    const epSim    = cosineSimilarity(query, epNode.vector);
    const candidates: { id: string; similarity: number }[] = [{ id: ep, similarity: epSim }];
    const results:    { id: string; similarity: number }[] = [{ id: ep, similarity: epSim }];

    while (candidates.length > 0) {
      const current = candidates.pop()!;
      const worstResult = results[results.length - 1]?.similarity ?? -1;
      if (current.similarity < worstResult && results.length >= ef) break;

      const node = this.nodes.get(current.id);
      if (!node) continue;

      for (const nid of node.neighbors.get(layer) ?? []) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        const nnode = this.nodes.get(nid);
        if (!nnode) continue;
        const sim = cosineSimilarity(query, nnode.vector);
        if (sim > worstResult || results.length < ef) {
          candidates.push({ id: nid, similarity: sim });
          results.push({ id: nid, similarity: sim });
          results.sort((a, b) => b.similarity - a.similarity);
          if (results.length > ef) results.pop();
          candidates.sort((a, b) => a.similarity - b.similarity);
        }
      }
    }
    return results;
  }

  search(query: number[], k: number, threshold: number): { id: string; similarity: number }[] {
    if (!this.entryPoint || this.nodes.size === 0) return [];
    const ep = this.entryPoint;
    const results = this.searchLayer(query, ep, Math.max(this.efSearch, k * 2), 0);
    return results.filter(r => r.similarity >= threshold).slice(0, k);
  }

  get(id: string): HNSWNode | undefined { return this.nodes.get(id); }
  get size(): number { return this.nodes.size; }
  clear(): void { this.nodes.clear(); this.layers = [[]]; this.entryPoint = null; }
}

// Índice global por usuário (warm cache — TTL de 5 minutos)
interface CachedIndex { index: HNSWIndex; builtAt: number; }
const hnswCache = new Map<string, CachedIndex>();
const HNSW_TTL  = 5 * 60 * 1000; // 5 min

function getCachedIndex(username: string): HNSWIndex | null {
  const cached = hnswCache.get(username);
  if (!cached) return null;
  if (Date.now() - cached.builtAt > HNSW_TTL) { hnswCache.delete(username); return null; }
  return cached.index;
}
function setCachedIndex(username: string, index: HNSWIndex): void {
  hnswCache.set(username, { index, builtAt: Date.now() });
}

// ─── Embedding esparso 1536D ──────────────────────────────────────────────────

export function generateEmbedding(text: string): number[] {
  const dim    = 1536;
  const vector = new Array(dim).fill(0) as number[];
  const tokens = text
    .toLowerCase()
    .replace(/[^a-záéíóúàâêôãõüçñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  for (const token of tokens) {
    let h = 5381;
    for (let i = 0; i < token.length; i++) {
      h = ((h << 5) + h) ^ token.charCodeAt(i);
      h = h >>> 0;
    }
    // Bi-gram boost: mapeia dois tokens consecutivos para dimensão extra
    const idx = h % dim;
    vector[idx] += 1;
  }

  // Bigram features para capturar contexto local
  for (let i = 0; i < tokens.length - 1; i++) {
    const bi = tokens[i] + '_' + tokens[i + 1];
    let h = 5381;
    for (let j = 0; j < bi.length; j++) {
      h = ((h << 5) + h) ^ bi.charCodeAt(j);
      h = h >>> 0;
    }
    vector[h % dim] += 0.5;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map(v => v / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

// ─── Salva memória vetorial ───────────────────────────────────────────────────

export async function saveVectorMemory(
  username:  string,
  content:   string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!content?.trim() || content.length < 20) return;
  try {
    const sb        = createServiceClient();
    const embedding = generateEmbedding(content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from('kronos_memory').insert({
      username,
      content:   content.slice(0, 2000),
      embedding: `[${embedding.join(',')}]`,
      metadata:  metadata ?? {},
    });
    // Invalida cache do índice HNSW para este usuário
    hnswCache.delete(username);
  } catch (err) {
    console.error('[VectorMemory] save erro:', err instanceof Error ? err.message : err);
  }
}

// ─── Constrói índice HNSW a partir do Supabase ───────────────────────────────

async function buildHNSWIndex(username: string): Promise<HNSWIndex> {
  const existing = getCachedIndex(username);
  if (existing) return existing;

  const sb = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb as any)
    .from('kronos_memory')
    .select('id, content, embedding, metadata')
    .eq('username', username)
    .order('created_at', { ascending: false })
    .limit(500);

  const index = new HNSWIndex();
  for (const row of data ?? []) {
    try {
      const emb = typeof row.embedding === 'string'
        ? JSON.parse(row.embedding) as number[]
        : row.embedding as number[];
      if (emb?.length === 1536) {
        index.insert(row.id, emb, row.content, row.metadata ?? {});
      }
    } catch { /* skip malformed */ }
  }
  setCachedIndex(username, index);
  return index;
}

// ─── Busca com HNSW (primário) + fallback linear ──────────────────────────────

export async function searchSimilarMemories(
  username:  string,
  query:     string,
  threshold: number = 0.65,
  limit:     number = 4
): Promise<MemoryVector[]> {
  let timedOut = false;
  const timeoutP = new Promise<MemoryVector[]>(resolve =>
    setTimeout(() => { timedOut = true; resolve([]); }, 1200)
  );
  const searchP = _searchSimilarMemories(username, query, threshold, limit);
  const result  = await Promise.race([searchP, timeoutP]);
  if (timedOut && process.env.NODE_ENV === 'development') {
    console.warn('[VectorMemory] timeout — retornando vazio');
  }
  return result;
}

async function _searchSimilarMemories(
  username:  string,
  query:     string,
  threshold: number,
  limit:     number
): Promise<MemoryVector[]> {
  try {
    const sb    = createServiceClient();
    const qEmb  = generateEmbedding(query);

    // 1. Tenta RPC pgvector (match_memories)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcErr } = await (sb as any).rpc('match_memories', {
      query_embedding:  `[${qEmb.join(',')}]`,
      match_username:   username,
      match_threshold:  threshold,
      match_count:      limit,
    });
    if (!rpcErr && rpcData?.length) {
      return rpcData.map((r: { id: string; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
        id: r.id, content: r.content, metadata: r.metadata ?? {}, similarity: r.similarity,
      }));
    }

    // 2. HNSW em memória (warm index)
    const index = await buildHNSWIndex(username);
    if (index.size > 0) {
      const hits = index.search(qEmb, limit, threshold);
      if (hits.length > 0) {
        return hits.map(h => {
          const node = index.get(h.id);
          return {
            id: h.id,
            content:    node?.content  ?? '',
            metadata:   node?.metadata ?? {},
            similarity: h.similarity,
          };
        });
      }
    }

    // 3. Fallback linear (sem índice)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (sb as any)
      .from('kronos_memory')
      .select('id, content, embedding, metadata')
      .eq('username', username)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!rows?.length) return [];
    return (rows as { id: string; content: string; embedding: string | number[]; metadata: Record<string, unknown> }[])
      .map(r => {
        const emb = typeof r.embedding === 'string' ? JSON.parse(r.embedding) as number[] : r.embedding;
        return { id: r.id, content: r.content, metadata: r.metadata ?? {}, similarity: cosineSimilarity(qEmb, emb) };
      })
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

  } catch (err) {
    console.error('[VectorMemory] search erro:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Grafo de Conhecimento Cross-Domain ──────────────────────────────────────
// Conecta memórias do usuário com o conhecimento adquirido autonomamente.
// Nós: memórias + conhecimentos. Arestas: similaridade > 0.55.
// Permite traversal cruzado: "o que eu sei sobre X conecta com o que Kronos aprendeu sobre Y?"

export async function buildKnowledgeGraph(
  username: string,
  query:    string,
  limit:    number = 5
): Promise<CrossDomainResult> {
  const qEmb = generateEmbedding(query);

  try {
    const sb = createServiceClient();

    // Busca em paralelo: memórias do usuário + conhecimentos do cognitive worker
    const [userMems, sysKnowledge] = await Promise.all([
      searchSimilarMemories(username, query, 0.55, limit),
      // Busca vetorial no conhecimento global (__system__)
      _searchSimilarMemories('__system__', query, 0.50, limit),
    ]);

    // Se não há resultado vetorial para __system__, busca textual no Supabase
    let knowledgeVectors = sysKnowledge;
    if (!knowledgeVectors.length) {
      const msgWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      if (msgWords.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (sb as any)
          .from('conhecimentos_kronos')
          .select('id, topico, conteudo_refinado, dominio, quality_score')
          .gte('quality_score', 7)
          .or(msgWords.slice(0, 3).map((w: string) => `topico.ilike.%${w}%`).join(','))
          .order('quality_score', { ascending: false })
          .limit(limit);
        if (data?.length) {
          knowledgeVectors = (data as { id: string; topico: string; conteudo_refinado: string; dominio: string; quality_score: number }[]).map(k => ({
            id:         k.id,
            content:    `[${k.dominio}] ${k.topico}: ${(k.conteudo_refinado ?? '').slice(0, 300)}`,
            metadata:   { domain: k.dominio, score: k.quality_score, type: 'knowledge' },
            similarity: 0.6,
          }));
        }
      }
    }

    // Constrói nós do grafo
    const allNodes: KnowledgeNode[] = [
      ...userMems.map(m => ({
        id:      m.id,
        content: m.content,
        domain:  (m.metadata?.mode as string) ?? 'user',
        weight:  m.similarity,
        edges:   [] as string[],
      })),
      ...knowledgeVectors.map(k => ({
        id:      k.id,
        content: k.content,
        domain:  (k.metadata?.domain as string) ?? 'knowledge',
        weight:  k.similarity,
        edges:   [] as string[],
      })),
    ];

    // Conecta nós por similaridade cruzada (cross-domain edges)
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const embI = generateEmbedding(allNodes[i].content);
        const embJ = generateEmbedding(allNodes[j].content);
        const sim  = cosineSimilarity(embI, embJ);
        if (sim > 0.55) {
          allNodes[i].edges.push(allNodes[j].id);
          allNodes[j].edges.push(allNodes[i].id);
        }
      }
    }

    // Funde contexto: nós com mais conexões = mais centrais = primeiro
    const sorted = allNodes.sort((a, b) => (b.edges.length + b.weight) - (a.edges.length + a.weight));
    const fusedContext = sorted
      .slice(0, 4)
      .map(n => `[${n.domain.toUpperCase()}|sim=${n.weight.toFixed(2)}|edges=${n.edges.length}] ${n.content.slice(0, 200)}`)
      .join('\n');

    return {
      memories:    userMems,
      knowledge:   knowledgeVectors,
      graph:       allNodes,
      fusedContext,
    };
  } catch (err) {
    console.error('[KnowledgeGraph] erro:', err instanceof Error ? err.message : err);
    return { memories: [], knowledge: [], graph: [], fusedContext: '' };
  }
}

// ─── Auto-correção ────────────────────────────────────────────────────────────

export async function saveSelfCorrection(
  username:   string,
  original:   string,
  correction: string,
  context?:   string,
  priority:   number = 9
): Promise<void> {
  try {
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from('self_corrections').insert({
      username,
      original:   original.slice(0, 1000),
      correction: correction.slice(0, 1000),
      context:    context?.slice(0, 500),
      priority,
    });
    // Salva também como memória vetorial com peso máximo
    await saveVectorMemory(username,
      `CORREÇÃO APRENDIDA: "${correction}"`,
      { type: 'self_correction', original: original.slice(0, 200), priority, synapticWeight: 10 }
    );
  } catch (err) {
    console.error('[SelfCorrection] save erro:', err instanceof Error ? err.message : err);
  }
}

export async function loadSelfCorrections(
  username: string,
  limit:    number = 4
): Promise<SelfCorrection[]> {
  try {
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from('self_corrections')
      .select('id, original, correction, context, priority, created_at')
      .eq('username', username)
      .gte('priority', 7)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch { return []; }
}

// ─── Formata contexto vetorial + grafo para system prompt ────────────────────

export function formatVectorContext(
  memories:    MemoryVector[],
  corrections: SelfCorrection[]
): string {
  const parts: string[] = [];

  if (memories.length) {
    const lines = memories
      .slice(0, 3)
      .map(m => `• [${Math.round(m.similarity * 100)}%] ${m.content.slice(0, 160)}`)
      .join('\n');
    parts.push(`MEMÓRIA VETORIAL RELEVANTE:\n${lines}`);
  }

  if (corrections.length) {
    const lines = corrections
      .slice(0, 3)
      .map(c => `• NUNCA repita: "${c.original.slice(0, 60)}" → correto: "${c.correction.slice(0, 60)}"`)
      .join('\n');
    parts.push(`AUTO-CORREÇÕES (aplique sempre):\n${lines}`);
  }

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

export function formatGraphContext(graph: CrossDomainResult): string {
  if (!graph.fusedContext) return '';
  return `\n\nGRAFO CROSS-DOMAIN (${graph.graph.length} nós, ${graph.graph.reduce((s, n) => s + n.edges.length, 0)} arestas):\n${graph.fusedContext}`;
}

// ─── Detecta correção explícita do usuário ────────────────────────────────────

export function detectCorrection(message: string, lastAssistantReply: string): {
  isCorrection: boolean;
  correction:   string;
} {
  const correctionPatterns = [
    /n[ãa]o[,.]?\s+(?:é|foi|está|era|tá)\s+(.+)/i,
    /(?:errado|incorreto|equivocado)[,.]?\s+(?:é|o certo é|correto é)\s+(.+)/i,
    /(?:na verdade|na real|na prática)[,.]?\s+(.+)/i,
    /(?:corrij[ae]|corret[ao] é)[,.]?\s+(.+)/i,
    /você\s+(?:errou|falhou|confundiu)[,.]?\s*(.+)/i,
  ];

  for (const rx of correctionPatterns) {
    const m = message.match(rx);
    if (m?.[1]) return { isCorrection: true, correction: m[1].trim() };
  }

  if (lastAssistantReply && message.length < 200 && /não|nunca|errado|incorreto/i.test(message)) {
    return { isCorrection: true, correction: message };
  }
  return { isCorrection: false, correction: '' };
}

// ─── Atualiza peso sináptico (reforço pós-feedback positivo) ─────────────────

export async function updateSynapticWeight(
  username: string,
  content:  string,
  boost:    number = 1
): Promise<void> {
  try {
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from('kronos_memory')
      .select('id, metadata')
      .eq('username', username)
      .ilike('content', `%${content.slice(0, 30)}%`)
      .limit(1);

    if (data?.length) {
      const current = (data[0].metadata as { synapticWeight?: number })?.synapticWeight ?? 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('kronos_memory').update({
        metadata: {
          ...data[0].metadata,
          synapticWeight: Math.min(10, current + boost),
          lastReinforced: new Date().toISOString(),
        },
      }).eq('id', data[0].id);
    }
    hnswCache.delete(username); // Invalida cache
  } catch { /* não bloqueia */ }
}
