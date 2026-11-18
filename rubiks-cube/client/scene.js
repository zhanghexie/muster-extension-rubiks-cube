import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FACE_NORMALS, FACE_CELL, FACE_FOR_LAYER, MOVES, TURN_DEGREES, parseMove, transitionMove, chooseDrag } from '../model.mjs';
import { MOTION, prefersReducedMotion } from '../../support/common.jsx';
import { createTurnAnimationGate } from './turn-animation.js';

const COLORS = { U: '#f0eee6', D: '#f5c52d', F: '#17a577', B: '#257ce3', R: '#e64c46', L: '#f48c37' };
const normal = vector => new THREE.Vector3(vector[0], -vector[1], vector[2]);
const worldAngle = face => TURN_DEGREES[face] * [-1, 1, -1][MOVES[face].axis] * Math.PI / 180;
const axisVector = axis => new THREE.Vector3(...[0, 1, 2].map(index => index === axis ? 1 : 0));

// The scene renders on demand. Orbit/turn gestures never create an idle render loop.
export function createCubeScene(container, { onTurn, onError, onInteraction } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.setAttribute('aria-label', '三维魔方：拖动色块转层，拖动空白旋转视角');
  renderer.domElement.tabIndex = 0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .1, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .65;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x343a48, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-4, 7, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -5; key.shadow.camera.right = 5;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; key.shadow.bias = -.001;
  key.shadow.radius = 5; key.shadow.blurSamples = 8;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd3e2ff, .8); fill.position.set(5, 2, -3); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: .12 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.49; floor.receiveShadow = true; scene.add(floor);
  const cube = new THREE.Group(); cube.position.y = .12; scene.add(cube);
  const shell = new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: .42, metalness: .015, envMapIntensity: .4 });
  const stickerMaterials = Object.fromEntries(Object.entries(COLORS).map(([face, color]) => [face, new THREE.MeshPhysicalMaterial({ color, roughness: .32, metalness: 0, clearcoat: .25, clearcoatRoughness: .38, envMapIntensity: .6 })]));
  const bodyGeometry = new RoundedBoxGeometry(.962, .962, .962, 3, .095);
  const shape = new THREE.Shape(), edge = .4, radius = .075;
  shape.moveTo(-edge + radius, -edge); shape.lineTo(edge - radius, -edge);
  shape.quadraticCurveTo(edge, -edge, edge, -edge + radius); shape.lineTo(edge, edge - radius);
  shape.quadraticCurveTo(edge, edge, edge - radius, edge); shape.lineTo(-edge + radius, edge);
  shape.quadraticCurveTo(-edge, edge, -edge, edge - radius); shape.lineTo(-edge, -edge + radius);
  shape.quadraticCurveTo(-edge, -edge, -edge + radius, -edge);
  const stickerGeometry = new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .006, bevelThickness: .006, curveSegments: 6 });
  stickerGeometry.translate(0, 0, -.009);
  const cubies = [], tiles = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const pos = [x, y, z], group = new THREE.Group(); group.position.copy(normal(pos));
    const body = new THREE.Mesh(bodyGeometry, shell); body.castShadow = true; body.receiveShadow = true; group.add(body);
    for (const [face, direction] of Object.entries(FACE_NORMALS)) {
      const axis = direction.findIndex(value => value !== 0);
      if (pos[axis] !== direction[axis]) continue;
      const tile = new THREE.Mesh(stickerGeometry, stickerMaterials[face]);
      const outward = normal(direction);
      tile.position.copy(outward).multiplyScalar(.484);
      tile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
      tile.castShadow = true; tile.receiveShadow = true;
      tile.userData = { pos, normal: direction, face };
      group.add(tile); tiles.push(tile);
    }
    group.userData.pos = pos; cube.add(group); cubies.push(group);
  }
  let disposed = false, faces, gesture = null, active = null, committing = false, animation = 0, finishAnimation = null;
  const turnGate = createTurnAnimationGate();
  let idle = Promise.resolve();
  let yaw = .67, pitch = .47, distance = 10.6;
  const render = () => { if (!disposed) renderer.render(scene, camera); };
  function orbit() {
    camera.position.set(distance * Math.cos(pitch) * Math.sin(yaw), distance * Math.sin(pitch), distance * Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(0, .1, 0); camera.updateMatrixWorld(); render();
  }
  function resize() {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.fov = width < 500 ? 40 : 34; camera.updateProjectionMatrix(); orbit();
  }
  function paint() {
    if (!faces) return;
    for (const tile of tiles) {
      const { face, pos } = tile.userData, [row, col] = FACE_CELL[face](pos);
      tile.material = stickerMaterials[faces[face][row][col]];
    }
    render();
  }
  function resetLayer() {
    cancelAnimationFrame(animation); animation = 0;
    const finish = finishAnimation; finishAnimation = null; finish?.();
    renderer.domElement.setAttribute('aria-busy', 'false');
    if (!active) return;
    for (const cubie of active.cubies) { cube.add(cubie); cubie.position.copy(normal(cubie.userData.pos)); cubie.quaternion.identity(); }
    cube.remove(active.group); active = null; paint();
  }
  function startLayer(face) {
    resetLayer();
    const group = new THREE.Group(), move = MOVES[face];
    const selected = cubies.filter(cubie => cubie.userData.pos[move.axis] === move.layer);
    cube.add(group); for (const cubie of selected) group.attach(cubie);
    active = { group, face, cubies: selected, fraction: 0 };
  }
  function preview(fraction) {
    if (!active) return;
    active.fraction = fraction;
    active.group.quaternion.setFromAxisAngle(axisVector(MOVES[active.face].axis), worldAngle(active.face) * fraction);
    render();
  }
  // Bezier controls come from the host token, including custom motion settings.
  function ease(value) {
    const numbers = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').match(/[\d.]+/g)?.map(Number);
    if (!numbers || numbers.length !== 4) return value;
    const [x1, y1, x2, y2] = numbers;
    const coordinate = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; coordinate(mid, x1, x2) < value ? lo = mid : hi = mid; }
    return coordinate((lo + hi) / 2, y1, y2);
  }
  function settle(to) {
    if (!active) return Promise.resolve();
    const from = active.fraction, start = performance.now();
    if (prefersReducedMotion()) { preview(to); return Promise.resolve(); }
    return new Promise(resolve => {
      finishAnimation = resolve; renderer.domElement.setAttribute('aria-busy', 'true');
      const tick = now => {
        if (disposed || !active) { animation = 0; finishAnimation = null; renderer.domElement.setAttribute('aria-busy', 'false'); resolve(); return; }
        const ratio = Math.min(1, (now - start) / MOTION.panelMs);
        preview(from + (to - from) * ease(ratio));
        if (ratio < 1) animation = requestAnimationFrame(tick); else { animation = 0; finishAnimation = null; renderer.domElement.setAttribute('aria-busy', 'false'); resolve(); }
      };
      animation = requestAnimationFrame(tick);
    });
  }
  function setFaces(next) {
    if (faces && JSON.stringify(faces) === JSON.stringify(next)) return;
    const previous = faces; faces = structuredClone(next);
    const updateKind = turnGate.onFacesUpdate();
    if (committing) return;
    if (updateKind === 'local') { resetLayer(); paint(); return; }
    // External Agent commands animate from face-state comparison, never from history.
    const token = previous && !active && transitionMove(previous, next);
    if (token) {
      const { face, turns } = parseMove(token); startLayer(face);
      idle = settle(turns === 3 ? -1 : turns).then(resetLayer);
    } else { resetLayer(); paint(); }
  }
  const raycaster = new THREE.Raycaster();
  function hitAt(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    return raycaster.intersectObjects(tiles, false)[0];
  }
  function candidates(hit) {
    const data = hit.object.userData, blocked = data.normal.findIndex(value => value !== 0);
    return [0, 1, 2].filter(axis => axis !== blocked).map(axis => {
      const face = FACE_FOR_LAYER[axis][data.pos[axis] + 1], origin = hit.point.clone().sub(cube.position);
      const before = hit.point.clone().project(camera), after = origin.applyAxisAngle(axisVector(axis), worldAngle(face) * .01).add(cube.position).project(camera);
      return { face, tangent: [(after.x - before.x) * container.clientWidth, -(after.y - before.y) * container.clientHeight] };
    });
  }
  function down(event) {
    if (event.button !== 0 || committing || animation) return;
    renderer.domElement.focus(); renderer.domElement.setPointerCapture(event.pointerId);
    const hit = hitAt(event);
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, candidates: hit && !event.altKey ? candidates(hit) : null, chosen: null };
    onInteraction?.();
  }
  function move(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (gesture.candidates) {
      if (!gesture.chosen && Math.hypot(dx, dy) > 7) {
        gesture.chosen = chooseDrag(gesture.candidates, dx, dy); startLayer(gesture.chosen.face);
      }
      if (gesture.chosen) {
        const { tangent } = gesture.chosen, length = Math.hypot(...tangent);
        preview(Math.max(-1.1, Math.min(1.1, (tangent[0] * dx + tangent[1] * dy) / length / 94)));
      }
    } else {
      yaw = gesture.yaw - dx * .008; pitch = Math.max(-1.2, Math.min(1.2, gesture.pitch + dy * .007)); orbit();
    }
  }
  async function finish(event, cancelled = false) {
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture = null;
    if (!active) return;
    const fraction = active.fraction, face = active.face;
    committing = true;
    let committed = false;
    try {
      if (cancelled || Math.abs(fraction) < .23) await settle(0);
      else {
        await settle(Math.sign(fraction));
        turnGate.beginLocalCommit();
        await onTurn(face + (fraction < 0 ? "'" : ''));
        committed = true;
      }
    } catch (error) { onError?.(error); }
    finally { committing = false; turnGate.endLocalCommit(committed); resetLayer(); }
  }
  const up = event => void finish(event);
  const cancel = event => void finish(event, true);
  const wheel = event => { event.preventDefault(); distance = Math.max(7.8, Math.min(15, distance + event.deltaY * .006)); orbit(); };
  const lost = event => { event.preventDefault(); onError?.(new Error('三维渲染上下文已丢失，请重载扩展')); };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('webglcontextlost', lost);
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  return {
    setFaces,
    whenIdle() { return idle; },
    resetView() { yaw = .67; pitch = .47; distance = 10.6; orbit(); },
    // Projected tile centers are useful for accessibility overlays and real gesture tests.
    targets() { return tiles.map(tile => { const point = tile.getWorldPosition(new THREE.Vector3()).project(camera); return { ...tile.userData, x: (point.x + 1) / 2 * container.clientWidth, y: (1 - point.y) / 2 * container.clientHeight }; }); },
    dispose() {
      disposed = true; resetLayer(); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('webglcontextlost', lost);
      bodyGeometry.dispose(); stickerGeometry.dispose(); shell.dispose(); Object.values(stickerMaterials).forEach(material => material.dispose());
      floor.geometry.dispose(); floor.material.dispose(); environment.dispose(); key.shadow.dispose(); renderer.dispose(); canvas.remove();
    }
  };
}
