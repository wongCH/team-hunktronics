import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryService } from './memoryService';

let dir: string;
let memory: MemoryService;

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'acp-memory-'));
  memory = new MemoryService(dir);
  await memory.initialize();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('MemoryService', () => {
  it('creates bounded baseline memory and rejects traversal', async () => {
    const documents = await memory.list();
    expect(documents[0]).toMatchObject({ name: 'MEMORY.md', kind: 'baseline', scope: 'team' });

    await expect(
      memory.write({ scope: 'team', name: '../escape.md', content: 'bad' })
    ).rejects.toThrow(/safe Markdown file name/i);
    await expect(
      memory.write({ scope: 'agent', agentId: '../../escape', name: 'MEMORY.md', content: 'bad' })
    ).rejects.toThrow(/valid agent id/i);
    await expect(
      memory.write({ scope: 'team', name: 'MEMORY.md', content: Array.from({ length: 201 }, () => 'x').join('\n') })
    ).rejects.toThrow(/200 lines/i);
  });

  it('uses optimistic revisions and snapshots the prior version', async () => {
    const first = await memory.write({ scope: 'team', name: 'patterns.md', content: 'Use Vitest.' });
    const second = await memory.write({
      scope: 'team',
      name: 'patterns.md',
      content: 'Use Vitest and strict TypeScript.',
      expectedRevision: first.revision
    });
    expect(second.content).toContain('strict TypeScript');
    await expect(
      memory.write({
        scope: 'team',
        name: 'patterns.md',
        content: 'stale overwrite',
        expectedRevision: first.revision
      })
    ).rejects.toThrow(/changed since it was opened/i);
    const backups = await fs.readdir(join(dir, 'memory', '.history'));
    expect(backups).toHaveLength(1);
  });

  it('searches lexically and reports health deductions', async () => {
    await memory.write({ scope: 'team', name: 'architecture.md', content: 'Electron main owns provider execution.' });
    await memory.write({ scope: 'agent', agentId: 'researcher', name: 'patterns.md', content: 'Provider evidence must be verified.' });
    const results = await memory.search('provider evidence');
    expect(results[0].document).toMatchObject({ agentId: 'researcher', name: 'patterns.md' });
    expect(results[0].score).toBeGreaterThan(0);

    const baseline = (await memory.list()).find((document) => document.name === 'MEMORY.md')!;
    await memory.write({
      scope: 'team',
      name: 'MEMORY.md',
      content: Array.from({ length: 150 }, (_, index) => `line ${index}`).join('\n'),
      expectedRevision: baseline.revision
    });
    const health = await memory.health();
    expect(health.score).toBe(90);
    expect(health.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'baseline-lines-warning', severity: 'warning' })])
    );
  });

  it('appends timestamped agent daily logs without replacing prior entries', async () => {
    const at = Date.parse('2026-07-19T10:00:00Z');
    await memory.appendDailyLog('researcher', '## 10:00 · Run one\nCompleted first task.', at);
    const document = await memory.appendDailyLog(
      'researcher',
      '## 11:00 · Run two\nCompleted second task.',
      at
    );
    expect(document).toMatchObject({ kind: 'daily', name: '2026-07-19.md', agentId: 'researcher' });
    expect(document.content).toContain('Completed first task.');
    expect(document.content).toContain('Completed second task.');
  });

  it('proposes bounded compression and archives only accepted daily logs', async () => {
    const at = Date.parse('2026-07-19T10:00:00Z');
    await memory.write({
      scope: 'agent',
      agentId: 'researcher',
      name: 'MEMORY.md',
      content: '# Researcher Memory\n\n## Patterns\n- Verify sources.'
    });
    await memory.appendDailyLog(
      'researcher',
      '## Run\n- Decision: Prefer primary sources.\n- Error: None',
      at
    );
    const proposal = await memory.proposeCompression('researcher', at);
    expect(proposal.proposedContent).toContain('Decision: Prefer primary sources.');
    expect(proposal.sourceDocumentIds).toEqual(['agents/researcher/2026-07-19.md']);
    const baseline = await memory.applyCompression(proposal.id);
    expect(baseline.lineCount).toBeLessThanOrEqual(200);
    const documents = await memory.list();
    expect(documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agents/researcher/archive/2026-07-19.md', kind: 'archive' })
      ])
    );
    expect(documents.some((document) => document.id === 'agents/researcher/2026-07-19.md')).toBe(false);
  });

  it('rejects compression when the baseline changed after proposal creation', async () => {
    const at = Date.parse('2026-07-19T10:00:00Z');
    const baseline = await memory.write({ scope: 'agent', agentId: 'researcher', name: 'MEMORY.md', content: '# Memory' });
    await memory.appendDailyLog('researcher', '- Decision: Keep strict typing.', at);
    const proposal = await memory.proposeCompression('researcher', at);
    await memory.write({
      scope: 'agent', agentId: 'researcher', name: 'MEMORY.md', content: '# Memory\n- Human edit',
      expectedRevision: baseline.revision
    });
    await expect(memory.applyCompression(proposal.id)).rejects.toThrow(/changed after compression/i);
  });

  it('detects duplicate content and orphaned baseline references', async () => {
    const duplicate = 'This is a durable architecture note with enough repeated content to cross the duplicate threshold.'.repeat(2);
    await memory.write({ scope: 'team', name: 'one.md', content: duplicate });
    await memory.write({ scope: 'team', name: 'two.md', content: duplicate });
    const baseline = (await memory.list()).find((document) => document.id === 'team/MEMORY.md')!;
    await memory.write({
      scope: 'team', name: 'MEMORY.md', content: '# Team Memory\n\n[Missing topic](missing.md)',
      expectedRevision: baseline.revision
    });
    const health = await memory.health();
    expect(health.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-content-warning', severity: 'warning' }),
        expect.objectContaining({ code: 'orphaned-reference-info', severity: 'info' })
      ])
    );
    expect(health.score).toBe(87);
  });
});