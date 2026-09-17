const fs = require('fs');
let code = fs.readFileSync('test/p9_5_collective_cognition.test.ts', 'utf-8');
code = code.replace(
/describe\('2\. Transformasi Linear \(z_i = W_i \* x_i \+ b_i\)', \(\) => \{[\s\S]*?\}\);\s*\}\);/m,
`describe('2. Transformasi Linear (z_i = W_i * x_i + b_i)', () => {
    it('menghasilkan matriks transformasi W_i (7x7) dan bias b_i (7x1) yang deterministik', () => {
      const x1 = { computation: 0.8, reliability: 0.9, cognition: 0.7, knowledge: 0.85, specialization: 0.95, experience: 0.5, resourceEfficiency: 0.6 };
      const { matrix: W1, bias: b1 } = generateDeterministicMatrixAndBias(x1, ['COGNITIVE_REASONING']);
      const { matrix: W2, bias: b2 } = generateDeterministicMatrixAndBias(x1, ['COGNITIVE_REASONING']);

      expect(W1.length).toBe(7);
      expect(b1.length).toBe(7);
      expect(W1[0].length).toBe(7);

      expect(W1).toEqual(W2);
      expect(b1).toEqual(b2);

      const x3 = { computation: 0.1, reliability: 0.2, cognition: 0.3, knowledge: 0.4, specialization: 0.5, experience: 0.6, resourceEfficiency: 0.7 };
      const { matrix: W3 } = generateDeterministicMatrixAndBias(x3, ['COGNITIVE_REASONING']);
      expect(W1).not.toEqual(W3);
    });

    it('menerapkan z_i = W_i * x_i + b_i tanpa clamping non-linear', () => {
      const x = { computation: 0.8, reliability: 0.9, cognition: 0.7, knowledge: 0.85, specialization: 0.95, experience: 0.5, resourceEfficiency: 0.6 };
      
      const { matrix: W, bias: b } = generateDeterministicMatrixAndBias(x, ['COGNITIVE_REASONING']);
      const trans = applyLinearTransformation(x, W, b);
      const z = trans.transformedVector;
      expect(z).toBeDefined();

      const keys: (keyof CognitiveFeatureVector)[] = [
        'computation', 'reliability', 'cognition', 'knowledge', 'specialization', 'experience', 'resourceEfficiency'
      ];
      
      const manualZ: Record<string, number> = {};
      const xArr = [x.computation, x.reliability, x.cognition, x.knowledge, x.specialization, x.experience, x.resourceEfficiency];
      
      for(let i=0; i<7; i++) {
        let sum = b[i];
        for(let j=0; j<7; j++) {
           sum += W[i][j] * xArr[j];
        }
        manualZ[keys[i]] = sum;
      }

      keys.forEach(k => {
        expect(z[k]).toBeCloseTo(manualZ[k], 5);
      });
    });
  });`
);
fs.writeFileSync('test/p9_5_collective_cognition.test.ts', code);
