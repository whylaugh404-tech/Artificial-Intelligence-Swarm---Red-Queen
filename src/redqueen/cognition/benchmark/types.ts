import { Cell } from '../../core/cell';

export enum BenchmarkCategory {
  UNDERSTANDING = 'UNDERSTANDING',
  WORLD_MODEL = 'WORLD_MODEL',
  REASONING = 'REASONING',
  VERIFICATION = 'VERIFICATION',
  COLLECTIVE = 'COLLECTIVE',
  DEVELOPMENT = 'DEVELOPMENT',
  INVARIANT = 'INVARIANT'
}

export interface BenchmarkContext {
  createCell: (id: string) => Promise<Cell>;
  log: (msg: string) => void;
}

export interface BenchmarkResult {
  scenarioId: string;
  expected: any;
  actual: any;
  passed: boolean;
  trace?: string[];
}

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  category: BenchmarkCategory;
  execute: (context: BenchmarkContext) => Promise<BenchmarkResult>;
}

export interface BenchmarkReport {
  timestamp: string;
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  results: BenchmarkResult[];
}
