import { describe, expect, it } from 'vitest';
import { assembleContext } from './contextAssembler';

describe('assembleContext', () => {
  it('always includes identity, curated memory, and the current user input', () => {
    const result = assembleContext({
      identity: 'You are a research specialist.',
      teamMemory: 'Use Vitest.',
      agentMemory: 'Verify sources.',
      history: [{ role: 'assistant', content: 'Earlier response' }],
      userContent: 'Research this topic.'
    });
    expect(result.messages[0]).toEqual({ role: 'system', content: 'You are a research specialist.' });
    expect(result.messages[1].content).toContain('## Team Memory');
    expect(result.messages[1].content).toContain('## Agent Memory');
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: 'Research this topic.' });
  });

  it('selects the newest history deterministically within the budget', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `${index}: ${'x'.repeat(800)}`
    }));
    const result = assembleContext({
      identity: 'Focused agent',
      history,
      userContent: 'Current',
      contextWindow: 2_048,
      completionReserve: 512
    });
    expect(result.droppedMessages).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.budget);
    expect(result.messages.some((message) => message.content.startsWith('9:'))).toBe(true);
    expect(result.messages.some((message) => message.content.startsWith('0:'))).toBe(false);
  });

  it('fails instead of silently dropping required context', () => {
    expect(() =>
      assembleContext({
        identity: 'x'.repeat(10_000),
        history: [],
        userContent: 'Current',
        contextWindow: 2_048,
        completionReserve: 512
      })
    ).toThrow(/required identity/i);
  });
});