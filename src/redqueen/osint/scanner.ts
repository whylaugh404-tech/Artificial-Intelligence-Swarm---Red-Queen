import * as net from 'net';
import * as dns from 'dns/promises';
import { logger } from '../core/logger';

export class OsintScanner {
  private readonly component = 'osint_scanner';

  /**
   * REAL Port Scanner: No simulations. Establishes a true TCP socket connection.
   */
  async scanPort(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let isOpen = false;

      socket.setTimeout(timeoutMs);
      
      socket.on('connect', () => {
        isOpen = true;
        socket.destroy();
      });
      
      socket.on('timeout', () => {
        socket.destroy();
      });
      
      socket.on('error', () => {
        socket.destroy();
      });
      
      socket.on('close', () => {
        if (isOpen) {
          logger.debug(this.component, 'port_open', { host, port });
        }
        resolve(isOpen);
      });

      socket.connect(port, host);
    });
  }

  /**
   * REAL DNS Resolution: Fetches actual DNS records via Node's native resolver.
   */
  async resolveDomain(domain: string): Promise<any[]> {
    logger.info(this.component, 'resolving_dns', { domain });
    try {
      const records = await dns.resolveAny(domain);
      return records;
    } catch (err: any) {
      logger.error(this.component, 'dns_failed', err);
      return [];
    }
  }
}
