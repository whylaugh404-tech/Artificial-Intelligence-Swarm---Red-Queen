import { describe, expect, it } from 'vitest';
import { AdaptiveNonlinearDynamics } from '../src/redqueen/learning/nonlinear';

describe('adaptive nonlinear dynamics', () => {
  it('keeps inference bounded and learns a nonlinear transition sequence', () => {
    const model = new AdaptiveNonlinearDynamics();
    const samples = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9].map((state, index, values) => ({
      state,
      nextState: values[index + 1] ?? 0.85
    }));
    const beforeCheckpoint = model.checkpoint();
    const result = model.train(samples, 0.1);
    const afterCheckpoint = model.checkpoint();

    expect(Number.isFinite(result.loss)).toBe(true);
    expect(result.step).toBe(samples.length);
    expect(model.predict(0.5)).toBeGreaterThan(0);
    expect(model.predict(0.5)).toBeLessThan(1);
    expect(afterCheckpoint).not.toEqual(beforeCheckpoint);
  });

  it('rejects invalid state values', () => {
    const model = new AdaptiveNonlinearDynamics();
    expect(() => model.predict(Number.NaN)).toThrow(/strictly between/);
    expect(() => model.train([{ state: 0.2, nextState: 1 }])).toThrow(/strictly between/);
  });
});

