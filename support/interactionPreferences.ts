/** Window-local interaction settings. They apply immediately and never enter AppConfig drafts. */
import { useSyncExternalStore } from 'react';

export type ScrollFeel = 'native' | 'crisp' | 'soft';
export interface InteractionPreferences {
  scrollFeel: ScrollFeel;
  /** Only enhanced wheel scrolling consumes this multiplier; native scrolling stays untouched. */
  scrollDistance: number;
  motion: 'system' | 'subtle' | 'reduced';
}

const STORAGE_KEY = 'muster.interaction.v1';
const defaults: InteractionPreferences = Object.freeze({
  scrollFeel: 'native', scrollDistance: 1, motion: 'system'
});
let current = defaults;
let media: MediaQueryList | null = null;
let stop: (() => void) | null = null;
const listeners = new Set<() => void>();

function normalize(value: unknown, fallback = defaults): InteractionPreferences {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<InteractionPreferences> : {};
  return Object.freeze({
    scrollFeel: source.scrollFeel === 'native' || source.scrollFeel === 'crisp' || source.scrollFeel === 'soft'
      ? source.scrollFeel : fallback.scrollFeel,
    scrollDistance: typeof source.scrollDistance === 'number' && Number.isFinite(source.scrollDistance)
      ? Math.min(2, Math.max(0.5, source.scrollDistance)) : fallback.scrollDistance,
    motion: source.motion === 'system' || source.motion === 'subtle' || source.motion === 'reduced'
      ? source.motion : fallback.motion
  });
}

function readStored(raw: string | null): InteractionPreferences {
  try { return normalize(raw == null ? null : JSON.parse(raw)); }
  catch { return defaults; }
}

function applyToDom(): void {
  if (typeof document !== 'undefined') {
    // Store the effective mode so user reduction and OS reduction share the same CSS path.
    document.documentElement.dataset.uiMotion = current.motion === 'reduced' || media?.matches
      ? 'reduced' : current.motion;
  }
}

function emit(): void {
  applyToDom();
  for (const listener of listeners) listener();
}

function apply(next: InteractionPreferences): void {
  if (current.scrollFeel === next.scrollFeel && current.scrollDistance === next.scrollDistance && current.motion === next.motion) {
    applyToDom();
    return;
  }
  current = next;
  emit();
}

/** Called before React mounts; also lazy-initialized by the public getters for component fixtures. */
export function initInteractionPreferences(): () => void {
  if (stop) return stop;
  if (typeof window === 'undefined') return () => {};
  try { current = readStored(window.localStorage.getItem(STORAGE_KEY)); }
  catch { current = defaults; }
  media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onMedia = (): void => emit();
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    // A sessionStorage event must not overwrite a local preference.
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
    catch { return; }
    apply(readStored(event.key === null ? null : event.newValue));
  };
  window.addEventListener('storage', onStorage);
  if (media?.addEventListener) media.addEventListener('change', onMedia);
  else media?.addListener(onMedia);
  const subscribedMedia = media;
  const dispose = (): void => {
    if (stop !== dispose) return;
    window.removeEventListener('storage', onStorage);
    if (subscribedMedia?.removeEventListener) subscribedMedia.removeEventListener('change', onMedia);
    else subscribedMedia?.removeListener(onMedia);
    media = null;
    stop = null;
  };
  stop = dispose;
  applyToDom();
  return dispose;
}

export function getInteractionPreferences(): InteractionPreferences {
  initInteractionPreferences();
  return current;
}

export function subscribeInteractionPreferences(listener: () => void): () => void {
  initInteractionPreferences();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useInteractionPreferences(): InteractionPreferences {
  return useSyncExternalStore(subscribeInteractionPreferences, getInteractionPreferences, () => defaults);
}

export function setInteractionPreferences(patch: Partial<InteractionPreferences>): void {
  initInteractionPreferences();
  apply(normalize(patch, current));
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); }
  catch { /* Storage can be unavailable; keep the immediate window-local preference. */ }
}

/** System reduction always wins, including when the user has selected subtle motion. */
export function prefersReducedMotionPreference(): boolean {
  initInteractionPreferences();
  return current.motion === 'reduced' || media?.matches === true;
}
