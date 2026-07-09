import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startDeviceFlow } from './deviceFlow';
import type { DeviceCodePayload } from '@shared/ipc';

/**
 * Backlog coverage: US-501 (GitHub device-flow login) — code emission, polling
 * with authorization_pending / slow_down, success, error mapping and cancel.
 * `fetch` and timers are faked so the poll loop runs instantly.
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

const fetchMock = vi.fn();

function json(data: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: 'OK', json: async () => data } as unknown as Response;
}

const CODE = {
  device_code: 'dev-code',
  user_code: 'WXYZ-1234',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5
};

/** Queue the initial device-code response, then a sequence of token responses. */
function mockFlow(...tokenResponses: unknown[]): void {
  fetchMock.mockImplementation((url: string) => {
    if (url === DEVICE_CODE_URL) return Promise.resolve(json(CODE));
    if (url === ACCESS_TOKEN_URL) {
      const next = tokenResponses.shift() ?? { error: 'authorization_pending' };
      return Promise.resolve(json(next));
    }
    throw new Error('unexpected url ' + url);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('startDeviceFlow (US-501)', () => {
  it('emits the user code then resolves with the access token', async () => {
    mockFlow({ access_token: 'gho_success' });
    let code: DeviceCodePayload | null = null;
    const handle = startDeviceFlow({
      clientId: 'Iv1.test',
      scope: 'read:user',
      onCode: (c) => (code = c)
    });

    await vi.runAllTimersAsync();
    await expect(handle.promise).resolves.toBe('gho_success');
    expect(code).toEqual({
      userCode: 'WXYZ-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900
    });
  });

  it('keeps polling through authorization_pending and slow_down', async () => {
    mockFlow(
      { error: 'authorization_pending' },
      { error: 'slow_down' },
      { access_token: 'gho_eventually' }
    );
    const handle = startDeviceFlow({ clientId: 'Iv1.test', scope: 'read:user', onCode: () => {} });

    await vi.runAllTimersAsync();
    await expect(handle.promise).resolves.toBe('gho_eventually');
    // 1 device-code call + 3 token polls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects with a friendly message when the code expires', async () => {
    mockFlow({ error: 'expired_token' });
    const handle = startDeviceFlow({ clientId: 'Iv1.test', scope: 'read:user', onCode: () => {} });
    const expectation = expect(handle.promise).rejects.toThrow('The device code expired. Try again.');
    await vi.runAllTimersAsync();
    await expectation;
  });

  it('rejects when authorization is denied', async () => {
    mockFlow({ error: 'access_denied' });
    const handle = startDeviceFlow({ clientId: 'Iv1.test', scope: 'read:user', onCode: () => {} });
    const expectation = expect(handle.promise).rejects.toThrow('Authorization was denied.');
    await vi.runAllTimersAsync();
    await expectation;
  });

  it('rejects when cancelled before authorization completes', async () => {
    mockFlow({ error: 'authorization_pending' }, { error: 'authorization_pending' });
    const handle = startDeviceFlow({ clientId: 'Iv1.test', scope: 'read:user', onCode: () => {} });
    const expectation = expect(handle.promise).rejects.toThrow('Device login cancelled.');
    // Let the device code resolve, then cancel mid-poll.
    await vi.advanceTimersByTimeAsync(1);
    handle.cancel();
    await vi.runAllTimersAsync();
    await expectation;
  });

  it('rejects when GitHub does not return a device code', async () => {
    fetchMock.mockResolvedValue(json({}));
    const handle = startDeviceFlow({ clientId: 'bad', scope: 'read:user', onCode: () => {} });
    const expectation = expect(handle.promise).rejects.toThrow(/did not return a device code/);
    await vi.runAllTimersAsync();
    await expectation;
  });
});
