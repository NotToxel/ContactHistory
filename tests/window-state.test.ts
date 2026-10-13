import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import type { Window } from '@tauri-apps/api/window';
import { api } from '../src/lib/ipc';
import { observeWindowState } from '../src/app/window-state';

afterEach(() => mock.restore());
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function context() {
  let resize = () => {};
  const unlisten = mock(() => {});
  const appWindow = {
    onResized: mock(async (callback: () => void) => {
      resize = callback;
      return unlisten;
    }),
    isMaximized: mock(async () => false),
  };
  return {
    app: { isMaximized: false, appWindow: appWindow as unknown as Window },
    resize: () => resize(),
    unlisten,
  };
}

it('tracks native maximize and restore events without clicking the window control', async () => {
  const query = spyOn(api, 'winIsMaximized').mockResolvedValue(true);
  const ctx = context();
  const stop = observeWindowState(ctx.app);
  await settle();
  expect(ctx.app.isMaximized).toBe(true);
  query.mockResolvedValue(false);
  ctx.resize();
  await settle();
  expect(ctx.app.isMaximized).toBe(false);
  query.mockResolvedValue(true);
  ctx.resize();
  await settle();
  expect(ctx.app.isMaximized).toBe(true);
  stop();
  expect(ctx.unlisten).toHaveBeenCalledTimes(1);
});

it('ignores stale state queries after a newer resize', async () => {
  let finishOldQuery!: (value: boolean) => void;
  const query = spyOn(api, 'winIsMaximized').mockImplementation(
    () => new Promise<boolean>((resolve) => { finishOldQuery = resolve; }),
  );
  const ctx = context();
  const stop = observeWindowState(ctx.app);
  await settle();
  query.mockResolvedValue(true);
  ctx.resize();
  await settle();
  finishOldQuery(false);
  await settle();
  expect(ctx.app.isMaximized).toBe(true);
  stop();
});

it('releases a resize subscription that finishes after teardown', async () => {
  const query = spyOn(api, 'winIsMaximized').mockResolvedValue(true);
  const ctx = context();
  const stop = observeWindowState(ctx.app);
  stop();
  await settle();
  expect(ctx.unlisten).toHaveBeenCalledTimes(1);
  expect(query).not.toHaveBeenCalled();
  expect(ctx.app.isMaximized).toBe(false);
});
