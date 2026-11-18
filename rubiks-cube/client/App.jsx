import React from 'react';
import { Icon, IconButton, useDomain, usePresenceValue } from '../../support/common.jsx';
import { createCubeScene } from './scene.js';

const COLORS = { U: '#f0eee6', D: '#f5c52d', F: '#17a577', B: '#257ce3', R: '#e64c46', L: '#f48c37' };
const NAMES = { U: '上', D: '下', F: '前', B: '后', L: '左', R: '右' };
const LESSONS = [
  { title: '认识转动', subtitle: '从最基本的一层开始', moves: ['R'], note: 'R 是右面顺时针 90°。方向从这一面的外侧观察。再次点击 R′，就能回到刚才的局面。' },
  { title: '右手公式', subtitle: '感受角块如何移动', moves: ['R', 'U', "R'", "U'"], note: '这是常用的四步基本动作。从复原状态开始，重复六次会回到起点。先观察右上前角块。' },
  { title: '左手公式', subtitle: '把动作换到另一侧', moves: ["L'", "U'", 'L', 'U'], note: '与右手动作互为镜像。注意先转左面，再转上面，最后原位返回。' },
  { title: '中层练习', subtitle: '直接拖动中间的一排', moves: ['M', 'E', 'S'], note: 'M 随左面、E 随下面、S 随前面转动。中层动作会移动中心块，请以当前六面为准。' },
];
function CubeViewport({ faces, onTurn, onError, sceneRef, locked }) {
  const container = React.useRef(null), handlers = React.useRef({ onTurn, onError });
  handlers.current = { onTurn, onError };
  React.useEffect(() => {
    try {
      const scene = createCubeScene(container.current, { onTurn: move => handlers.current.onTurn(move), onError: error => handlers.current.onError(error.message) });
      sceneRef.current = scene; scene.setFaces(faces);
      return () => { sceneRef.current = null; scene.dispose(); };
    } catch (error) { handlers.current.onError('无法初始化三维渲染：' + error.message); }
  }, []);
  React.useLayoutEffect(() => { sceneRef.current?.setFaces(faces); }, [faces]);
  return <div className="cube-viewport" style={{ pointerEvents: locked ? 'none' : undefined }} ref={container} data-testid="cube-viewport" />;
}
export function App() {
  const domain = useDomain('state.changed'), scene = React.useRef(null);
  const [tab, setTab] = React.useState('practice'), [lesson, setLesson] = React.useState(null);
  const [demonstrating, setDemonstrating] = React.useState(false);
  const lessonPresence = usePresenceValue(lesson);
  const run = React.useCallback((name, args) => domain.command(name, args), [domain.command]);
  const execute = (name, args) => void run(name, args).catch(() => {});
  async function demonstrate(moves) {
    if (demonstrating || domain.busy) return;
    setLesson(null); setDemonstrating(true);
    try {
      for (const move of moves) {
        await run('cube.move', { move });
        await new Promise(requestAnimationFrame);
        await scene.current?.whenIdle?.();
      }
    } catch { /* useDomain displays the actual error. */ }
    finally { setDemonstrating(false); }
  }
  React.useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && lesson) { event.preventDefault(); setLesson(null); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      const face = event.key.toUpperCase();
      if (!'UDLRFBMES'.includes(face) || face.length !== 1 || domain.busy || demonstrating) return;
      event.preventDefault(); execute('cube.move', { move: face + (event.shiftKey ? "'" : '') });
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [domain.busy, run, lesson, demonstrating]);
  if (!domain.snapshot) return <div className="loading">{domain.error || '正在打开练习室…'}</div>;
  const { state } = domain.snapshot;
  return <div className="cube-app">
    <header className="cube-header">
      <div className="cube-brand"><Icon name="cube" size={23} /><div><h1>一方之间</h1></div></div>
      <div className="cube-state"><span className={'state-point ' + (state.solved ? 'solved' : '')} /><span id="statusMain">{state.solved ? '六面同色' : '探索中'}</span><span className="move-count" id="moves">{state.moves} 步</span></div>
    </header>
    {domain.error ? <div className="error-banner" role="alert">{domain.error}</div> : null}
    <main className="cube-workspace">
      <section className="cube-playground" aria-label="魔方操作区">
        <div className="stage-caption"><span>03 × 03</span><IconButton icon="reset" label="还原观察视角" onClick={() => scene.current?.resetView()} /></div>
        <CubeViewport faces={state.faces} locked={demonstrating} sceneRef={scene} onTurn={move => run('cube.move', { move })} onError={domain.setError} />
        <div className="gesture-hint"><span><i />拖动色块转层</span><span>空白处拖动观察 · 滚轮缩放</span></div>
        <div className="cube-actions">
          <button type="button" className="primary-button" disabled={domain.busy || demonstrating} onClick={() => execute('cube.scramble', { steps: 20 })}><Icon name="shuffle" />打乱试试</button>
          <button type="button" className="soft-button" disabled={domain.busy || demonstrating || !state.moves} onClick={() => execute('cube.undo')}><Icon name="undo" />撤销</button>
          <button type="button" className="soft-button" disabled={domain.busy || demonstrating} onClick={() => execute('cube.reset')}><Icon name="reset" />重置练习</button>
        </div>
      </section>
      <aside className="cube-sidebar">
        <div className="segmented" role="group" aria-label="练习视图"><button aria-pressed={tab === 'practice'} onClick={() => setTab('practice')}>转动与公式</button><button aria-pressed={tab === 'faces'} onClick={() => setTab('faces')}>六面观察</button></div>
        {tab === 'practice' ? <div className="practice-view">
          <section><div className="section-label"><h2>每一次转动，都看得见</h2><span>Shift 反向</span></div><div className="turn-pad">
            {['U', 'D', 'L', 'R', 'F', 'B'].map(face => <div className="turn-pair" key={face}><span style={{ '--face-color': COLORS[face] }} /><div><button aria-label={face + ' 顺时针'} disabled={domain.busy || demonstrating} onClick={() => execute('cube.move', { move: face })}>{face}<small>{NAMES[face]}</small></button><button aria-label={face + ' 逆时针'} disabled={domain.busy || demonstrating} onClick={() => execute('cube.move', { move: face + "'" })}>{face}′</button></div></div>)}
          </div></section>
          <section className="lessons"><div className="section-label"><h2>慢一点，理解一个动作</h2><span>练习卡</span></div>{LESSONS.map(entry => <button type="button" key={entry.title} className="lesson-card" onClick={() => setLesson(entry)}><div><strong>{entry.title}</strong><small>{entry.subtitle}</small></div><span>{entry.moves.join(' ')}</span><Icon name="next" size={15} /></button>)}</section>
          <div className="ai-observation"><Icon name="info" /><p>AI 看到与你相同的六面局面。<br /><span>没有打乱过程，也没有原路倒放的答案。</span></p></div>
        </div> : <div className="face-observer"><div className="section-label"><h2>展开看，想清楚再转</h2></div><div className="cube-net">{['U', 'L', 'F', 'R', 'B', 'D'].map(face => <div className={'net-face net-' + face} key={face}><span>{face} · {NAMES[face]}</span><div>{state.faces[face].flat().map((color, index) => <i key={index} style={{ background: COLORS[color] }} title={face + ' ' + (Math.floor(index / 3) + 1) + ',' + (index % 3 + 1) + '：' + color} />)}</div></div>)}</div><p className="face-note">每面都从自己的外侧观察。换个视角不会改变记号；中层转动会改变中心颜色的位置。</p></div>}
      </aside>
    </main>
    {lessonPresence.value ? <div className="overlay mp-scrim" {...lessonPresence.presence.spread} onClick={event => event.target === event.currentTarget && setLesson(null)}><section className="drawer mp-panel" {...lessonPresence.presence.spread} role="dialog" aria-label={lessonPresence.value.title}><header><h2>{lessonPresence.value.title}</h2><IconButton icon="close" label="关闭练习卡" onClick={() => setLesson(null)} /></header><div className="formula">{lessonPresence.value.moves.map((move, i) => <span key={i}>{move}</span>)}</div><p className="lesson-description">{lessonPresence.value.note}</p><button type="button" className="primary-button" disabled={domain.busy || demonstrating} onClick={() => void demonstrate(lessonPresence.value.moves)}>演示这组动作</button><p className="lesson-footnote">演示会逐步转动当前魔方，可逐步撤销。</p></section></div> : null}
  </div>;
}
