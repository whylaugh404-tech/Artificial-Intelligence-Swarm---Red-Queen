import * as crypto from 'crypto';
import { canonicalizeJson } from '../cognition/computation/canonical';

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  aad?: string;
}

export class EncryptionCrypto {
  /**
   * Derives a 32-byte symmetric key from a secret using RFC 5869 HKDF with SHA-256.
   */
  deriveKey(secret: string | Buffer, salt: string | Buffer, info: string = 'redqueen_v1_key'): Buffer {
    const secretBuf = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
    const saltBuf = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : salt;
    return Buffer.from(crypto.hkdfSync('sha256', secretBuf, saltBuf, Buffer.from(info, 'utf8'), 32));
  }

  /**
   * Encrypts data using AES-256-GCM with authenticated associated data (AAD).
   */
  encrypt(
    plaintext: string | Buffer,
    key: Buffer,
    aad?: string | Buffer
  ): EncryptedEnvelope {
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      throw new Error('Encryption key must be a 32-byte Buffer for AES-256-GCM');
    }
    
    // Standard 96-bit (12-byte) initialization vector
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let aadString: string | undefined;
    if (aad !== undefined && aad !== null) {
      const aadBuf = typeof aad === 'string' ? Buffer.from(aad, 'utf8') : aad;
      cipher.setAAD(aadBuf);
      aadString = typeof aad === 'string' ? aad : aadBuf.toString('base64');
    }

    const plaintextBuf = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    let encrypted = cipher.update(plaintextBuf);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ...(aadString ? { aad: aadString } : {})
    };
  }

  /**
   * Decrypts data using AES-256-GCM with authenticated associated data (AAD) validation.
   */
  decrypt(
    ciphertext: string,
    iv: string,
    authTag: string,
    key: Buffer,
    aad?: string | Buffer
  ): Buffer {
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      throw new Error('Encryption key must be a 32-byte Buffer for AES-256-GCM');
    }

    const ivBuf = Buffer.from(iv, 'base64');
    if (ivBuf.length !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes for AES-256-GCM, got ${ivBuf.length}`);
    }

    const authTagBuf = Buffer.from(authTag, 'base64');
    if (authTagBuf.length !== 16) {
      throw new Error(`Invalid authTag length: expected 16 bytes for AES-256-GCM, got ${authTagBuf.length}`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
    decipher.setAuthTag(authTagBuf);

    if (aad !== undefined && aad !== null) {
      const aadBuf = typeof aad === 'string' ? Buffer.from(aad, 'utf8') : aad;
      decipher.setAAD(aadBuf);
    }
    
    let decrypted = decipher.update(Buffer.from(ciphertext, 'base64'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }

  /**
   * Encrypts an arbitrary JSON payload into an EncryptedEnvelope using RFC 8785 canonical serialization.
   */
  encryptPayload<T = unknown>(payload: T, key: Buffer, aad?: string): EncryptedEnvelope {
    const canonicalStr = canonicalizeJson(payload);
    return this.encrypt(canonicalStr, key, aad);
  }

  /**
   * Decrypts an EncryptedEnvelope and parses the canonical JSON payload.
   */
  decryptPayload<T = unknown>(envelope: EncryptedEnvelope, key: Buffer): T {
    const decryptedBuf = this.decrypt(
      envelope.ciphertext,
      envelope.iv,
      envelope.authTag,
      key,
      envelope.aad
    );
    return JSON.parse(decryptedBuf.toString('utf8')) as T;
  }
}

export const encryptionCrypto = new EncryptionCrypto();

