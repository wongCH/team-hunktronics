import { describe, expect, it } from 'vitest';
import { AGENT_LIBRARY, parseAgentSoul } from './agentLibrary';

describe('agent library', () => {
  it('defines unique templates with explicit soul-file readiness', () => {
    expect(AGENT_LIBRARY).toHaveLength(6);
    expect(new Set(AGENT_LIBRARY.map((template) => template.id)).size).toBe(6);
    expect(AGENT_LIBRARY.every((template) => template.soulFile.endsWith('.md'))).toBe(true);
    expect(AGENT_LIBRARY.every((template) => typeof template.ready === 'boolean')).toBe(true);
  });

  it('unlocks authored souls and removes their frontmatter', () => {
    expect(
      parseAgentSoul('---\ntitle: Email Agent\nstatus: ready\n---\n\n# Email Agent\n\nTriage mail.')
    ).toEqual({ soul: '# Email Agent\n\nTriage mail.', ready: true });
  });
});
