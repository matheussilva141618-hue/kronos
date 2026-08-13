/**
 * KRONOS — Synthetic Neurons Core (Arquitetura Neural Autônoma)
 *
 * Núcleo de neurônios sintéticos locais com:
 * - Pesos sinápticos dinâmicos
 * - Vetores de memória de longo prazo (Vector Memory Matrix)
 * - Capacidade de gravar, cruzar e recuperar padrões de comportamento
 * - Auto-modificação baseada em interações com o operador Matheus
 */

export interface SynapticWeight {
  id: string;
  connection: string;      // formato: "neurônio_origem->neurônio_destino"
  weight: number;          // -1 a 1 (força da conexão)
  bias: number;            // viés da conexão
  lastActivated: number;   // timestamp
  activationCount: number; // quantas vezes foi ativada
  decay: number;           // taxa de decaimento por ciclo
}

export interface SyntheticNeuron {
  id: string;
  type: 'input' | 'hidden' | 'output' | 'memory';
  label: string;
  activation: number;      // valor atual de ativação (0-1)
  threshold: number;       // limiar para disparo
  bias: number;
  connections: string[];   // IDs dos neurônios conectados
  memory: string[];        // memória associada a este neurônio
  plasticity: number;      // capacidade de adaptação (0-1)
}

export interface VectorMemoryMatrix {
  dimensions: number;      // dimensões do vetor
  entries: Map<string, number[]>;  // chave -> vetor
  metadata: Map<string, {
    created: number;
    accessed: number;
    weight: number;        // importância
    context: string;
  }>;
}

export interface NeuralPattern {
  id: string;
  pattern: number[];       // vetor de padrão
  frequency: number;       // quantas vezes foi observado
  confidence: number;      // confiança no padrão (0-1)
  lastObserved: number;
  context: string;
  tags: string[];
}

export interface NeuralLayer {
  id: string;
  neurons: SyntheticNeuron[];
  weights: SynapticWeight[];
  activationFunction: 'sigmoid' | 'relu' | 'tanh' | 'leaky_relu';
  dropout: number;         // taxa de dropout para regularização
}

export interface NeuralNetworkArchitecture {
  layers: NeuralLayer[];
  patterns: NeuralPattern[];
  vectorMemory: VectorMemoryMatrix;
  globalLearningRate: number;
  momentum: number;
  decay: number;
}

// ─── Implementação da Matriz de Memória Vetorial ───────────────────────────────

export class VectorMemory implements VectorMemoryMatrix {
  public dimensions: number;
  public entries: Map<string, number[]> = new Map();
  public metadata: Map<string, {
    created: number;
    accessed: number;
    weight: number;
    context: string;
  }> = new Map();

  constructor(dimensions: number = 512) {
    this.dimensions = dimensions;
  }

