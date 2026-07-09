import { safeStorage } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Encrypted secret store backed by the OS keychain via Electron's safeStorage.
 * Secrets are encrypted in the main process and persisted as base64 ciphertext.
 * Plaintext keys never leave the main process and are never exposed over IPC.
 */
export class Vault {
  private readonly file: string;
  private cache: Record<string, string> | null = null;

  constructor(dir: string) {
    this.file = join(dir, 'vault.json');
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      this.cache = JSON.parse(raw) as Record<string, string>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    await fs.writeFile(this.file, JSON.stringify(this.cache ?? {}, null, 2), { mode: 0o600 });
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  backendName(): string {
    if (!this.isAvailable()) return 'unavailable';
    if (process.platform === 'darwin') return 'macOS Keychain';
    if (process.platform === 'win32') return 'Windows DPAPI';
    try {
      return safeStorage.getSelectedStorageBackend();
    } catch {
      return 'os-encryption';
    }
  }

  async setSecret(id: string, secret: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('OS encryption is not available; cannot store secrets securely.');
    }
    const store = await this.load();
    const encrypted = safeStorage.encryptString(secret);
    store[id] = encrypted.toString('base64');
    await this.persist();
  }

  /** Internal use only (provider calls). Never expose over IPC. */
  async getSecret(id: string): Promise<string | null> {
    const store = await this.load();
    const b64 = store[id];
    if (!b64) return null;
    if (!this.isAvailable()) {
      throw new Error('OS encryption is not available; cannot decrypt stored secret.');
    }
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  }

  async hasSecret(id: string): Promise<boolean> {
    const store = await this.load();
    return Boolean(store[id]);
  }

  async clearSecret(id: string): Promise<void> {
    const store = await this.load();
    if (store[id]) {
      delete store[id];
      await this.persist();
    }
  }
}
