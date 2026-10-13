import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import { api } from '../src/lib/ipc';
import { captureNow } from '../src/app/actions/archive';
import { reconnectSelected } from '../src/app/actions/accounts';

afterEach(() => mock.restore());

const account = { id: 'test-account', subject: 'google-subject', email: 'test@example.test' };

function context() {
  return {
    busy: false,
    error: '',
    selected: account,
    captureProgress: null as import('../src/lib/ipc').CaptureProgress | null,
    toastMessage: '',
    selectAccount: mock(async () => {}),
    refreshAccounts: mock(async () => {}),
    captureNow: mock(async () => {}),
  };
}

it('keeps expired authorization visible after the progress bar clears', async () => {
  spyOn(api, 'capture').mockRejectedValue('GOOGLE_REAUTH_REQUIRED: Authorization expired.');
  const ctx = context();
  await captureNow.call(ctx);
  expect(ctx.error).toContain('Capture failed.');
  expect(ctx.error).toContain('GOOGLE_REAUTH_REQUIRED:');
  expect(ctx.captureProgress).toBeNull();
  expect(ctx.busy).toBe(false);
  expect(ctx.selectAccount).not.toHaveBeenCalled();
  expect(ctx.toastMessage).toBe('');
});

it('surfaces network failures and prevents concurrent capture requests', async () => {
  const capture = spyOn(api, 'capture').mockRejectedValue('Network unavailable');
  const ctx = context();
  ctx.busy = true;
  await captureNow.call(ctx);
  expect(capture).not.toHaveBeenCalled();
  ctx.busy = false;
  await captureNow.call(ctx);
  expect(ctx.error).toBe('Capture failed. Network unavailable');
  expect(ctx.busy).toBe(false);
});

it('keeps missing contact permission recoverable through Google reconnection', async () => {
  spyOn(api, 'capture').mockRejectedValue(
    'GOOGLE_REAUTH_REQUIRED: Contact access was not granted. Reconnect Google and select the permission to view your contacts on the authorization screen.',
  );
  const reconnect = spyOn(api, 'reconnect').mockResolvedValue(account);
  const ctx = context();
  await captureNow.call(ctx);
  expect(ctx.error).toContain('GOOGLE_REAUTH_REQUIRED:');
  expect(ctx.error).toContain('Contact access was not granted');
  await reconnectSelected.call(ctx);
  expect(reconnect).toHaveBeenCalledWith(account.id);
  expect(ctx.captureNow).toHaveBeenCalledTimes(1);
});

it('reconnects the same account and retries capture after sign-in', async () => {
  const reconnect = spyOn(api, 'reconnect').mockResolvedValue(account);
  const ctx = context();
  ctx.error = 'old failure';
  await reconnectSelected.call(ctx);
  expect(reconnect).toHaveBeenCalledWith(account.id);
  expect(ctx.selectAccount).toHaveBeenCalledWith(account);
  expect(ctx.captureNow).toHaveBeenCalledTimes(1);
  expect(ctx.busy).toBe(false);
  expect(ctx.error).toBe('');
});

it('leaves reconnection available after canceled, timed out, or wrong-account sign-in', async () => {
  spyOn(api, 'reconnect').mockRejectedValue('Google sign-in timed out');
  const ctx = context();
  await reconnectSelected.call(ctx);
  expect(ctx.error).toContain('GOOGLE_REAUTH_REQUIRED:');
  expect(ctx.error).toContain('timed out');
  expect(ctx.busy).toBe(false);
  expect(ctx.captureNow).not.toHaveBeenCalled();
  expect(ctx.selectAccount).not.toHaveBeenCalled();
});
