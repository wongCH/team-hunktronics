import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LlmWikiService } from './llmWikiService';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'acp-wiki-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function makeVault(path: string): Promise<void> {
  await fs.mkdir(join(path, 'entities', 'priorities', 'personal'), { recursive: true });
  await fs.mkdir(join(path, 'reviews'), { recursive: true });
  await fs.mkdir(join(path, 'raw'), { recursive: true });
  await fs.writeFile(join(path, 'SCHEMA.md'), '# Rules\n\nAlways ask before writing.');
  await fs.writeFile(join(path, 'identity.md'), '# About me\n\nName: Human User');
  await fs.writeFile(
    join(path, 'index.md'),
    '# Index\n\n## Priorities\n- [[entities/priorities/personal/focus]]\n\n## Projects\n- Project Alpha'
  );
  await fs.writeFile(join(path, 'log.md'), '# Log\n\n## [2026-07-19] query | Current priorities');
  await fs.writeFile(join(path, 'raw', 'secret.md'), 'Do not load this raw file.');
}

describe('LlmWikiService', () => {
  it('finds and validates an existing human-owned vault', async () => {
    const vault = join(dir, 'existing');
    await makeVault(vault);
    const service = new LlmWikiService([vault]);
    const realVault = await fs.realpath(vault);
    expect(await service.status(null)).toMatchObject({ state: 'found', path: realVault });
    expect(await service.status(vault)).toMatchObject({ state: 'ready', path: realVault });
  });

  it('rejects folders without the schema, index, and identity files', async () => {
    const invalid = join(dir, 'invalid');
    await fs.mkdir(invalid);
    expect(await new LlmWikiService([]).inspect(invalid)).toMatchObject({ state: 'invalid' });
  });

  it('creates one reusable LLM-Vault at the selected parent', async () => {
    const service = new LlmWikiService([]);
    const first = await service.create(dir);
    const second = await service.create(dir);
    expect(first).toMatchObject({ state: 'ready', path: await fs.realpath(join(dir, 'LLM-Vault')) });
    expect(second.path).toBe(first.path);
    expect(await fs.readFile(join(first.path!, 'identity.md'), 'utf8')).toContain('Human Identity');
  });

  it('loads bounded human context and excludes raw sources', async () => {
    const vault = join(dir, 'vault');
    await makeVault(vault);
    const context = await new LlmWikiService([]).loadContext(vault);
    expect(context).toContain('Name: Human User');
    expect(context).toContain('Always ask before writing.');
    expect(context).toContain('Project Alpha');
    expect(context).not.toContain('Do not load this raw file.');
  });

  it('rejects files that escape through an intermediate symlink', async () => {
    const vault = join(dir, 'vault');
    await makeVault(vault);
    const outside = join(dir, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(join(outside, 'todos.md'), '# Secret outside file');
    await fs.rm(join(vault, 'reviews'), { recursive: true });
    await fs.symlink(outside, join(vault, 'reviews'));

    await expect(new LlmWikiService([]).loadContext(vault)).rejects.toThrow(
      /outside the referenced vault/i
    );
  });
});