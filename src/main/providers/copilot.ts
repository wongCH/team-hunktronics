import type { ChatMessage, ChatParams, ModelInfo } from '@shared/types';
import type { Provider, ProviderContext, StreamCallbacks } from './types';
import { httpError } from './stream';
import { openaiChatStream, openaiListModels, type OpenAICompatOptions } from './openai-compatible';

const TOKEN_EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_API_BASE = 'https://api.githubcopilot.com';
const EDITOR_VERSION = 'vscode/1.95.0';
const PLUGIN_VERSION = 'copilot-chat/0.22.0';
const USER_AGENT = 'GitHubCopilotChat/0.22.0';
const INTEGRATION_ID = 'vscode-chat';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch seconds
}

/**
 * EXPERIMENTAL. Uses a GitHub OAuth token (obtained via device flow) to access a
 * Copilot subscription. This is an unofficial integration and may violate GitHub's
 * Terms of Service. It is gated behind the `experimentalCopilot` setting.
 */
export class CopilotProvider implements Provider {
  readonly type = 'copilot' as const;
  private cache = new Map<string, CachedToken>();

  private async getCopilotToken(githubToken: string): Promise<string> {
    const cached = this.cache.get(githubToken);
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt - 60 > now) return cached.token;

    const res = await fetch(TOKEN_EXCHANGE_URL, {
      headers: {
        authorization: `token ${githubToken}`,
        'editor-version': EDITOR_VERSION,
        'editor-plugin-version': PLUGIN_VERSION,
        'user-agent': USER_AGENT,
        accept: 'application/json'
      }
    });
    if (!res.ok) throw await httpError('Copilot token exchange failed', res);
    const json = (await res.json()) as { token?: string; expires_at?: number };
    if (!json.token) throw new Error('Copilot token exchange returned no token.');
    this.cache.set(githubToken, {
      token: json.token,
      expiresAt: json.expires_at ?? now + 300
    });
    return json.token;
  }

  private async opts(ctx: ProviderContext): Promise<OpenAICompatOptions> {
    if (!ctx.apiKey) {
      throw new Error('Not signed in to GitHub Copilot. Use device login first.');
    }
    const copilotToken = await this.getCopilotToken(ctx.apiKey);
    return {
      baseUrl: COPILOT_API_BASE,
      headers: {
        authorization: `Bearer ${copilotToken}`,
        'editor-version': EDITOR_VERSION,
        'editor-plugin-version': PLUGIN_VERSION,
        'copilot-integration-id': INTEGRATION_ID,
        'openai-intent': 'conversation-panel',
        'user-agent': USER_AGENT
      }
    };
  }

  async listModels(ctx: ProviderContext): Promise<ModelInfo[]> {
    return openaiListModels(await this.opts(ctx));
  }

  async streamChat(
    ctx: ProviderContext,
    model: string,
    messages: ChatMessage[],
    params: ChatParams | undefined,
    signal: AbortSignal,
    cb: StreamCallbacks
  ): Promise<void> {
    return openaiChatStream(await this.opts(ctx), model, messages, params, signal, cb);
  }
}
