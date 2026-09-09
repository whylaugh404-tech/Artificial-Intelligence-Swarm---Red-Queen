import * as crypto from 'crypto';

export class SigningCrypto {
  /**
   * Signs data using an Ed25519 private key.
   */
  sign(data: string | Buffer, privateKeyPem: string): string {
    const sign = crypto.createSign('sha512'); // Although Ed25519 doesn't strictly use this hash algorithm choice in Node.js, createSign API requires it. 'sha512' is standard. However, Ed25519 ignores the digest algorithm parameter in Node.
    // In Node >= 12 for Ed25519 we can also use crypto.sign(null, Buffer.from(data), privateKeyPem)
    const signature = crypto.sign(null, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), privateKeyPem);
    return signature.toString('hex');
  }

  /**
   * Verifies a signature using an Ed25519 public key.
   */
  verify(data: string | Buffer, signatureHex: string, publicKeyPem: string): boolean {
    try {
      const signature = Buffer.from(signatureHex, 'hex');
      return crypto.verify(null, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), publicKeyPem, signature);
    } catch (e) {
      return false;
    }
  }
}

export const signingCrypto = new SigningCrypto();
