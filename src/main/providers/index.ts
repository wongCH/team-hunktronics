import type { ProviderType } from '@shared/types';
import type { Provider } from './types';
import { OpenAICompatibleProvider } from './openai-compatible';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { CopilotProvider } from './copilot';

const registry: Record<ProviderType, Provider> = {
  ollama: new OllamaProvider(),
  openai: new OpenAICompatibleProvider('openai', 'https://api.openai.com/v1'),
  'github-models': new OpenAICompatibleProvider('github-models', 'https://models.github.ai/inference'),
  'openai-compatible': new OpenAICompatibleProvider('openai-compatible', 'https://openrouter.ai/api/v1'),
  anthropic: new AnthropicProvider(),
  copilot: new CopilotProvider()
};

export function getProvider(type: ProviderType): Provider {
  const provider = registry[type];
  if (!provider) throw new Error(`Unknown provider type: ${type}`);
  return provider;
}

export type { Provider, ProviderContext } from './types';
