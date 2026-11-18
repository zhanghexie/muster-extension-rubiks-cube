import { initialStickers, rotateLayer, buildFaces, isSolved, parseMove, tokenFor } from './model.mjs';

const COMMANDS = ['cube.move', 'cube.sequence', 'cube.scramble', 'cube.reset', 'cube.undo'];
const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];

/** Only the present facelets cross the Agent boundary. Undo snapshots stay private. */
export function createDomainRuntime({ identity = {} } = {}) {
  let version = 0, moves = 0, stickers = initialStickers();
  const undo = [], listeners = new Set();
  const view = () => ({ faces: buildFaces(stickers), moves, solved: isSolved(stickers) });
  const remember = () => { undo.push({ stickers: structuredClone(stickers), moves }); if (undo.length > 80) undo.shift(); };
  const apply = token => { const parsed = parseMove(token); rotateLayer(stickers, parsed.face, parsed.turns); moves++; };
  return {
    async getSnapshot() { return { version, state: view(), availableCommands: COMMANDS, capturedAt: new Date().toISOString() }; },
    async query(name) {
      if (name === 'cube.state') return { version, state: view() };
      if (name === 'cube.analyze') {
        const faces = buildFaces(stickers);
        return { solved: isSolved(stickers), faces: Object.fromEntries(Object.entries(faces).map(([face, grid]) => [face, { center: grid[1][1], matched: grid.flat().filter(color => color === grid[1][1]).length }])) };
      }
      throw new Error('未知魔方查询：' + name);
    },
    async execute(name, args = {}, context = {}) {
      if (context.signal?.aborted) throw new DOMException('已取消', 'AbortError');
      if (name === 'cube.move' || name === 'cube.sequence') {
        const tokens = name === 'cube.move' ? [args.move] : args.moves;
        if (!Array.isArray(tokens) || !tokens.length || tokens.length > 40) throw new Error('需要 1–40 个合法转动记号');
        // Validate the entire sequence before touching state.
        const parsed = tokens.map(parseMove);
        remember(); parsed.forEach(({ face, turns }) => apply(tokenFor(face, turns)));
      } else if (name === 'cube.scramble') {
        const steps = args.steps ?? 20;
        if (!Number.isInteger(steps) || steps < 1 || steps > 40) throw new Error('打乱步数必须在 1–40 之间');
        remember(); let previous = '';
        for (let i = 0; i < steps; i++) {
          let face;
          do { face = FACES[Math.floor(Math.random() * FACES.length)]; } while (face === previous);
          apply(tokenFor(face, [1, 2, 3][Math.floor(Math.random() * 3)])); previous = face;
        }
      } else if (name === 'cube.reset') {
        remember(); stickers = initialStickers(); moves = 0;
      } else if (name === 'cube.undo') {
        if (context.actor === 'agent') throw new Error('撤销仅供人的面板操作；AI 请根据当前六面推理');
        const previous = undo.pop();
        if (!previous) throw new Error('没有可撤销的操作');
        stickers = previous.stickers; moves = previous.moves;
      } else throw new Error('未知魔方命令：' + name);
      version++;
      const actor = context.actor === 'agent' ? 'agent' : 'human';
      listeners.forEach(listener => listener({ type: 'state.changed', ...identity, version, actor, requestId: context.requestId ?? 'cube', payload: {} }));
      return { ok: true, version, result: view() };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { listeners.clear(); undo.length = 0; }
  };
}
