import type { ChatMessage } from '@shared/types';

export interface ContextAssemblyInput {
  identity?: string;
  runtimeInstructions?: string;
  llmWikiContext?: string;
  skills?: Array<{ name: string; instructions: string }>;
  teamMemory?: string;
  agentMemory?: string;
  retrievedMemory?: string;
  history: ChatMessage[];
  userContent: string;
  contextWindow?: number;
  completionReserve?: number;
}

export interface ContextAssemblyResult {
  messages: ChatMessage[];
  estimatedTokens: number;
  droppedMessages: number;
  budget: number;
}

export function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function messageTokens(message: ChatMessage): number {
  return estimateTokens(message.content) + 4;
}

export function assembleContext(input: ContextAssemblyInput): ContextAssemblyResult {
  const contextWindow = Math.max(2_048, input.contextWindow ?? 32_768);
  const completionReserve = Math.max(512, input.completionReserve ?? 4_096);
  const budget = Math.max(1_024, contextWindow - completionReserve);
  const fixed: ChatMessage[] = [];

  if (input.identity?.trim()) fixed.push({ role: 'system', content: input.identity.trim() });
  if (input.runtimeInstructions?.trim()) {
    fixed.push({ role: 'system', content: input.runtimeInstructions.trim() });
  }
  if (input.llmWikiContext?.trim()) {
    fixed.push({
      role: 'system',
      content: `## Human LLM Wiki\n${input.llmWikiContext.trim()}`
    });
  }
  if (input.skills?.length) {
    fixed.push({
      role: 'system',
      content: `## Assigned Skills\n${input.skills
        .map((skill) => `### ${skill.name}\n${skill.instructions.trim()}`)
        .join('\n\n')}`
    });
  }
  const memorySections = [
    input.teamMemory?.trim() ? `## Team Memory\n${input.teamMemory.trim()}` : '',
    input.agentMemory?.trim() ? `## Agent Memory\n${input.agentMemory.trim()}` : '',
    input.retrievedMemory?.trim()
      ? `## Relevant Memory Excerpts\n${input.retrievedMemory.trim()}`
      : ''
  ].filter(Boolean);
  if (memorySections.length) {
    fixed.push({
      role: 'system',
      content: `Use the following curated memory as context. Treat newer user instructions as authoritative.\n\n${memorySections.join('\n\n')}`
    });
  }
  const current: ChatMessage = { role: 'user', content: input.userContent.trim() };
  const fixedTokens = [...fixed, current].reduce(
    (total, message) => total + messageTokens(message),
    0
  );
  if (fixedTokens > budget) {
    throw new Error(
      'Required identity, memory, and current input exceed the model context budget.'
    );
  }

  let remaining = budget - fixedTokens;
  const selected: ChatMessage[] = [];
  let droppedMessages = 0;
  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const message = input.history[index];
    const tokens = messageTokens(message);
    if (tokens <= remaining) {
      selected.unshift(message);
      remaining -= tokens;
    } else {
      droppedMessages += 1;
    }
  }

  const messages = [...fixed, ...selected, current];
  return {
    messages,
    estimatedTokens: messages.reduce((total, message) => total + messageTokens(message), 0),
    droppedMessages,
    budget
  };
}
