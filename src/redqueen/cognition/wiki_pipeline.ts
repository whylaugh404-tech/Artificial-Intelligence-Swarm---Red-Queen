/**
 * Red Queen Wikipedia Real-World Knowledge Ingestion Pipeline
 * 
 * Fetches real, verified encyclopedic facts directly from Wikipedia REST and Action APIs,
 * extracts canonical Subject-Predicate-Object triplets, and encodes them into
 * Red Queen's Contiguous Binary HDC Slab Index.
 * 
 * Features:
 * - Polite rate-limiting & custom User-Agent to respect Wikimedia API policies
 * - Domain curation across Computer Science, Cybersecurity, Science, History, and Geography
 * - Automatic triplet extraction from first-paragraph lead extracts
 * - Persistent storage in data/real_wiki_facts.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { CompactHdcIndex, KnowledgeFact } from './knowledge_distillation';
import { Hypervector, bundle } from './hdc';
import { logger } from '../core/logger';

export interface RealWikiFact {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  domain: string;
  summary: string;
  sourceUrl: string;
  timestamp: string;
  confidence?: number;
}

export interface WikiPipelineStatus {
  isRunning: boolean;
  factsCollected: number;
  targetCount: number;
  currentCategory: string;
  recentFacts: RealWikiFact[];
  storagePath: string;
  lastUpdated: string;
}

const TOPICAL_SEEDS = [
  // Cybersecurity & Computing
  'Computer security', 'Cryptography', 'Linux', 'Computer network', 'Malware',
  'Operating system', 'Internet protocol suite', 'Transport Layer Security', 'EdDSA',
  'Public-key cryptography', 'Diffie–Hellman key exchange', 'SHA-2', 'RSA (cryptosystem)',
  'Kademlia', 'Peer-to-peer', 'Zero-day (computing)', 'Denial-of-service attack',
  'Alan Turing', 'Ada Lovelace', 'John von Neumann', 'Claude Shannon', 'Python (programming language)',
  
  // Natural Sciences & Physics
  'Albert Einstein', 'Quantum mechanics', 'General relativity', 'Thermodynamics',
  'Electromagnetism', 'Atom', 'Subatomic particle', 'Speed of light', 'Black hole',
  'Hydrogen', 'Carbon', 'Helium', 'Oxygen', 'Silicon', 'Gravitational wave',
  
  // Biology & Chemistry
  'Deoxyribonucleic acid', 'Ribonucleic acid', 'Cell (biology)', 'Adenosine triphosphate',
  'Mitochondrion', 'Cell division', 'Mitosis', 'Enzyme', 'Photosynthesis',
  'Genetics', 'Evolution', 'Charles Darwin', 'Immune system', 'Antibody',
  
  // World Geography & History
  'Earth', 'Sun', 'Moon', 'Solar System', 'Milky Way', 'Mars', 'Jupiter',
  'Indonesia', 'Japan', 'United States', 'Germany', 'United Kingdom', 'France',
  'Pacific Ocean', 'Atlantic Ocean', 'Mount Everest', 'Amazon River', 'Nile',
  
  // Logic & Philosophy
  'Logic', 'Propositional calculus', 'Modus ponens', 'Syllogism', 'Epistemology',
  'Aristotle', 'René Descartes', 'Immanuel Kant', 'Bertrand Russell', 'Kurt Gödel'
];

export class WikipediaIngestionPipeline {
  private hdcIndex: CompactHdcIndex;
  private isRunning: boolean = false;
  private factsCollected: number = 0;
  private targetCount: number = 10000;
  private currentCategory: string = 'KNOWLEDGE_BASE_ONLINE';
  private recentFacts: RealWikiFact[] = [];
  private allFacts: RealWikiFact[] = [];
  private storageFile: string;
  private timer: NodeJS.Timeout | null = null;
  private seedIndex: number = 0;

  constructor(hdcIndex: CompactHdcIndex, storageDir: string = './data') {
    this.hdcIndex = hdcIndex;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.storageFile = path.join(storageDir, 'real_wiki_facts.json');
    this.loadPersistedFacts();
  }

  private loadPersistedFacts(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.allFacts = parsed;
          this.factsCollected = parsed.length;
          this.recentFacts = parsed.slice(-12).reverse();
          
          // Re-inject saved facts into HDC slab on startup (bounded by slab capacity)
          const maxToInject = Math.min(parsed.length, 10000);
          for (let i = 0; i < maxToInject; i++) {
            const item = parsed[i];
            const fact: KnowledgeFact = {
              id: item.id || (i + 1),
              subject: item.subject,
              predicate: item.predicate,
              object: item.object,
              domain: (item.domain as any) || 'COGNITIVE_AI',
              confidence: 0.98
            };
            const vec = this.encodeTriplet(item.subject, item.predicate, item.object);
            this.hdcIndex.addFact(fact, vec);
          }
          logger.info('wiki_pipeline', 'loaded_persisted_wiki_facts', { count: this.factsCollected });
        }
      }
    } catch (err: any) {
      logger.warn('wiki_pipeline', 'failed_loading_persisted_wiki_facts', { error: err.message });
    }
  }

  /**
   * Search within the 10,000 real Wikipedia facts
   */
  public searchFacts(query: string, domain?: string, limit: number = 20): RealWikiFact[] {
    const q = query.toLowerCase().trim();
    if (!q && !domain) return this.allFacts.slice(0, limit);

    return this.allFacts
      .filter(f => {
        const matchesDomain = !domain || domain === 'ALL' || f.domain.toLowerCase() === domain.toLowerCase();
        if (!matchesDomain) return false;
        if (!q) return true;
        return (
          f.subject.toLowerCase().includes(q) ||
          f.predicate.toLowerCase().includes(q) ||
          f.object.toLowerCase().includes(q) ||
          f.summary.toLowerCase().includes(q)
        );
      })
      .slice(0, limit);
  }

  /**
   * Paginated retrieval of real Wikipedia facts
   */
  public getFacts(page: number = 1, pageSize: number = 20, domain?: string): { facts: RealWikiFact[]; total: number } {
    const p = Math.max(1, page);
    const filtered = domain && domain !== 'ALL'
      ? this.allFacts.filter(f => f.domain.toLowerCase() === domain.toLowerCase())
      : this.allFacts;
    
    const start = (p - 1) * pageSize;
    return {
      facts: filtered.slice(start, start + pageSize),
      total: filtered.length
    };
  }

  private saveFact(fact: RealWikiFact): void {
    try {
      this.allFacts.push(fact);
      // Keep file bounded or update
      if (this.allFacts.length <= 15000) {
        fs.writeFileSync(this.storageFile, JSON.stringify(this.allFacts, null, 2), 'utf8');
      }
    } catch (err: any) {
      logger.warn('wiki_pipeline', 'failed_saving_fact', { error: err.message });
    }
  }

  private encodeTriplet(subject: string, predicate: string, object: string): Hypervector {
    const dim = this.hdcIndex.dimension;
    const vSubj = Hypervector.fromLabel(`subj:${subject.toLowerCase()}`, dim);
    const vPred = Hypervector.fromLabel(`pred:${predicate.toLowerCase()}`, dim);
    const vObj = Hypervector.fromLabel(`obj:${object.toLowerCase()}`, dim);

    const kSubj = Hypervector.fromLabel('role:subject', dim);
    const kPred = Hypervector.fromLabel('role:predicate', dim);
    const kObj = Hypervector.fromLabel('role:object', dim);

    return bundle([vSubj.bind(kSubj), vPred.bind(kPred), vObj.bind(kObj)]);
  }

  /**
   * Fetches article summary from Wikipedia REST API
   */
  private async fetchArticleSummary(title: string): Promise<any> {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RedQueenResearchAgent/1.0 (https://ais-pre-l2tvwvrvr5fywdxa33omoh-125749415297.asia-southeast1.run.app; lolzedever@gmail.com)'
      }
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  }

  /**
   * Queries Wikipedia API for related search results
   */
  private async fetchRelatedTitles(query: string): Promise<string[]> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=15&format=json`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RedQueenResearchAgent/1.0 (contact: lolzedever@gmail.com)'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.query?.search || []).map((s: any) => s.title);
  }

  /**
   * Extracts clean, structured factual triplets from Wikipedia summary text
   */
  private extractTriplets(title: string, extract: string, description?: string): Array<{ predicate: string; object: string; domain: string }> {
    const results: Array<{ predicate: string; object: string; domain: string }> = [];
    if (!extract) return results;

    // Use description if available
    if (description && description.length > 5) {
      results.push({
        predicate: 'is defined as',
        object: description,
        domain: 'GENERAL_KNOWLEDGE'
      });
    }

    const firstSentence = extract.split(/\.\s+/)[0] || extract;

    // Pattern 1: "X is/was a/an Y"
    const isAMatch = firstSentence.match(/(?:is|was|are|were)\s+(?:a|an|the)\s+([^,;.]+)/i);
    if (isAMatch && isAMatch[1]) {
      results.push({
        predicate: 'is classified as',
        object: isAMatch[1].trim(),
        domain: 'SCIENCE_AND_TECH'
      });
    }

    // Pattern 2: "developed / created / discovered / invented by Y"
    const byMatch = firstSentence.match(/(?:developed|created|discovered|invented|founded|designed)\s+by\s+([^,;.]+)/i);
    if (byMatch && byMatch[1]) {
      results.push({
        predicate: 'was created or developed by',
        object: byMatch[1].trim(),
        domain: 'INVENTIONS_AND_HISTORY'
      });
    }

    // Pattern 3: "located in / capital of / country in Y"
    const locMatch = firstSentence.match(/(?:located in|capital of|country in|situated in)\s+([^,;.]+)/i);
    if (locMatch && locMatch[1]) {
      results.push({
        predicate: 'is situated in',
        object: locMatch[1].trim(),
        domain: 'GEOGRAPHY'
      });
    }

    // Fallback if no specific regex matched: extract core predicate phrase
    if (results.length === 0 && firstSentence.length > 15) {
      const parts = firstSentence.split(/\s+(?:is|was|has|serves as)\s+/i);
      if (parts.length >= 2) {
        results.push({
          predicate: 'is described as',
          object: parts[1].slice(0, 120).trim(),
          domain: 'GENERAL_KNOWLEDGE'
        });
      }
    }

    return results;
  }

  /**
   * Runs a single ingestion step
   */
  public async executeIngestionStep(): Promise<number> {
    if (this.factsCollected >= this.targetCount) {
      this.pause();
      return 0;
    }

    // Pick current seed topic
    const currentSeed = TOPICAL_SEEDS[this.seedIndex % TOPICAL_SEEDS.length];
    this.currentCategory = currentSeed;
    this.seedIndex++;

    try {
      // 1. Fetch search related titles
      const titles = await this.fetchRelatedTitles(currentSeed);
      const candidates = [currentSeed, ...titles].slice(0, 6);

      let stepAdded = 0;

      for (const title of candidates) {
        if (this.factsCollected >= this.targetCount) break;

        const summaryData = await this.fetchArticleSummary(title);
        if (!summaryData || !summaryData.extract) continue;

        const triplets = this.extractTriplets(
          summaryData.title || title,
          summaryData.extract,
          summaryData.description
        );

        for (const triplet of triplets) {
          const newFact: RealWikiFact = {
            id: this.factsCollected + 1,
            subject: summaryData.title || title,
            predicate: triplet.predicate,
            object: triplet.object,
            domain: triplet.domain,
            summary: summaryData.extract.slice(0, 240),
            sourceUrl: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
            timestamp: new Date().toISOString()
          };

          // Encode into HDC binary slab index
          const hdcFact: KnowledgeFact = {
            id: newFact.id,
            subject: newFact.subject,
            predicate: newFact.predicate,
            object: newFact.object,
            domain: 'COGNITIVE_AI',
            confidence: 0.99
          };

          const vec = this.encodeTriplet(newFact.subject, newFact.predicate, newFact.object);
          this.hdcIndex.addFact(hdcFact, vec);

          this.saveFact(newFact);
          this.recentFacts.unshift(newFact);
          if (this.recentFacts.length > 15) {
            this.recentFacts.pop();
          }

          this.factsCollected++;
          stepAdded++;
        }

        // Polite sub-batch throttle: 200ms
        await new Promise(r => setTimeout(r, 200));
      }

      logger.info('wiki_pipeline', 'step_completed', { 
        category: currentSeed, 
        added: stepAdded, 
        total: this.factsCollected 
      });

      return stepAdded;
    } catch (err: any) {
      logger.warn('wiki_pipeline', 'step_error', { category: currentSeed, error: err.message });
      return 0;
    }
  }

  /**
   * Starts the continuous background ingestion loop
   */
  public start(target: number = 10000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.targetCount = target;

    logger.info('wiki_pipeline', 'started', { targetCount: this.targetCount, currentCount: this.factsCollected });

    const loop = async () => {
      if (!this.isRunning) return;
      await this.executeIngestionStep();
      if (this.isRunning && this.factsCollected < this.targetCount) {
        // Run next batch every 1500ms
        this.timer = setTimeout(loop, 1500);
      } else {
        this.pause();
      }
    };

    loop();
  }

  /**
   * Pauses the ingestion loop
   */
  public pause(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('wiki_pipeline', 'paused', { factsCollected: this.factsCollected });
  }

  public getStatus(): WikiPipelineStatus {
    return {
      isRunning: this.isRunning,
      factsCollected: this.factsCollected,
      targetCount: this.targetCount,
      currentCategory: this.currentCategory,
      recentFacts: this.recentFacts.slice(0, 8),
      storagePath: this.storageFile,
      lastUpdated: new Date().toISOString()
    };
  }
}