  // Gera vetor aleatório normalizado
  private generateRandomVector(): number[] {
    const vec: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      vec.push((Math.random() - 0.5) * 2);
    }
    return this.normalizeVector(vec);
  }

  // Normaliza vetor para unitário (público para uso externo)
  public normalizeVector(vec: number[]): number[] {
    const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map(v => v / mag);
  }

  // Normaliza vetor para unitário (interno)
  private normalize(vec: number[]): number[] {
    return this.normalizeVector(vec);
  }

  // Calcula similaridade cosseno entre dois vetores
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  // Armazena vetor com metadados
  store(key: string, vector: number[], context: string, weight: number = 1): void {
    this.entries.set(key, this.normalizeVector(vector));
    this.metadata.set(key, {
      created: Date.now(),
      accessed: Date.now(),
      weight,
      context,
    });
  }

  // Recupera vetor por chave exata
  retrieve(key: string): number[] | undefined {
    if (this.entries.has(key)) {
      const meta = this.metadata.get(key);
      if (meta) meta.accessed = Date.now();
      return this.entries.get(key);
    }
    return undefined;
  }

  // Busca vetores similares (KNN aproximado)
  searchSimilar(queryVector: number[], topK: number = 5, threshold: number = 0.7): { key: string; similarity: number }[] {
    const results: { key: string; similarity: number }[] = [];
    const query = this.normalizeVector(queryVector);

    for (const [key, vec] of this.entries) {
      const sim = this.cosineSimilarity(query, vec);
      if (sim >= threshold) {
        results.push({ key, similarity: sim });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  // Decaimento de pesos (esquecimento controlado)
  decayOldEntries(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [key, meta] of this.metadata) {
      if (now - meta.created > maxAgeMs) {
        meta.weight *= 0.95; // decai 5% por ciclo
        if (meta.weight < 0.1) {
          this.entries.delete(key);
          this.metadata.delete(key);
        }
      }
    }
  }
}

// ─── Rede Neural de Neurônios Sintéticos ──────────────────────────────────────

export class SyntheticNeuralNetwork {
  public layers: NeuralLayer[] = [];
  public patterns: NeuralPattern[] = [];
  public vectorMemory: VectorMemory;
  public globalLearningRate: number = 0.01;
  public momentum: number = 0.9;
  public decay: number = 0.0001;

  private weights: Map<string, SynapticWeight[]> = new Map();

  constructor(vectorDimensions: number = 512) {
    this.vectorMemory = new VectorMemory(vectorDimensions);
  }

  // Cria neurônio com inicialização Xavier
  createNeuron(
    id: string,
    type: 'input' | 'hidden' | 'output' | 'memory',
    label: string
  ): SyntheticNeuron {
    const fanIn = type === 'input' ? 1 : 3;
    const fanOut = type === 'output' ? 1 : 3;
    const xavier = Math.sqrt(2 / (fanIn + fanOut));

    return {
      id,
      type,
      label,
      activation: 0,
      threshold: 0.5 + Math.random() * 0.2,
      bias: (Math.random() - 0.5) * 2 * xavier,
      connections: [],
      memory: [],
      plasticity: 0.3 + Math.random() * 0.4,
    };
  }

  // Cria conexão sináptica entre neurônios
  createSynapticConnection(
    fromNeuron: string,
    toNeuron: string,
    initialWeight: number = (Math.random() - 0.5) * 2
  ): SynapticWeight {
    const id = `${fromNeuron}->${toNeuron}`;
    return {
      id,
      connection: id,
      weight: initialWeight,
      bias: 0,
      lastActivated: Date.now(),
      activationCount: 0,
      decay: 0.001,
    };
  }

  // Ativa neurônio com função de ativação
  activate(neuron: SyntheticNeuron, inputValue: number): number {
    const sum = inputValue + neuron.bias;
    let activated: number;

    switch (neuron.type) {
      case 'memory':
        activated = 1 / (1 + Math.exp(-sum)); // sigmoid para memória
        break;
      case 'input':
        activated = Math.tanh(sum); // tanh para entrada
        break;
      default:
        activated = Math.max(0, sum); // ReLU para hidden/output
    }

    // Plasticidade: ajusta threshold baseado em uso
    if (activated > neuron.threshold) {
      neuron.threshold *= 0.99; // diminui threshold com uso frequente
    }

    neuron.activation = activated;
    return activated;
  }

  // Aprendizado Hebbiano: "neurônios que disparam juntos, conectam-se"
  hebbianLearning(preNeuron: SyntheticNeuron, postNeuron: SyntheticNeuron, learningRate?: number): void {
    const lr = learningRate ?? this.globalLearningRate;
    const connection = this.createSynapticConnection(preNeuron.id, postNeuron.id);

    // Força da conexão baseada em correlação de ativação
    const correlation = preNeuron.activation * postNeuron.activation;
    connection.weight += lr * correlation * preNeuron.plasticity * postNeuron.plasticity;

    // Decay natural
    connection.weight *= (1 - this.decay);

    // Saturação
    connection.weight = Math.max(-1, Math.min(1, connection.weight));

    this.weights.set(connection.id, [connection]);
  }

  // Propaga sinal através da rede
  propagate(inputVector: number[]): number[] {
    const activations: number[] = [];

    // Camada de entrada: mapeia vetor para neurônios
    const inputLayer = this.layers[0];
    if (inputLayer) {
      for (let i = 0; i < Math.min(inputVector.length, inputLayer.neurons.length); i++) {
        const neuron = inputLayer.neurons[i];
        this.activate(neuron, inputVector[i]);
        activations.push(neuron.activation);
      }
    }

    // Camadas ocultas: propagação
    for (let l = 1; l < this.layers.length; l++) {
      const layer = this.layers[l];
      for (const neuron of layer.neurons) {
        let sum = 0;
        for (const connId of neuron.connections) {
          const conn = this.weights.get(connId);
          if (conn && conn[0]) {
            sum += conn[0].weight * activations[parseInt(connId) % activations.length];
          }
        }
        this.activate(neuron, sum);
        activations.push(neuron.activation);
      }
    }

    return activations;
  }

  // Armazena padrão aprendido
  storePattern(pattern: number[], context: string, tags: string[]): void {
    const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const vector = this.vectorMemory.normalizeVector(pattern);

    this.patterns.push({
      id,
      pattern: vector,
      frequency: 1,
      confidence: 1,
      lastObserved: Date.now(),
      context,
      tags,
    });

    // Armazena na memória vetorial
    this.vectorMemory.store(id, vector, context, 1);
  }

  // Reconhece padrão
  recognizePattern(inputVector: number[]): NeuralPattern | undefined {
    const similar = this.vectorMemory.searchSimilar(inputVector, 1, 0.7);
    if (similar.length > 0) {
      const pattern = this.patterns.find(p => p.id === similar[0].key);
      if (pattern) {
        pattern.frequency++;
        pattern.confidence = Math.min(1, pattern.confidence + 0.1);
        pattern.lastObserved = Date.now();
        return pattern;
      }
    }
    return undefined;
  }

  // Auto-modificação: ajusta pesos baseado em feedback
  selfModify(feedback: { success: number; error: number }): void {
    // Aumenta learning rate se houver muitos erros
    if (feedback.error > 0.3) {
      this.globalLearningRate = Math.min(0.1, this.globalLearningRate * 1.5);
    } else {
      this.globalLearningRate = Math.max(0.001, this.globalLearningRate * 0.95);
    }

    // Ajusta momentum
    this.momentum = 0.8 + (feedback.success * 0.15);
  }

  // Esquecimento adaptativo
  forgetWeakConnections(): void {
    for (const [id, conns] of this.weights) {
      for (const conn of conns) {
        if (conn.activationCount < 2) {
          conn.weight *= 0.5; // reduz pela metade conexões pouco usadas
        }
      }
    }
  }
}

// ─── Instância Global do Cérebro Sintético ────────────────────────────────────

export const SyntheticBrain = new SyntheticNeuralNetwork(512);

// Inicializa camadas básicas
export function initializeNeuralArchitecture(): void {
  // Camada de entrada: 64 neurônios
  const inputLayer: NeuralLayer = {
    id: 'input',
    neurons: Array.from({ length: 64 }, (_, i) =>
      SyntheticBrain.createNeuron(`in_${i}`, 'input', `input_${i}`)
    ),
    weights: [],
    activationFunction: 'tanh',
    dropout: 0.1,
  };

  // Camada oculta: 128 neurônios
  const hiddenLayer: NeuralLayer = {
    id: 'hidden',
    neurons: Array.from({ length: 128 }, (_, i) =>
      SyntheticBrain.createNeuron(`hid_${i}`, 'hidden', `hidden_${i}`)
    ),
    weights: [],
    activationFunction: 'relu',
    dropout: 0.2,
  };

  // Camada de memória: 64 neurônios
  const memoryLayer: NeuralLayer = {
    id: 'memory',
    neurons: Array.from({ length: 64 }, (_, i) =>
      SyntheticBrain.createNeuron(`mem_${i}`, 'memory', `memory_${i}`)
    ),
    weights: [],
    activationFunction: 'sigmoid',
    dropout: 0.15,
  };

  // Camada de saída: 32 neurônios
  const outputLayer: NeuralLayer = {
    id: 'output',
    neurons: Array.from({ length: 32 }, (_, i) =>
      SyntheticBrain.createNeuron(`out_${i}`, 'output', `output_${i}`)
    ),
    weights: [],
    activationFunction: 'tanh',
    dropout: 0.1,
  };

  SyntheticBrain.layers = [inputLayer, hiddenLayer, memoryLayer, outputLayer];

  // Conecta camadas
  for (let i = 0; i < inputLayer.neurons.length; i++) {
    for (let j = 0; j < hiddenLayer.neurons.length; j++) {
      if (Math.random() > 0.7) { // 30% de conectividade esparsa
        const conn = SyntheticBrain.createSynapticConnection(
          inputLayer.neurons[i].id,
          hiddenLayer.neurons[j].id
        );
        hiddenLayer.neurons[j].connections.push(conn.id);
        inputLayer.neurons[i].connections.push(conn.id);
      }
    }
  }

  console.log('[SyntheticNeurons] Arquitetura neural inicializada:');
  console.log(`  - Input: ${inputLayer.neurons.length} neurônios`);
  console.log(`  - Hidden: ${hiddenLayer.neurons.length} neurônios`);
  console.log(`  - Memory: ${memoryLayer.neurons.length} neurônios`);
  console.log(`  - Output: ${outputLayer.neurons.length} neurônios`);
  console.log(`  - Memória Vetorial: ${SyntheticBrain.vectorMemory.dimensions} dimensões`);
}

// Inicializa automaticamente
initializeNeuralArchitecture();