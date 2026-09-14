import { Cell } from '../../core/cell';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import {
  BenchmarkCategory,
  BenchmarkContext,
  BenchmarkReport,
  BenchmarkResult,
  BenchmarkScenario
} from './types';

export class CognitiveBenchmark {
  private scenarios: BenchmarkScenario[] = [];
  private activeCells: Cell[] = [];
  private currentTraces: string[] = [];
  private createdPaths: string[] = [];

  constructor() {}

  public register(scenario: BenchmarkScenario) {
    this.scenarios.push(scenario);
  }

  public getScenarios(): ReadonlyArray<BenchmarkScenario> {
    return this.scenarios;
  }

  private async createCell(id: string): Promise<Cell> {
    const storagePath = join(process.cwd(), `.tmp_benchmark_${id}`);
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
    const cell = new Cell(storagePath, 'dummy-key');
    this.activeCells.push(cell);
    this.createdPaths.push(storagePath);
    return cell;
  }

  private log(msg: string) {
    this.currentTraces.push(`[${new Date().toISOString()}] ${msg}`);
  }

  private async cleanup() {
    for (const cell of this.activeCells) {
      await cell.stop();
    }
    for (const p of this.createdPaths) {
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
      }
    }
    this.activeCells = [];
    this.createdPaths = [];
  }

  public async run(): Promise<BenchmarkReport> {
    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      totalScenarios: this.scenarios.length,
      passedCount: 0,
      failedCount: 0,
      results: []
    };

    for (const scenario of this.scenarios) {
      this.currentTraces = [];
      const context: BenchmarkContext = {
        createCell: async (id) => {
          this.log(`Created Cell ${id}`);
          const cell = await this.createCell(id);
          return cell;
        },
        log: (msg) => this.log(msg)
      };

      try {
        const result = await scenario.execute(context);
        result.trace = [...this.currentTraces, ...(result.trace || [])];
        report.results.push(result);
        if (result.passed) {
          report.passedCount++;
        } else {
          report.failedCount++;
        }
      } catch (err: any) {
        report.results.push({
          scenarioId: scenario.id,
          expected: 'Execution without error',
          actual: `Error: ${err.message}`,
          passed: false,
          trace: [...this.currentTraces, `Exception: ${err.stack}`]
        });
        report.failedCount++;
      } finally {
        await this.cleanup();
      }
    }

    return report;
  }
}
