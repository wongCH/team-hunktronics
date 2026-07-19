import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import type {
  MemoryCompressionProposal,
  MemoryDocument,
  MemoryHealth,
  MemoryHealthFinding,
  MemoryKind,
  MemorySearchResult,
  MemoryWriteCommand
} from '@shared/types';

const BASELINE_NAME = 'MEMORY.md';
const DAILY_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/;

function revision(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function kindOf(name: string): MemoryKind {
  if (name === BASELINE_NAME) return 'baseline';
  return DAILY_PATTERN.test(name) ? 'daily' : 'evergreen';
}

function lineCount(content: string): number {
  return content ? content.split(/\r?\n/).length : 0;
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [];
}

export class MemoryService {
  private readonly root: string;
  private readonly proposals = new Map<string, MemoryCompressionProposal>();

  constructor(userDataDir: string) {
    this.root = resolve(userDataDir, 'memory');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(join(this.root, 'team'), { recursive: true });
    const baseline = join(this.root, 'team', BASELINE_NAME);
    try {
      await fs.access(baseline);
    } catch {
      await this.atomicWrite(
        baseline,
        '# Team Memory\n\n## Active Context\n\n## Decisions\n\n## Shared Conventions\n'
      );
    }
  }

  async list(): Promise<MemoryDocument[]> {
    await this.initialize();
    const files = await this.walk(this.root);
    const documents = await Promise.all(files.filter((file) => file.endsWith('.md')).map((file) => this.readPath(file)));
    return documents.sort((a, b) => {
      if (a.kind === 'baseline' && b.kind !== 'baseline') return -1;
      if (b.kind === 'baseline' && a.kind !== 'baseline') return 1;
      return b.updatedAt - a.updatedAt || a.name.localeCompare(b.name);
    });
  }

  async write(command: MemoryWriteCommand): Promise<MemoryDocument> {
    await this.initialize();
    const target = this.resolveDocument(command);
    const kind = kindOf(command.name);
    if (kind === 'baseline' && lineCount(command.content) > 200) {
      throw new Error('Baseline memory cannot exceed 200 lines. Move detail into an evergreen file.');
    }
    if (Buffer.byteLength(command.content, 'utf8') > 100_000) {
      throw new Error('Memory documents cannot exceed 100 KB.');
    }

    let current: string | null = null;
    try {
      current = await fs.readFile(target, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (command.expectedRevision && revision(current ?? '') !== command.expectedRevision) {
      throw new Error('Memory changed since it was opened. Reload before saving.');
    }

    if (current !== null) {
      const backupDir = join(this.root, '.history');
      await fs.mkdir(backupDir, { recursive: true });
      const backupName = `${Date.now()}-${createHash('sha1').update(relative(this.root, target)).digest('hex')}.md`;
      await this.atomicWrite(join(backupDir, backupName), current);
    }
    await this.atomicWrite(target, command.content);
    return this.readPath(target);
  }

  async search(query: string, limit = 20): Promise<MemorySearchResult[]> {
    const terms = [...new Set(tokenize(query))];
    if (terms.length === 0) return [];
    const documents = await this.list();
    return documents
      .map((document) => {
        const haystack = `${document.name}\n${document.content}`.toLocaleLowerCase();
        const score = terms.reduce((total, term) => {
          const matches = haystack.split(term).length - 1;
          return total + matches + (document.name.toLocaleLowerCase().includes(term) ? 3 : 0);
        }, 0);
        const firstTerm = terms.find((term) => haystack.includes(term));
        const index = firstTerm ? haystack.indexOf(firstTerm) : 0;
        const start = Math.max(0, index - 80);
        return {
          document,
          score,
          excerpt: document.content.slice(start, start + 240).replace(/\s+/g, ' ').trim()
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || b.document.updatedAt - a.document.updatedAt)
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  async getBaseline(agentId?: string): Promise<{ teamMemory: string; agentMemory: string }> {
    const documents = await this.list();
    return {
      teamMemory:
        documents.find((document) => document.scope === 'team' && document.kind === 'baseline')
          ?.content ?? '',
      agentMemory: agentId
        ? documents.find(
            (document) =>
              document.scope === 'agent' &&
              document.agentId === agentId &&
              document.kind === 'baseline'
          )?.content ?? ''
        : ''
    };
  }

  async appendDailyLog(agentId: string, entry: string, at = Date.now()): Promise<MemoryDocument> {
    const name = `${new Date(at).toISOString().slice(0, 10)}.md`;
    const existing = (await this.list()).find(
      (document) => document.scope === 'agent' && document.agentId === agentId && document.name === name
    );
    const content = existing
      ? `${existing.content.trimEnd()}\n\n${entry.trim()}\n`
      : `# Daily Log · ${name.slice(0, 10)}\n\n${entry.trim()}\n`;
    return this.write({
      scope: 'agent',
      agentId,
      name,
      content,
      expectedRevision: existing?.revision
    });
  }

  async health(now = Date.now()): Promise<MemoryHealth> {
    const documents = await this.list();
    const findings: MemoryHealthFinding[] = [];
    const totalBytes = documents.reduce((total, document) => total + document.sizeBytes, 0);
    const baseline = documents.find((document) => document.scope === 'team' && document.kind === 'baseline');

    if (!baseline) this.add(findings, 'baseline-missing', 'critical', 'Team MEMORY.md is missing.');
    if (baseline && baseline.lineCount > 200) {
      this.add(findings, 'baseline-lines-critical', 'critical', 'Team MEMORY.md exceeds 200 lines.', baseline.id);
    } else if (baseline && baseline.lineCount >= 150) {
      this.add(findings, 'baseline-lines-warning', 'warning', 'Team MEMORY.md is approaching 200 lines.', baseline.id);
    }

    for (const document of documents) {
      if (document.sizeBytes > 100_000) {
        this.add(findings, 'file-size-critical', 'critical', `${document.name} exceeds 100 KB.`, document.id);
      } else if (document.sizeBytes >= 50_000) {
        this.add(findings, 'file-size-warning', 'warning', `${document.name} exceeds 50 KB.`, document.id);
      }
      const ageDays = (now - document.updatedAt) / 86_400_000;
      if (document.kind === 'daily' && ageDays > 60) {
        this.add(findings, 'daily-stale-warning', 'warning', `${document.name} is older than 60 days.`, document.id);
      } else if (document.kind === 'daily' && ageDays >= 30) {
        this.add(findings, 'daily-stale-info', 'info', `${document.name} should be reviewed for knowledge worth retaining.`, document.id);
      } else if (document.kind === 'evergreen' && ageDays >= 90) {
        this.add(findings, 'evergreen-stale-info', 'info', `${document.name} has not been verified in 90 days.`, document.id);
      }
    }

    if (totalBytes > 1_000_000) {
      this.add(findings, 'directory-size-critical', 'critical', 'Memory exceeds 1 MB.');
    } else if (totalBytes >= 500_000) {
      this.add(findings, 'directory-size-warning', 'warning', 'Memory exceeds 500 KB.');
    }
    if (documents.length > 100) {
      this.add(findings, 'file-count-warning', 'warning', 'Memory has more than 100 documents.');
    }

    const byNormalizedContent = new Map<string, MemoryDocument[]>();
    for (const document of documents) {
      const normalized = document.content.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      if (normalized.length < 80) continue;
      const key = createHash('sha256').update(normalized).digest('hex');
      const matches = byNormalizedContent.get(key) ?? [];
      matches.push(document);
      byNormalizedContent.set(key, matches);
    }
    for (const matches of byNormalizedContent.values()) {
      if (matches.length > 1) {
        this.add(
          findings,
          'duplicate-content-warning',
          'warning',
          `Substantially duplicate memory exists in ${matches.map((document) => document.id).join(', ')}.`
        );
      }
    }

    for (const document of documents.filter((item) => item.kind === 'baseline')) {
      const references = [...document.content.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map(
        (match) => match[1]
      );
      for (const reference of references) {
        if (/^[a-z]+:/i.test(reference)) continue;
        const scopePrefix = document.agentId ? `agents/${document.agentId}/` : 'team/';
        const target = reference.startsWith('/')
          ? reference.slice(1)
          : `${scopePrefix}${reference.replace(/^\.\//, '')}`;
        if (!documents.some((candidate) => candidate.id === target)) {
          this.add(
            findings,
            'orphaned-reference-info',
            'info',
            `${document.id} links to missing memory file ${reference}.`,
            document.id
          );
        }
      }
    }

    const deductions = { critical: 20, warning: 10, info: 3 } as const;
    const score = Math.max(0, 100 - findings.reduce((total, finding) => total + deductions[finding.severity], 0));
    return { score, totalBytes, documentCount: documents.length, findings };
  }

  async proposeCompression(agentId: string, now = Date.now()): Promise<MemoryCompressionProposal> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(agentId)) throw new Error('A valid agent id is required.');
    const documents = await this.list();
    const baseline = documents.find(
      (document) =>
        document.scope === 'agent' && document.agentId === agentId && document.kind === 'baseline'
    );
    const sourceLogs = documents
      .filter(
        (document) =>
          document.scope === 'agent' && document.agentId === agentId && document.kind === 'daily'
      )
      .sort((a, b) => a.updatedAt - b.updatedAt);
    if (sourceLogs.length === 0) throw new Error('No daily logs are available to compress.');

    const candidates = sourceLogs.flatMap((document) =>
      document.content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
          (line) =>
            line.startsWith('- ') &&
            !/^- (Run|Conversation|Status|Error): (None|completed|cancelled)$/i.test(line)
        )
    );
    const unique = [...new Set(candidates)].slice(-80);
    const prior = baseline?.content.trim() || `# Agent Memory · ${agentId}`;
    const proposedContent = [
      prior,
      '',
      '## Compressed Run Insights',
      ...unique,
      '',
      '## Compression Sources',
      ...sourceLogs.map((document) => `- ${document.id}`)
    ].join('\n');
    const warnings: string[] = [];
    if (lineCount(proposedContent) >= 150) warnings.push('Proposal is approaching the 200-line baseline limit.');
    if (unique.length === 0) warnings.push('No durable bullet candidates were detected; review before applying.');
    const proposal: MemoryCompressionProposal = {
      id: createHash('sha256')
        .update(`${agentId}:${baseline?.revision ?? revision('')}:${sourceLogs.map((document) => document.revision).join(':')}`)
        .digest('hex'),
      agentId,
      baselineRevision: baseline?.revision ?? revision(''),
      proposedContent,
      sourceDocumentIds: sourceLogs.map((document) => document.id),
      warnings,
      createdAt: now
    };
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  async applyCompression(proposalId: string): Promise<MemoryDocument> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Compression proposal not found or expired.');
    if (lineCount(proposal.proposedContent) > 200) {
      throw new Error('Compression proposal exceeds 200 lines. Edit the baseline manually.');
    }
    const documents = await this.list();
    const currentBaseline = documents.find(
      (document) =>
        document.scope === 'agent' &&
        document.agentId === proposal.agentId &&
        document.kind === 'baseline'
    );
    const currentRevision = currentBaseline?.revision ?? revision('');
    if (currentRevision !== proposal.baselineRevision) {
      throw new Error('Agent memory changed after compression was proposed. Generate a new proposal.');
    }
    const sources = proposal.sourceDocumentIds.map((id) => documents.find((document) => document.id === id));
    if (sources.some((document) => !document || document.kind !== 'daily')) {
      throw new Error('A source daily log changed or is no longer available.');
    }

    const baseline = await this.write({
      scope: 'agent',
      agentId: proposal.agentId,
      name: BASELINE_NAME,
      content: proposal.proposedContent,
      expectedRevision: currentBaseline?.revision
    });
    for (const source of sources as MemoryDocument[]) {
      const sourcePath = this.confine(join(this.root, ...source.id.split('/')));
      const archivePath = this.confine(
        join(this.root, 'agents', proposal.agentId, 'archive', source.name)
      );
      await fs.mkdir(dirname(archivePath), { recursive: true });
      await fs.rename(sourcePath, archivePath);
    }
    this.proposals.delete(proposal.id);
    return baseline;
  }

  private resolveDocument(command: MemoryWriteCommand): string {
    if (!SAFE_NAME_PATTERN.test(command.name) || command.name.includes('..')) {
      throw new Error('Memory file name must be a safe Markdown file name.');
    }
    let parent: string;
    if (command.scope === 'team') {
      parent = join(this.root, 'team');
    } else {
      const agentId = command.agentId?.trim() ?? '';
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(agentId)) throw new Error('A valid agent id is required.');
      parent = join(this.root, 'agents', agentId);
    }
    return this.confine(join(parent, command.name));
  }

  private confine(path: string): string {
    const target = resolve(path);
    const rel = relative(this.root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) {
      throw new Error('Memory path is outside the managed root.');
    }
    return target;
  }

  private async readPath(path: string): Promise<MemoryDocument> {
    const target = this.confine(path);
    const content = await fs.readFile(target, 'utf8');
    const stat = await fs.stat(target);
    const rel = relative(this.root, target);
    const segments = rel.split(sep);
    const agentId = segments[0] === 'agents' ? segments[1] : null;
    const scope = agentId ? 'agent' : 'team';
    const name = basename(target);
    const kind = segments.includes('archive') ? 'archive' : kindOf(name);
    return {
      id: rel.split(sep).join('/'),
      scope,
      agentId,
      name,
      kind,
      content,
      revision: revision(content),
      lineCount: lineCount(content),
      sizeBytes: stat.size,
      updatedAt: stat.mtimeMs
    };
  }

  private async walk(path: string): Promise<string[]> {
    const entries = await fs.readdir(path, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.name !== '.history')
        .map((entry) => {
          const child = join(path, entry.name);
          return entry.isDirectory() ? this.walk(child) : Promise.resolve([child]);
        })
    );
    return files.flat();
  }

  private async atomicWrite(path: string, content: string): Promise<void> {
    const target = this.confine(path);
    await fs.mkdir(dirname(target), { recursive: true });
    const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.tmp`);
    await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, target);
  }

  private add(
    findings: MemoryHealthFinding[],
    code: string,
    severity: MemoryHealthFinding['severity'],
    message: string,
    documentId?: string
  ): void {
    findings.push({ code, severity, message, documentId });
  }
}