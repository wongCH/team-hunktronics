import type { DeviceCodePayload } from '@shared/ipc';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface DeviceFlowHandle {
  /** Resolves with a GitHub access token, or rejects on error/cancel/timeout. */
  promise: Promise<string>;
  cancel: () => void;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  interval?: number;
}

function sleep(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = (): void => {
      if (signal.cancelled || Date.now() - start >= ms) return resolve();
      setTimeout(tick, 250);
    };
    tick();
  });
}

/**
 * Runs the GitHub OAuth device flow. Emits the user code via `onCode`, then polls
 * until the user authorizes (or the flow errors/expires/cancels).
 */
export function startDeviceFlow(opts: {
  clientId: string;
  scope: string;
  onCode: (code: DeviceCodePayload) => void;
}): DeviceFlowHandle {
  const state = { cancelled: false };

  const run = async (): Promise<string> => {
    const codeRes = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: opts.clientId, scope: opts.scope })
    });
    if (!codeRes.ok) {
      throw new Error(`Device code request failed: ${codeRes.status} ${codeRes.statusText}`);
    }
    const code = (await codeRes.json()) as DeviceCodeResponse;
    if (!code.device_code) {
      throw new Error('GitHub did not return a device code. Check the OAuth client id.');
    }

    opts.onCode({
      userCode: code.user_code,
      verificationUri: code.verification_uri,
      expiresIn: code.expires_in
    });

    let intervalMs = Math.max(code.interval, 5) * 1000;
    const deadline = Date.now() + code.expires_in * 1000;

    while (!state.cancelled && Date.now() < deadline) {
      await sleep(intervalMs, state);
      if (state.cancelled) break;

      const tokenRes = await fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: opts.clientId,
          device_code: code.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });
      const token = (await tokenRes.json()) as AccessTokenResponse;

      if (token.access_token) return token.access_token;
      if (token.error === 'authorization_pending') continue;
      if (token.error === 'slow_down') {
        intervalMs += 5000;
        continue;
      }
      if (token.error === 'expired_token') throw new Error('The device code expired. Try again.');
      if (token.error === 'access_denied') throw new Error('Authorization was denied.');
      if (token.error) throw new Error(`GitHub error: ${token.error}`);
    }

    if (state.cancelled) throw new Error('Device login cancelled.');
    throw new Error('Device login timed out.');
  };

  return {
    promise: run(),
    cancel: () => {
      state.cancelled = true;
    }
  };
}
