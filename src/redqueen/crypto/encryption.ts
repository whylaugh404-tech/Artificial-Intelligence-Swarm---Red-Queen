import * as crypto from 'crypto';

export class EncryptionCrypto {
  /**
   * Encrypts data using AES-256-GCM.
   */
  encrypt(plaintext: string | Buffer, key: Buffer): { ciphertext: string; iv: string; authTag: string } {
    if (key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes for AES-256-GCM');
    }
    
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypts data using AES-256-GCM.
   */
  decrypt(ciphertext: string, iv: string, authTag: string, key: Buffer): Buffer {
    if (key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes for AES-256-GCM');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    
    let decrypted = decipher.update(Buffer.from(ciphertext, 'base64'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }
}

export const encryptionCrypto = new EncryptionCrypto();
