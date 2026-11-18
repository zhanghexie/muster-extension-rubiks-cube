import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repo, 'rubiks-cube');
const { createDomainRuntime } = await import(pathToFileURL(path.join(packageRoot, 'domain.mjs')).href);

function make() {
  const events = [];
  const runtime = createDomainRuntime({ identity: { extensionId: 'rubiks-cube', extensionInstanceId: 'test', workspaceId: 'ws' } });
  runtime.subscribe(event => events.push(event));
  return { runtime, events };
}
const faces = snapshot => snapshot.state.faces;

// Every move is reversible, including middle slices, and conserves 54 facelets.
for (const face of 'UDLRFBMES') {
  const { runtime } = make();
  const original = faces(await runtime.getSnapshot());
  await runtime.execute('cube.move',{move:face});
  const colors = Object.values(faces(await runtime.getSnapshot())).flat(2);
  assert.equal(colors.length,54);
  for(const color of 'UDLRFB') assert.equal(colors.filter(item=>item===color).length,9);
  await runtime.execute('cube.move',{move:face+"'"});
  assert.deepEqual(faces(await runtime.getSnapshot()),original);
  await runtime.execute('cube.sequence',{moves:[face,face,face,face]});
  assert.deepEqual(faces(await runtime.getSnapshot()),original);
}
{
  const { runtime, events } = make();
  const initial = await runtime.getSnapshot();
  await assert.rejects(()=>runtime.execute('cube.sequence',{moves:['R','bad']}),/无效/);
  assert.deepEqual((await runtime.getSnapshot()).state,initial.state);
  assert.equal((await runtime.getSnapshot()).version,initial.version);
  await runtime.execute('cube.sequence',{moves:['R','U']},{actor:'human'});
  for(const value of [await runtime.getSnapshot(),await runtime.query('cube.state'),await runtime.query('cube.analyze'),...events]) {
    assert.doesNotMatch(JSON.stringify(value),/"(?:history|actors|lastMove|lastActor|next|solution)"/,'Agent-readable state must never reveal the move trail');
  }
  await assert.rejects(()=>runtime.query('cube.hint'),/未知/);
  await assert.rejects(()=>runtime.execute('cube.undo',{}, {actor:'agent'}),/仅供/);
  assert.equal((await runtime.getSnapshot()).state.moves,2);
  await runtime.execute('cube.undo',{}, {actor:'human'});
  assert.equal((await runtime.getSnapshot()).state.solved,true,'human undo restores the previous action atomically');
  await runtime.execute('cube.scramble',{steps:20});
  assert.equal((await runtime.getSnapshot()).state.moves,20);
  await runtime.execute('cube.reset');assert.equal((await runtime.getSnapshot()).state.solved,true);
}
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'extension.json'), 'utf8'));
assert.equal(manifest.surface.kind, 'sidebar');
assert.deepEqual(manifest.domain.commands, ['cube.move', 'cube.sequence', 'cube.scramble', 'cube.reset', 'cube.undo']);
