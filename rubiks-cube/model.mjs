// 魔方领域模型。坐标系统一面板与领域共用（CSS 空间：x 右、y 下、z 朝观察者）：
// U=y-1、D=y+1、F=z+1、B=z-1、L=x-1、R=x+1。每个转动的旋转矩阵都按
// “从该面外侧看顺时针”推导，与标准魔方记号的层循环一致（R: U→B→D→F→U 等）。
const FACE_NORMALS = { U: [0, -1, 0], D: [0, 1, 0], F: [0, 0, 1], B: [0, 0, -1], L: [-1, 0, 0], R: [1, 0, 0] };
const AXIS_INDEX = { U: 1, D: 1, F: 2, B: 2, L: 0, R: 0 };
const MOVES = {
  R: { axis: 0, layer: 1, m: [[1, 0, 0], [0, 0, -1], [0, 1, 0]] },
  L: { axis: 0, layer: -1, m: [[1, 0, 0], [0, 0, 1], [0, -1, 0]] },
  U: { axis: 1, layer: -1, m: [[0, 0, -1], [0, 1, 0], [1, 0, 0]] },
  D: { axis: 1, layer: 1, m: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]] },
  F: { axis: 2, layer: 1, m: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] },
  B: { axis: 2, layer: -1, m: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] },
  M: { axis: 0, layer: 0, m: [[1, 0, 0], [0, 0, 1], [0, -1, 0]] },
  E: { axis: 1, layer: 0, m: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]] },
  S: { axis: 2, layer: 0, m: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] }
};
const FACE_BY_NORMAL = new Map(Object.entries(FACE_NORMALS).map(([face, normal]) => [normal.join(','), face]));

// 面内网格（从该面外侧看）：row 向下、col 向右。faceCell 为 pos→(row,col)，facePos 为其逆映射。
const FACE_CELL = {
  U: p => [p[2] + 1, p[0] + 1], D: p => [1 - p[2], p[0] + 1],
  F: p => [p[1] + 1, p[0] + 1], B: p => [p[1] + 1, 1 - p[0]],
  R: p => [p[1] + 1, 1 - p[2]], L: p => [p[1] + 1, p[2] + 1]
};
const FACE_POS = {
  U: (row, col) => [col - 1, -1, row - 1], D: (row, col) => [col - 1, 1, 1 - row],
  F: (row, col) => [col - 1, row - 1, 1], B: (row, col) => [1 - col, row - 1, -1],
  R: (row, col) => [1, row - 1, 1 - col], L: (row, col) => [-1, row - 1, col - 1]
};

function matApply(m, v) { return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]]; }
function matTranspose(m) { return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]; }

const MOVE_TOKEN = /^([UDLRFBMES])(2|')?$/;
function parseMove(token) {
  if (typeof token !== 'string') throw new Error('无效的转动记号');
  const match = MOVE_TOKEN.exec(token.trim());
  if (!match) throw new Error(`无效的转动记号：${token}`);
  return { face: match[1], turns: match[2] === '2' ? 2 : match[2] === "'" ? 3 : 1 };
}
function tokenFor(face, turns) { return turns === 1 ? face : turns === 2 ? `${face}2` : `${face}'`; }
function inverseToken(token) { const { face, turns } = parseMove(token); return tokenFor(face, 4 - turns); }

function initialStickers() {
  const stickers = [];
  for (const [face, normal] of Object.entries(FACE_NORMALS)) {
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) stickers.push({ pos: FACE_POS[face](row, col), normal, color: face });
  }
  return stickers;
}
function rotateLayer(stickers, face, turns) {
  const move = MOVES[face];
  const matrices = turns === 3 ? [matTranspose(move.m)] : turns === 2 ? [move.m, move.m] : [move.m];
  for (const sticker of stickers) {
    if (sticker.pos[move.axis] !== move.layer) continue;
    for (const m of matrices) { sticker.pos = matApply(m, sticker.pos); sticker.normal = matApply(m, sticker.normal); }
  }
}
function buildFaces(stickers) {
  const faces = {};
  for (const face of Object.keys(FACE_NORMALS)) faces[face] = [['', '', ''], ['', '', ''], ['', '', '']];
  for (const sticker of stickers) {
    const face = FACE_BY_NORMAL.get(sticker.normal.join(','));
    if (!face) throw new Error('魔方贴纸法线不合法');
    const [row, col] = FACE_CELL[face](sticker.pos);
    faces[face][row][col] = sticker.color;
  }
  return faces;
}
function isSolved(stickers) { return Object.values(buildFaces(stickers)).every(face => face.flat().every(color => color === face[1][1])); }


const TURN_DEGREES = { R: 90, L: -90, U: -90, D: 90, F: 90, B: -90, M: -90, E: 90, S: 90 };
const FACE_FOR_LAYER = [['L', 'M', 'R'], ['U', 'E', 'D'], ['B', 'S', 'F']];
function stickersFromFaces(faces) {
  return initialStickers().map(sticker => {
    const face = FACE_BY_NORMAL.get(sticker.normal.join(','));
    const cell = FACE_CELL[face](sticker.pos);
    return { ...sticker, color: faces[face][cell[0]][cell[1]] };
  });
}
function transitionMove(before, after) {
  for (const face of Object.keys(MOVES)) for (const turns of [1, 3, 2]) {
    const stickers = stickersFromFaces(before);
    rotateLayer(stickers, face, turns);
    if (JSON.stringify(buildFaces(stickers)) === JSON.stringify(after)) return tokenFor(face, turns);
  }
  return null;
}
function chooseDrag(candidates, dx, dy) {
  return candidates.map(candidate => {
    const length = Math.hypot(...candidate.tangent);
    const amount = length ? (candidate.tangent[0] * dx + candidate.tangent[1] * dy) / length : 0;
    return { ...candidate, amount };
  }).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] ?? null;
}
export { FACE_NORMALS, FACE_CELL, FACE_POS, FACE_BY_NORMAL, MOVES, TURN_DEGREES, FACE_FOR_LAYER, parseMove, tokenFor, inverseToken, initialStickers, rotateLayer, buildFaces, isSolved, stickersFromFaces, transitionMove, chooseDrag };
