import React from 'react';
export { usePresence, usePresenceValue, MOTION, prefersReducedMotion } from './components/motion';

const paths = {
  back: 'm14 6-6 6 6 6', next: 'm10 6 6 6-6 6',
  book: 'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 5v15',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M16 16l4 4',
  bookmark: 'M6 4h12v17l-6-4-6 4z',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  tune: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  shuffle: 'M4 5h3l10 14h3M4 19h3L17 5h3M17 2l3 3-3 3M17 16l3 3-3 3',
  undo: 'm8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3',
  cube: 'M12 2 21 7v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  info: 'M12 11v6M12 7h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  pin: 'M8 3h8l-1 7 3 3v2H6v-2l3-3zM12 15v7',
};
export function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.book} /></svg>;
}
export function IconButton({ icon, label, ...props }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon} /></button>;
}
export function useDomain(event) {
  const [snapshot, setSnapshot] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    const next = await window.ma.agent.domain.snapshot();
    setSnapshot(previous => !previous || next.version >= previous.version ? next : previous);
    return next;
  }, []);
  React.useEffect(() => {
    let alive = true;
    window.ma.ready.then(() => alive && refresh()).catch(error => alive && setError(error.message));
    const stop = window.ma.on(event, () => refresh().catch(error => alive && setError(error.message)));
    return () => { alive = false; stop(); };
  }, [event, refresh]);
  const command = React.useCallback(async (name, args = {}) => {
    setBusy(true); setError('');
    try { const result = await window.ma.agent.domain.command(name, args); await refresh(); return result.result; }
    catch (error) { setError(error.message); throw error; }
    finally { setBusy(false); }
  }, [refresh]);
  return { snapshot, refresh, command, busy, error, setError };
}
