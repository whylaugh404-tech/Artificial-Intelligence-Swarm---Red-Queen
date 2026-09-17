import { InformationCategory, InformationRecord } from './types';

export interface CategoryScore {
  category: InformationCategory;
  score: number;
  matchedKeywords: string[];
}

export interface ClassificationResult {
  primaryCategory: InformationCategory;
  confidence: number;
  allScores: CategoryScore[];
}

export class InformationClassifier {
  private categoryKeywords: Map<InformationCategory, string[]> = new Map([
    [
      InformationCategory.CYBERSECURITY,
      [
        'vulnerability', 'cve', 'exploit', 'security', 'threat', 'ioc', 'firewall',
        'malware', 'payload', 'injection', 'overflow', 'xss', 'csrf', 'audit',
        'pentest', 'osint', 'reconnaissance', 'mitigation', 'defense', 'attack',
        'auth', 'cryptography', 'credential', 'patch', 'zero-day', 'phishing'
      ]
    ],
    [
      InformationCategory.NETWORKING,
      [
        'network', 'tcp', 'udp', 'ip', 'routing', 'socket', 'packet', 'dns',
        'dhcp', 'protocol', 'http', 'https', 'websocket', 'k-bucket', 'xor',
        'subnet', 'port', 'latency', 'bandwidth', 'kademlia', 'p2p', 'peer',
        'gateway', 'ethernet', 'vpn', 'proxy', 'tls', 'ssl'
      ]
    ],
    [
      InformationCategory.PROGRAMMING,
      [
        'code', 'programming', 'javascript', 'typescript', 'python', 'rust', 'c++',
        'function', 'class', 'method', 'variable', 'algorithm', 'syntax', 'compiler',
        'git', 'repo', 'async', 'promise', 'loop', 'typing', 'refactor', 'debug',
        'object', 'array', 'closure', 'interface', 'generic'
      ]
    ],
    [
      InformationCategory.OPERATING_SYSTEM,
      [
        'operating system', 'os', 'linux', 'windows', 'kernel', 'process', 'thread',
        'syscall', 'daemon', 'posix', 'scheduler', 'filesystem', 'permission',
        'unix', 'macos', 'init', 'systemd', 'driver', 'swap', 'page fault'
      ]
    ],
    [
      InformationCategory.SOFTWARE,
      [
        'software', 'architecture', 'microservice', 'database', 'docker', 'container',
        'kubernetes', 'deployment', 'frontend', 'backend', 'framework', 'react',
        'library', 'testing', 'ci/cd', 'build', 'module', 'package', 'api'
      ]
    ],
    [
      InformationCategory.HARDWARE,
      [
        'hardware', 'cpu', 'gpu', 'ram', 'arm', 'x86', 'firmware', 'bus',
        'register', 'storage', 'ssd', 'nvme', 'microcontroller', 'fpga',
        'motherboard', 'chipset', 'cache', 'sensor'
      ]
    ],
    [
      InformationCategory.AI,
      [
        'artificial intelligence', 'ai', 'machine learning', 'deep learning', 'llm',
        'neural network', 'transformer', 'embeddings', 'model', 'training',
        'inference', 'agent', 'prompt', 'reasoning', 'cognitive', 'nlp'
      ]
    ],
    [
      InformationCategory.COMPUTER_SCIENCE,
      [
        'computer science', 'data structure', 'graph', 'tree', 'complexity', 'big o',
        'automata', 'state machine', 'distributed system', 'consensus', 'raft',
        'paxos', 'byzantine', 'concurrency', 'formal verification'
      ]
    ],
    [
      InformationCategory.GENERAL_TECHNOLOGY,
      [
        'technology', 'tech', 'digital', 'device', 'cloud', 'internet',
        'specification', 'standard', 'telecom', 'platform', 'infrastructure'
      ]
    ]
  ]);

  /**
   * Registers or extends keywords for a category
   */
  public registerKeywords(category: InformationCategory, keywords: string[]): void {
    const existing = this.categoryKeywords.get(category) || [];
    const merged = Array.from(new Set([...existing, ...keywords.map(k => k.toLowerCase().trim())]));
    this.categoryKeywords.set(category, merged);
  }

  /**
   * Classifies an InformationRecord into structured categories with deterministic scoring.
   */
  public classify(record: InformationRecord): ClassificationResult {
    const textToAnalyze = `${record.sourceIdentifier} ${record.content} ${JSON.stringify(record.metadata)}`.toLowerCase();

    const scores: CategoryScore[] = [];

    for (const [category, keywords] of this.categoryKeywords.entries()) {
      const matched: string[] = [];
      let totalMatches = 0;

      for (const keyword of keywords) {
        // Fast word boundary / substring matching
        let pos = 0;
        let count = 0;
        while ((pos = textToAnalyze.indexOf(keyword, pos)) !== -1) {
          count++;
          pos += keyword.length;
          if (count > 20) break; // Bound maximum matches per keyword
        }

        if (count > 0) {
          matched.push(keyword);
          totalMatches += count;
        }
      }

      // Compute raw score based on keyword coverage and occurrences
      const coverage = matched.length / Math.max(1, keywords.length);
      const frequencyScore = Math.min(1.0, totalMatches / 10);
      const score = Math.min(1.0, (coverage * 0.4) + (frequencyScore * 0.6));

      if (score > 0) {
        scores.push({
          category,
          score,
          matchedKeywords: matched
        });
      }
    }

    // Sort descending by score
    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0 || scores[0].score < 0.1) {
      return {
        primaryCategory: InformationCategory.UNKNOWN,
        confidence: 0.0, // P7: UNKNOWN has no confidence weight
        allScores: scores
      };
    }

    const top = scores[0];
    return {
      primaryCategory: top.category,
      confidence: Math.max(0.1, Math.min(1.0, top.score)),
      allScores: scores
    };
  }
}
