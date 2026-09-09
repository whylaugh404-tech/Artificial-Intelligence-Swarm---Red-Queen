import * as crypto from 'crypto';
import { logger } from '../core/logger';

export class IdentityCrypto {
  private readonly component = 'identity_crypto';

  /**
   * Generates a new Ed25519 keypair for the node.
   */
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    logger.debug(this.component, 'keypair_generated');
    
    return {
      publicKey: publicKey.toString(),
      privateKey: privateKey.toString(),
    };
  }

  /**
   * Validates if the provided string is a valid Ed25519 public key in PEM format.
   */
  isValidPublicKey(publicKeyPem: string): boolean {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') return false;
    try {
      const key = crypto.createPublicKey(publicKeyPem.trim());
      return key.asymmetricKeyType === 'ed25519';
    } catch (e) {
      return false;
    }
  }

  /**
   * Derives a stable Node ID from a public key.
   * Uses SHA-256 hash of the normalized PEM formatted public key.
   */
  deriveNodeId(publicKeyPem: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(publicKeyPem.trim());
    const nodeId = hash.digest('hex');
    return nodeId;
  }
}

export const identityCrypto = new IdentityCrypto();
