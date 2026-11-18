import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
// @ts-expect-error Bundled extension source intentionally uses JSX.
import { App as CubeApp } from '../rubiks-cube/client/App.jsx';
// @ts-expect-error Plain JavaScript domain is also shipped to the worker.
import { createDomainRuntime as cubeRuntime } from '../rubiks-cube/domain.mjs';
// @ts-expect-error Plain JavaScript turn-animation gate also ships to the extension client.
import { createTurnAnimationGate } from '../rubiks-cube/client/turn-animation.js';

const scene = vi.hoisted(() => ({ turn: null as null | ((move: string) => Promise<unknown>), setFaces: vi.fn(), dispose: vi.fn() }));
vi.mock('../rubiks-cube/client/scene.js', () => ({ createCubeScene: (_container: unknown, handlers: { onTurn: (move: string) => Promise<unknown> }) => { scene.turn = handlers.onTurn; return { setFaces: scene.setFaces, resetView: vi.fn(), dispose: scene.dispose }; } }));
function bridge(runtime: any) {
  (window as any).ma = { ready: Promise.resolve(), on: (type: string, callback: (event: unknown) => void) => runtime.subscribe((event: any) => { if (event.type === type) callback(event); }), agent: { domain: { snapshot: () => runtime.getSnapshot(), query: (name: string, args: unknown) => runtime.query(name, args), command: (name: string, args: unknown) => runtime.execute(name, args, { actor: 'human' }) } } };
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
}
it('connects cube drag commands, keyboard inversion, lessons, undo and the six-face view', async () => {
  const runtime = cubeRuntime(); bridge(runtime);
  const view = render(<CubeApp />);
  try {
    await screen.findByText('六面同色');
    await act(async () => { await scene.turn?.('R'); });
    await screen.findByText('1 步');
    fireEvent.keyDown(window, { key: 'R', shiftKey: true });
    await waitFor(() => expect((view.container.querySelector('#moves') as HTMLElement).textContent).toBe('2 步'));
    await screen.findByText('六面同色');
    fireEvent.click(screen.getByRole('button', { name: '六面观察' }));
    expect(view.container.querySelectorAll('.net-face i')).toHaveLength(54);
    fireEvent.click(screen.getByRole('button', { name: '转动与公式' }));
    fireEvent.click(screen.getByRole('button', { name: /右手公式/ }));
    const dialog = await screen.findByRole('dialog', { name: '右手公式' });
    fireEvent.click(within(dialog).getByRole('button', { name: '演示这组动作' }));
    await waitFor(() => expect((view.container.querySelector('#moves') as HTMLElement).textContent).toBe('6 步'));
    await waitFor(() => expect(screen.getByRole('button', { name: '撤销' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect((view.container.querySelector('#moves') as HTMLElement).textContent).toBe('5 步'));
  } finally { view.unmount(); await runtime.close(); }
});
it('does not replay a local cube drag from a fixed zero angle after the domain event', () => {
  const gate = createTurnAnimationGate();
  gate.beginLocalCommit();
  expect(gate.onFacesUpdate()).toBe('local');
  gate.endLocalCommit(true);
  expect(gate.onFacesUpdate()).toBe('external');
  gate.beginLocalCommit();
  gate.endLocalCommit(false);
  expect(gate.onFacesUpdate()).toBe('external');
  gate.beginLocalCommit();
  gate.endLocalCommit(true);
  expect(gate.onFacesUpdate()).toBe('local');
  expect(gate.onFacesUpdate()).toBe('external');
});
