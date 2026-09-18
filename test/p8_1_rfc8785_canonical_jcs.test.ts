import { describe, it, expect } from 'vitest';
import {
  canonicalizeJson,
  canonicalizeNumber,
  canonicalizeString,
  computeDeterministicHash
} from '../src/redqueen/cognition/computation/canonical';

describe('P8.1: RFC 8785 / JCS Canonicalization Scheme & Edge Cases', () => {
  // 1. Official Cyberphone Reference Vectors
  describe('Official RFC 8785 / JCS Reference Suites (Cyberphone)', () => {
    it('passes arrays.json reference suite', () => {
      const input = [
        56,
        {
          d: true,
          '10': null,
          '1': []
        }
      ];
      const expected = '[56,{"1":[],"10":null,"d":true}]';
      expect(canonicalizeJson(input)).toBe(expected);
    });

    it('passes french.json reference suite (locale-independent UTF-16 code unit sorting)', () => {
      const input = {
        peach: 'This sorting order',
        'péché': 'is wrong according to French',
        'pêche': 'but canonicalization MUST',
        sin: 'ignore locale'
      };
      const expected = '{"peach":"This sorting order","péché":"is wrong according to French","pêche":"but canonicalization MUST","sin":"ignore locale"}';
      expect(canonicalizeJson(input)).toBe(expected);
    });

    it('passes structures.json reference suite (whitespace, key ordering, nested objects & arrays)', () => {
      const input = {
        '1': { f: { f: 'hi', F: 5 }, '\n': 56.0 },
        '10': {},
        '': 'empty',
        a: {},
        '111': [{ e: 'yes', E: 'no' }],
        A: {}
      };
      const expected = '{"":"empty","1":{"\\n":56,"f":{"F":5,"f":"hi"}},"10":{},"111":[{"E":"no","e":"yes"}],"A":{},"a":{}}';
      expect(canonicalizeJson(input)).toBe(expected);
    });

    it('passes unicode.json reference suite (unnormalized unicode preservation)', () => {
      const input = {
        'Unnormalized Unicode': 'A\u030a'
      };
      const expected = '{"Unnormalized Unicode":"Å"}';
      expect(canonicalizeJson(input)).toBe(expected);
    });

    it('passes values.json reference suite (numbers, escaped strings, literals)', () => {
      const input = {
        numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 0.000000000000000000000000001],
        string: '\u20ac$\u000f\u000aA\'\u0042\u0022\u005c\\\"\x2f',
        literals: [null, true, false]
      };
      const expected = '{"literals navigation":undefined}'; // placeholder to test precise expected string
      const actual = canonicalizeJson(input);
      const expectedJson = '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/\"}';
      expect(actual).toBe(expectedJson);
    });

    it('passes weird.json reference suite (control characters, unicode ranges, emojis, scripts)', () => {
      const input = {
        '\u20ac': 'Euro Sign',
        '\r': 'Carriage Return',
        '\u000a': 'Newline',
        '1': 'One',
        '\u0080': 'Control\u007f',
        '\ud83d\ude02': 'Smiley',
        '\u00f6': 'Latin Small Letter O With Diaeresis',
        '\ufb33': 'Hebrew Letter Dalet With Dagesh',
        '</script>': 'Browser Challenge'
      };
      const actual = canonicalizeJson(input);
      // Key order by UTF-16 code units:
      // \n (0x0A) < \r (0x0D) < 1 (0x31) < </script> (0x3C) < \u0080 (0x80) < \u00F6 (0xF6) < \u20AC (0x20AC) < \uD83D\uDE02 (0xD83D) < \uFB33 (0xFB33)
      const expected = '{"\\n":"Newline","\\r":"Carriage Return","1":"One","</script>":"Browser Challenge","\u0080":"Control\u007f","\u00f6":"Latin Small Letter O With Diaeresis","\u20ac":"Euro Sign","\ud83d\ude02":"Smiley","\ufb33":"Hebrew Letter Dalet With Dagesh"}';
      expect(actual).toBe(expected);
    });
  });

  // 2. RFC 8785 Appendix B IEEE 754 Number Serialization Reference Vectors
  describe('RFC 8785 Appendix B IEEE 754 Number Serialization', () => {
    const vectors: [number, string][] = [
      [0, '0'],
      [-0, '0'],
      [1, '1'],
      [-1, '-1'],
      [0.1, '0.1'],
      [-0.1, '-0.1'],
      [1e20, '100000000000000000000'],
      [1e21, '1e+21'],
      [1e-6, '0.000001'],
      [1e-7, '1e-7'],
      [1e-27, '1e-27'],
      [1e30, '1e+30'],
      [5e-324, '5e-324'],
      [1.7976931348623157e+308, '1.7976931348623157e+308'],
      [1424953923781206.2, '1424953923781206.2'],
      [1424953923781206.5, '1424953923781206.5'],
      [1424953923781206.8, '1424953923781206.8'],
      [0.000000000000000000000000001, '1e-27'],
      [333333333.33333329, '333333333.3333333'],
      [4.50, '4.5'],
      [2e-3, '0.002'],
      [100000000000000000000, '100000000000000000000'],
      [1000000000000000000000, '1e+21'],
      [9.999999999999997e-7, '9.999999999999997e-7']
    ];

    vectors.forEach(([num, expected], idx) => {
      it(`serializes vector ${idx + 1}: ${num} -> ${expected}`, () => {
        expect(canonicalizeNumber(num)).toBe(expected);
        expect(canonicalizeJson(num)).toBe(expected);
        expect(canonicalizeJson({ n: num })).toBe(`{"n":${expected}}`);
        expect(canonicalizeJson([num])).toBe(`[${expected}]`);
      });
    });

    it('rejects non-finite numbers (NaN, +Infinity, -Infinity)', () => {
      expect(() => canonicalizeNumber(NaN)).toThrow(TypeError);
      expect(() => canonicalizeNumber(Infinity)).toThrow(TypeError);
      expect(() => canonicalizeNumber(-Infinity)).toThrow(TypeError);

      expect(() => canonicalizeJson(NaN)).toThrow(TypeError);
      expect(() => canonicalizeJson({ a: NaN })).toThrow(TypeError);
      expect(() => canonicalizeJson([1, Infinity, 3])).toThrow(TypeError);
    });

    it('ensures -0 is serialized as 0 in all structural contexts', () => {
      expect(canonicalizeJson(-0)).toBe('0');
      expect(canonicalizeJson({ val: -0 })).toBe('{"val":0}');
      expect(canonicalizeJson([-0, 0, -0])).toBe('[0,0,0]');
      expect(canonicalizeJson({ nested: { a: -0, b: 0 } })).toBe('{"nested":{"a":0,"b":0}}');
    });
  });

  // 3. UTF-16 Code Unit Key Ordering
  describe('UTF-16 Code Unit Key Ordering (Section 3.2.3)', () => {
    it('sorts keys strictly by UTF-16 code units (lexicographical comparison)', () => {
      const obj = {
        '\u0001': 'soh',
        '': 'empty',
        'a': 'lower-a',
        'A': 'upper-A',
        '1': 'one',
        '10': 'ten',
        '2': 'two',
        '\uFFFF': 'max-bmp',
        'aa': 'two-a'
      };
      // Code unit values:
      // "" (len 0) -> \u0001 (0x01) -> "1" (0x31) -> "10" (0x31, 0x30) -> "2" (0x32)
      // -> "A" (0x41) -> "a" (0x61) -> "aa" (0x61, 0x61) -> \uFFFF (0xFFFF)
      const expected = '{"":"empty","\\u0001":"soh","1":"one","10":"ten","2":"two","A":"upper-A","a":"lower-a","aa":"two-a","\uFFFF":"max-bmp"}';
      expect(canonicalizeJson(obj)).toBe(expected);
    });

    it('handles supplementary character key sorting (surrogate pairs)', () => {
      // 𝄞 (Musical Symbol G Clef) is \uD834\uDD1E (high 0xD834, low 0xDD1E)
      // 😀 (Grinning Face) is \uD83D\uDE00 (high 0xD83D, low 0xDE00)
      // 0xD834 < 0xD83D
      const obj = {
        '\uD83D\uDE00': 'grinning',
        '\uD834\uDD1E': 'g-clef',
        'z': 'last-ascii',
        '\uE000': 'pua'
      };
      // 'z' (0x7A) < 𝄞 (0xD834) < 😀 (0xD83D) < \uE000 (0xE000)
      const expected = '{"z":"last-ascii","𝄞":"g-clef","😀":"grinning","\uE000":"pua"}';
      expect(canonicalizeJson(obj)).toBe(expected);
    });
  });

  // 4. Unicode & Surrogate Handling (Section 3.2.2.2)
  describe('Unicode & Surrogate Handling', () => {
    it('accepts valid surrogate pairs', () => {
      const validSurrogateStr = 'Hello \uD83D\uDE00 World \uD834\uDD1E!';
      expect(canonicalizeString(validSurrogateStr)).toBe(JSON.stringify(validSurrogateStr));
      expect(canonicalizeJson({ text: validSurrogateStr })).toBe(`{"text":${JSON.stringify(validSurrogateStr)}}`);
    });

    it('rejects lone high surrogates in string values', () => {
      expect(() => canonicalizeString('Invalid \uD800 alone')).toThrow(TypeError);
      expect(() => canonicalizeJson({ val: 'trailing \uD83D' })).toThrow(TypeError);
    });

    it('rejects lone low surrogates in string values', () => {
      expect(() => canonicalizeString('Invalid \uDC00 alone')).toThrow(TypeError);
      expect(() => canonicalizeJson({ val: 'leading \uDE00' })).toThrow(TypeError);
    });

    it('rejects lone surrogates inside object keys', () => {
      expect(() => canonicalizeJson({ 'bad\uD800key': 123 })).toThrow(TypeError);
      expect(() => canonicalizeJson({ 'bad\uDC00key': 123 })).toThrow(TypeError);
    });

    it('rejects high surrogate followed by another high surrogate', () => {
      expect(() => canonicalizeString('\uD800\uD800')).toThrow(TypeError);
    });
  });

  // 5. Escaping & Whitespace (Section 3.2.1, Section 3.2.2.2)
  describe('Escaping and Whitespace Rules', () => {
    it('escapes only mandatory characters using lowercase hex', () => {
      const str = 'Quotes: " Backslash: \\ Controls: \u0000 \u0008 \u0009 \u000a \u000c \u000d \u001f';
      const serialized = canonicalizeString(str);
      expect(serialized).toContain('\\"');
      expect(serialized).toContain('\\\\');
      expect(serialized).toContain('\\u0000');
      expect(serialized).toContain('\\b');
      expect(serialized).toContain('\\t');
      expect(serialized).toContain('\\n');
      expect(serialized).toContain('\\f');
      expect(serialized).toContain('\\r');
      expect(serialized).toContain('\\u001f');
    });

    it('produces zero whitespace outside string literals', () => {
      const complex = {
        list: [1, 2, { a: 'b', c: [true, false, null] }],
        status: 'OK',
        count: 42
      };
      const serialized = canonicalizeJson(complex);
      expect(serialized).not.toMatch(/\s(?=([^"]*"[^"]*")*[^"]*$)/);
    });
  });

  // 6. Nested Objects, Arrays, and Circular Detection
  describe('Nested Objects, Arrays, and Omissions', () => {
    it('preserves array order and converts undefined/functions to null in arrays', () => {
      const arr = [1, undefined, 'text', () => {}, null, false];
      expect(canonicalizeJson(arr)).toBe('[1,null,"text",null,null,false]');
    });

    it('omits undefined, functions, and symbols from objects', () => {
      const obj = {
        keep: 1,
        dropUndef: undefined,
        dropFn: () => 'hello',
        dropSym: Symbol('test'),
        keep2: 'ok'
      };
      expect(canonicalizeJson(obj)).toBe('{"keep":1,"keep2":"ok"}');
    });

    it('rejects top-level undefined, function, and symbol', () => {
      expect(() => canonicalizeJson(undefined)).toThrow('Cannot canonicalize non-JSON value');
      expect(() => canonicalizeJson(() => 'test')).toThrow('Cannot canonicalize non-JSON value');
      expect(() => canonicalizeJson(Symbol('test'))).toThrow('Cannot canonicalize non-JSON value');
    });

    it('rejects BigInt values', () => {
      expect(() => canonicalizeJson(12345678901234567890n)).toThrow('BigInt is not a JSON/JCS value');
      expect(() => canonicalizeJson({ val: 42n })).toThrow('BigInt is not a JSON/JCS value');
      expect(() => canonicalizeJson([1n, 2n])).toThrow('BigInt is not a JSON/JCS value');
    });

    it('detects circular references and throws TypeError', () => {
      const circularObj: Record<string, unknown> = { a: 1 };
      circularObj.self = circularObj;
      expect(() => canonicalizeJson(circularObj)).toThrow(TypeError);

      const circularArr: unknown[] = [1, 2];
      circularArr.push(circularArr);
      expect(() => canonicalizeJson(circularArr)).toThrow(TypeError);
    });
  });

  // 7. Deterministic SHA-256 Hash
  describe('Deterministic Hashing (computeDeterministicHash)', () => {
    it('produces 64-character lowercase hex string', () => {
      const hash = computeDeterministicHash({ key: 'val' });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is immune to object key insertion order', () => {
      const h1 = computeDeterministicHash({ a: 1, b: 2, c: { x: 'x', y: 'y' } });
      const h2 = computeDeterministicHash({ c: { y: 'y', x: 'x' }, b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it('is immune to negative zero vs zero', () => {
      const h1 = computeDeterministicHash({ val: -0 });
      const h2 = computeDeterministicHash({ val: 0 });
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different semantic inputs', () => {
      const h1 = computeDeterministicHash({ val: 1 });
      const h2 = computeDeterministicHash({ val: 2 });
      expect(h1).not.toBe(h2);
    });
  });

  // 8. Mandatory Canonicalization Verification Checklist (14 Requirements)
  describe('Mandatory Audit Verification Vectors (1-14)', () => {
    // 1. Object dengan key berbeda urutan → hash sama
    it('Req 1: Object with different key insertion order yields identical hash', () => {
      const obj1 = { z: 'last', a: 'first', m: { b: 2, a: 1 } };
      const obj2 = { a: 'first', m: { a: 1, b: 2 }, z: 'last' };
      expect(computeDeterministicHash(obj1)).toBe(computeDeterministicHash(obj2));
      expect(canonicalizeJson(obj1)).toBe(canonicalizeJson(obj2));
    });

    // 2. Nested object → deterministic
    it('Req 2: Deeply nested objects are strictly deterministic', () => {
      const nestedA = { l1: { l2: { l3: { val: 'alpha', list: [1, 2, 3] } } } };
      const nestedB = { l1: { l2: { l3: { list: [1, 2, 3], val: 'alpha' } } } };
      expect(canonicalizeJson(nestedA)).toBe(canonicalizeJson(nestedB));
      expect(computeDeterministicHash(nestedA)).toBe(computeDeterministicHash(nestedB));
    });

    // 3. Array → deterministic
    it('Req 3: Array elements preserve order deterministically', () => {
      const arr1 = [10, 20, { b: 'b', a: 'a' }];
      const arr2 = [10, 20, { a: 'a', b: 'b' }];
      expect(canonicalizeJson(arr1)).toBe('[10,20,{"a":"a","b":"b"}]');
      expect(canonicalizeJson(arr1)).toBe(canonicalizeJson(arr2));
      expect(computeDeterministicHash(arr1)).toBe(computeDeterministicHash(arr2));
    });

    // 4. Unicode → deterministic
    it('Req 4: Unicode characters preserve deterministic canonical representations', () => {
      const unicodeObj = {
        chinese: '你好世界',
        arabic: 'مرحبا بالعالم',
        hiragana: 'こんにちは',
        emoji: '🧠🔬⚡'
      };
      const canonical = canonicalizeJson(unicodeObj);
      expect(canonical).toContain('"emoji":"🧠🔬⚡"');
      expect(computeDeterministicHash(unicodeObj)).toBe(computeDeterministicHash(unicodeObj));
    });

    // 5. Unicode lone surrogate → rejected
    it('Req 5: Unicode lone surrogates are strictly rejected', () => {
      expect(() => canonicalizeString('lone \uD800 high')).toThrow(TypeError);
      expect(() => canonicalizeString('lone \uDC00 low')).toThrow(TypeError);
      expect(() => canonicalizeJson({ key: 'lone \uD83D' })).toThrow(TypeError);
      expect(() => canonicalizeJson({ 'bad\uD800key': 1 })).toThrow(TypeError);
    });

    // 6. -0 dan 0 → canonical representation sama
    it('Req 6: -0 and 0 yield identical canonical representation "0"', () => {
      expect(canonicalizeNumber(-0)).toBe('0');
      expect(canonicalizeNumber(0)).toBe('0');
      expect(canonicalizeJson(-0)).toBe('0');
      expect(canonicalizeJson(0)).toBe('0');
      expect(canonicalizeJson({ zero: -0 })).toBe('{"zero":0}');
      expect(canonicalizeJson({ zero: 0 })).toBe('{"zero":0}');
      expect(computeDeterministicHash(-0)).toBe(computeDeterministicHash(0));
    });

    // 7. NaN → rejected
    it('Req 7: NaN is strictly rejected', () => {
      expect(() => canonicalizeNumber(NaN)).toThrow(TypeError);
      expect(() => canonicalizeJson(NaN)).toThrow(TypeError);
      expect(() => canonicalizeJson({ val: NaN })).toThrow(TypeError);
      expect(() => canonicalizeJson([NaN])).toThrow(TypeError);
    });

    // 8. Infinity → rejected
    it('Req 8: Infinity is strictly rejected', () => {
      expect(() => canonicalizeNumber(Infinity)).toThrow(TypeError);
      expect(() => canonicalizeJson(Infinity)).toThrow(TypeError);
      expect(() => canonicalizeJson({ val: Infinity })).toThrow(TypeError);
      expect(() => canonicalizeJson([Infinity])).toThrow(TypeError);
    });

    // 9. -Infinity → rejected
    it('Req 9: -Infinity is strictly rejected', () => {
      expect(() => canonicalizeNumber(-Infinity)).toThrow(TypeError);
      expect(() => canonicalizeJson(-Infinity)).toThrow(TypeError);
      expect(() => canonicalizeJson({ val: -Infinity })).toThrow(TypeError);
      expect(() => canonicalizeJson([-Infinity])).toThrow(TypeError);
    });

    // 10. BigInt → rejected
    it('Req 10: BigInt is strictly rejected', () => {
      expect(() => canonicalizeJson(9007199254740991n)).toThrow('BigInt is not a JSON/JCS value');
      expect(() => canonicalizeJson({ big: 100n })).toThrow('BigInt is not a JSON/JCS value');
      expect(() => canonicalizeJson([100n])).toThrow('BigInt is not a JSON/JCS value');
    });

    // 11. Circular object → rejected
    it('Req 11: Circular object is strictly rejected', () => {
      const circ: Record<string, unknown> = { name: 'circular' };
      circ.loop = circ;
      expect(() => canonicalizeJson(circ)).toThrow(TypeError);

      const circArr: unknown[] = ['start'];
      circArr.push(circArr);
      expect(() => canonicalizeJson(circArr)).toThrow(TypeError);
    });

    // 12. Same semantic input → same SHA-256
    it('Req 12: Identical semantic input produces exact same 256-bit SHA-256 hash', () => {
      const inputA = { model: 'redqueen', hyperparams: { lr: 0.001, layers: [64, 128] }, active: true };
      const inputB = { active: true, hyperparams: { layers: [64, 128], lr: 0.001 }, model: 'redqueen' };
      const hashA = computeDeterministicHash(inputA);
      const hashB = computeDeterministicHash(inputB);
      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    });

    // 13. Different semantic input → different hash
    it('Req 13: Different semantic inputs produce different hashes', () => {
      const h1 = computeDeterministicHash({ state: 'idle', count: 1 });
      const h2 = computeDeterministicHash({ state: 'idle', count: 2 });
      const h3 = computeDeterministicHash({ state: 'active', count: 1 });
      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
      expect(h2).not.toBe(h3);
    });

    // 14. Known RFC 8785 test vectors verification
    it('Req 14: Verifies known RFC 8785 reference test vectors', () => {
      // arrays.json vector
      expect(canonicalizeJson([56, { d: true, '10': null, '1': [] }])).toBe('[56,{"1":[],"10":null,"d":true}]');
      // french.json vector
      expect(canonicalizeJson({ peach: '1', 'péché': '2', 'pêche': '3', sin: '4' })).toBe('{"peach":"1","péché":"2","pêche":"3","sin":"4"}');
      // structures.json vector
      expect(canonicalizeJson({ '1': { '\n': 56.0 }, '10': {}, '': 'empty' })).toBe('{"":"empty","1":{"\\n":56},"10":{}}');
    });
  });
});

