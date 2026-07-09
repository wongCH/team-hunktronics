import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Backlog coverage: US-201 (encrypt keys with OS keychain), US-202 (never expose
 * plaintext), SEC-02 (0600 base64 ciphertext at rest), SEC-08 (fail closed when
 * encryption is unavailable).
 *
 * Electron's safeStorage is mocked with a reversible, non-cryptographic transform
 * so we can assert round-tripping and at-rest encoding without a real keychain.
 */
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('ENC::' + s, 'utf8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^ENC::/, '')),
    getSelectedStorageBackend: vi.fn(() => 'basic_text')
  }
}));

import { safeStorage } from 'electron';
import { Vault } from './vault';

const available = safeStorage.isEncryptionAvailable as unknown as ReturnType<typeof vi.fn>;

let dir: string;
let vault: Vault;

beforeEach(async () => {
  available.mockReturnValue(true);
  dir = await fs.mkdtemp(join(tmpdir(), 'acp-vault-'));
  vault = new Vault(dir);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('Vault — secret round-trip (US-201)', () => {
  it('encrypts on set and decrypts on get', async () => {
    await vault.setSecret('conn-1', 'sk-super-secret');
    expect(safeStorage.encryptString).toHaveBeenCalledWith('sk-super-secret');
    expect(await vault.getSecret('conn-1')).toBe('sk-super-secret');
  });

  it('reports presence and returns null for unknown ids', async () => {
    await vault.setSecret('conn-1', 'value');
    expect(await vault.hasSecret('conn-1')).toBe(true);
    expect(await vault.hasSecret('nope')).toBe(false);
    expect(await vault.getSecret('nope')).toBeNull();
  });

  it('clears a stored secret', async () => {
    await vault.setSecret('conn-1', 'value');
    await vault.clearSecret('conn-1');
    expect(await vault.hasSecret('conn-1')).toBe(false);
    expect(await vault.getSecret('conn-1')).toBeNull();
  });

  it('persists ciphertext across Vault instances', async () => {
    await vault.setSecret('conn-1', 'value');
    const reopened = new Vault(dir);
    expect(await reopened.getSecret('conn-1')).toBe('value');
  });
});

describe('Vault — at-rest protection (SEC-02)', () => {
  it('stores base64 ciphertext, not plaintext, with 0600 permissions', async () => {
    await vault.setSecret('conn-1', 'plaintext-key');
    const file = join(dir, 'vault.json');
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, string>;

    expect(raw).not.toContain('plaintext-key');
    // Value is base64 of the mocked ciphertext ("ENC::plaintext-key").
    expect(Buffer.from(parsed['conn-1'], 'base64').toString('utf8')).toBe('ENC::plaintext-key');

    const stat = await fs.stat(file);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('Vault — fail closed when encryption unavailable (SEC-08)', () => {
  it('throws instead of writing plaintext on set', async () => {
    available.mockReturnValue(false);
    await expect(vault.setSecret('conn-1', 'value')).rejects.toThrow(/not available/i);
  });

  it('throws when decrypting an existing secret without encryption', async () => {
    await vault.setSecret('conn-1', 'value');
    available.mockReturnValue(false);
    await expect(vault.getSecret('conn-1')).rejects.toThrow(/not available/i);
  });

  it('reports the backend as unavailable', () => {
    available.mockReturnValue(false);
    expect(vault.isAvailable()).toBe(false);
    expect(vault.backendName()).toBe('unavailable');
  });

  it('reports a concrete backend name when available', () => {
    expect(vault.isAvailable()).toBe(true);
    expect(vault.backendName()).toEqual(expect.any(String));
    expect(vault.backendName()).not.toBe('unavailable');
  });
});
