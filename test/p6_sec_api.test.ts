import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as fs from 'fs/promises';
import { createApp, validateProductionConfig } from '../server';
import { Cell } from '../src/redqueen/core/cell';

describe('P6 SEC-08: API Authentication & Security Hardening', () => {
  const TEST_STORAGE = './data/test_p6_sec_api_cell.json';
  const VALID_SECRET = 'strong-production-grade-api-secret-key-9876543210';
  const INVALID_SECRET = 'invalid-secret-token-attempt';
  let cell: Cell;

  beforeAll(async () => {
    try {
      await fs.unlink(TEST_STORAGE);
    } catch {}
    try {
      await fs.unlink(`${TEST_STORAGE}.identity`);
    } catch {}
    cell = new Cell(TEST_STORAGE, 'dummy-key-for-test');
    await cell.start(0);
  });

  afterAll(async () => {
    await cell.stop();
    try {
      await fs.unlink(TEST_STORAGE);
    } catch {}
    try {
      await fs.unlink(`${TEST_STORAGE}.identity`);
    } catch {}
  });

  describe('1. Request Authentication & Authorization', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
      const app = createApp({
        cell,
        apiSecret: VALID_SECRET,
        isProduction: false,
      });

      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('denies requests without authentication header with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/cell/knowledge`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Unauthorized: Missing or invalid Bearer token/);
    });

    it('denies requests with malformed authentication header with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/cell/knowledge`, {
        headers: {
          Authorization: 'Basic invalidcredentials',
        },
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Unauthorized: Missing or invalid Bearer token/);
    });

    it('denies requests with invalid authentication token with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/cell/knowledge`, {
        headers: {
          Authorization: `Bearer ${INVALID_SECRET}`,
        },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: Invalid token/);
    });

    it('allows requests with valid authentication token with 200 OK', async () => {
      const res = await fetch(`${baseUrl}/api/cell/knowledge`, {
        headers: {
          Authorization: `Bearer ${VALID_SECRET}`,
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('allows public health endpoint without authentication', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('2. Production Configuration FAIL-CLOSED Security', () => {
    it('fails closed if API_SECRET is missing or empty in production', () => {
      expect(() => {
        validateProductionConfig('', true);
      }).toThrow(/FATAL: In production, API_SECRET must be configured/);
    });

    it('fails closed if API_SECRET is a common placeholder in production', () => {
      const placeholders = ['changeme', 'secret', 'password', 'default', 'placeholder', 'admin', '123456'];
      for (const placeholder of placeholders) {
        expect(() => {
          validateProductionConfig(placeholder, true);
        }).toThrow(/FATAL: In production, API_SECRET must be configured/);
      }
    });

    it('fails closed if API_SECRET is shorter than 16 characters in production', () => {
      expect(() => {
        validateProductionConfig('short-secret-12', true);
      }).toThrow(/FATAL: In production, API_SECRET must be configured/);
    });

    it('createApp refuses to initialize in production without a valid API_SECRET', () => {
      expect(() => {
        createApp({ isProduction: true, apiSecret: 'short' });
      }).toThrow(/FATAL: In production, API_SECRET must be configured/);
    });

    it('succeeds in production when API_SECRET meets cryptographic requirements (>=16 chars, non-placeholder)', () => {
      expect(() => {
        validateProductionConfig('crypto-strong-random-key-64bytes-production-ready', true);
      }).not.toThrow();

      expect(() => {
        createApp({
          isProduction: true,
          apiSecret: 'crypto-strong-random-key-64bytes-production-ready',
        });
      }).not.toThrow();
    });
  });

  describe('3. Rate Limiting', () => {
    let rateLimitedServer: http.Server;
    let rateLimitedUrl: string;

    beforeAll(async () => {
      const app = createApp({
        cell,
        apiSecret: VALID_SECRET,
        rateLimitMax: 5,
        rateLimitWindow: 60000,
      });

      await new Promise<void>((resolve) => {
        rateLimitedServer = app.listen(0, '127.0.0.1', () => {
          const addr = rateLimitedServer.address() as AddressInfo;
          rateLimitedUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => rateLimitedServer.close(() => resolve()));
    });

    it('allows requests within rate limit ceiling', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${rateLimitedUrl}/api/health`);
        expect(res.status).toBe(200);
      }
    });

    it('rejects requests exceeding rate limit with 429 Too Many Requests', async () => {
      const res = await fetch(`${rateLimitedUrl}/api/health`);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toBe('Too many requests, please try again later.');
    });
  });
});
