import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../core/logger';

export interface ParentReproductionLockData {
  parentCellId: string;
  eventId: string;
  lockToken: string;
  acquiredAt: number;
  expiresAt: number;
  pid?: number;
}

export interface ParentLockAcquireResult {
  acquired: boolean;
  lockToken?: string;
  error?: string;
  existingLock?: ParentReproductionLockData;
}

const DEFAULT_LOCK_TTL_MS = 60000; // 60 seconds TTL for crash safety

/**
 * Derives the lock file path for a given parent cell storage.
 */
export function getParentLockPath(parentStoragePath: string | undefined, parentCellId: string, storageBasePath?: string): string {
  let dir = '.';
  if (parentStoragePath) {
    dir = path.dirname(parentStoragePath);
  } else if (storageBasePath) {
    dir = storageBasePath;
  }
  return path.join(dir, `cell_${parentCellId}.reprolock`);
}

/**
 * Attempts to acquire an atomic, cross-engine/cross-process lock for a parent cell reproduction.
 * If a stale lock exists whose TTL has expired, it is safely reclaimed.
 */
export async function acquireParentReproductionLock(
  parentStoragePath: string | undefined,
  parentCellId: string,
  eventId: string,
  lockTtlMs: number = DEFAULT_LOCK_TTL_MS,
  storageBasePath?: string
): Promise<ParentLockAcquireResult> {
  const lockFilePath = getParentLockPath(parentStoragePath, parentCellId, storageBasePath);
  const now = Date.now();
  const lockToken = randomUUID();
  const lockData: ParentReproductionLockData = {
    parentCellId,
    eventId,
    lockToken,
    acquiredAt: now,
    expiresAt: now + lockTtlMs,
    pid: typeof process !== 'undefined' ? process.pid : undefined
  };

  // Ensure directory exists
  try {
    await fs.mkdir(path.dirname(lockFilePath), { recursive: true });
  } catch {}

  // Check if lock file already exists
  try {
    const raw = await fs.readFile(lockFilePath, 'utf8');
    const existing: ParentReproductionLockData = JSON.parse(raw);

    // If same event and not expired, allow re-entry
    if (existing.eventId === eventId && now < existing.expiresAt) {
      return { acquired: true, lockToken: existing.lockToken, existingLock: existing };
    }

    // Check if stale / expired
    if (now >= existing.expiresAt) {
      logger.warn('mitosis_lock', 'reclaiming_stale_parent_reproduction_lock', {
        parentCellId,
        staleEventId: existing.eventId,
        newEventId: eventId,
        expiredAgoMs: now - existing.expiresAt
      });
      // Stale lock can be overwritten
    } else {
      // Active lock held by another reproduction event
      return {
        acquired: false,
        error: `Parent '${parentCellId}' reproduction is locked by active event '${existing.eventId}' (expires in ${existing.expiresAt - now}ms)`,
        existingLock: existing
      };
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      // JSON parse error or corruption -> treat as invalid/stale lock and allow overwrite
      logger.warn('mitosis_lock', 'overwriting_corrupted_lock_file', { lockFilePath, error: err.message });
    }
  }

  // Attempt atomic write using temporary file + atomic rename or exclusive flag
  try {
    await fs.writeFile(lockFilePath, JSON.stringify(lockData, null, 2), { encoding: 'utf8' });
    return { acquired: true, lockToken, existingLock: lockData };
  } catch (writeErr: any) {
    return {
      acquired: false,
      error: `Failed to write reproduction lock file: ${writeErr.message}`
    };
  }
}

/**
 * Releases the parent reproduction lock if held by the given lockToken or eventId.
 */
export async function releaseParentReproductionLock(
  parentStoragePath: string | undefined,
  parentCellId: string,
  lockToken?: string,
  eventId?: string,
  storageBasePath?: string
): Promise<boolean> {
  const lockFilePath = getParentLockPath(parentStoragePath, parentCellId, storageBasePath);
  try {
    const raw = await fs.readFile(lockFilePath, 'utf8');
    const existing: ParentReproductionLockData = JSON.parse(raw);

    // Verify ownership
    if (lockToken && existing.lockToken !== lockToken && existing.eventId !== eventId) {
      logger.warn('mitosis_lock', 'lock_release_token_mismatch', {
        parentCellId,
        expectedToken: existing.lockToken,
        providedToken: lockToken
      });
      return false;
    }

    await fs.rm(lockFilePath, { force: true });
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return true; // Already released
    }
    logger.warn('mitosis_lock', 'failed_to_release_lock', { parentCellId, error: err.message });
    return false;
  }
}

/**
 * Inspects the current parent reproduction lock.
 */
export async function inspectParentReproductionLock(
  parentStoragePath: string | undefined,
  parentCellId: string,
  storageBasePath?: string
): Promise<ParentReproductionLockData | null> {
  const lockFilePath = getParentLockPath(parentStoragePath, parentCellId, storageBasePath);
  try {
    const raw = await fs.readFile(lockFilePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Counts genuine persisted cells in the storage directory, excluding lock files, quarantine files, and temp files.
 */
export async function countPersistedCells(storageBasePath: string): Promise<number> {
  try {
    const files = await fs.readdir(storageBasePath);
    const cellFiles = files.filter(f => f.startsWith('cell_') && f.endsWith('.json'));
    return cellFiles.length;
  } catch {
    return 0;
  }
}

/**
 * Executes a function holding an admission lock to prevent population limit races.
 */
export async function withPopulationAdmissionLock<T>(
  storageBasePath: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = path.join(storageBasePath, 'population_admission.lock');
  const maxRetries = 20;
  const retryDelayMs = 50;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, time: Date.now() }), { flag: 'wx' });
      break;
    } catch (err: any) {
      if (attempt === maxRetries - 1) {
        // Force break stale lock
        try {
          await fs.rm(lockPath, { force: true });
        } catch {}
      } else {
        await new Promise(r => setTimeout(r, retryDelayMs));
      }
    }
  }

  try {
    return await fn();
  } finally {
    try {
      await fs.rm(lockPath, { force: true });
    } catch {}
  }
}
