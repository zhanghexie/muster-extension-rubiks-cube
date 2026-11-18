import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  prefersReducedMotionPreference,
  subscribeInteractionPreferences
} from '../interactionPreferences';

/**
 * 动画系统 JS 侧（CSS 骨架见 base.css 末段，调研与决策见
 * docs/audits/animation-system-research.md）。
 *
 * 核心约定：进出场一律 CSS transition（非 keyframes）——transition 改目标值
 * 即从当前插值位置续走，「退场中途重开」直接回弹到入场目标，天然可打断。
 */

/** 与 base.css --dur-* 对齐的 JS 侧常量：presence 卸载兜底等无法读 CSS 的场合用。
 *  改值须同步 base.css（test/motion-token-sync.mjs 守）。 */
export const MOTION = {
  microMs: 120,
  menuMs: 160,
  panelMs: 280,
  exitMs: 200,
  moveMs: 420,
  workspaceMs: 360,
  workspacefadeMs: 160,
  staggerMs: 30 /* 级联步长（逐层/逐项延迟） */,
  loopMs: 900 /* 对齐 base.css --dur-loop（循环装饰；presence 不消费） */,
  breathMs: 1800 /* 对齐 base.css --dur-breath（呼吸/起伏类循环装饰） */
} as const;

/** 减弱动态：CSS 侧由 base.css 全局兜底，JS 侧的 sleep/兜底计时须自行读它跳过空等 */
export function prefersReducedMotion(): boolean {
  return prefersReducedMotionPreference();
}

/**
 * 运行态 spinner 相位：CSS 循环动画各自从挂载时刻 t=0 起表，后出现的会永久错开。
 * 负 animation-delay = 已转过的相位，使 progress ≡ now % period，与挂载早晚无关。
 * 禁止用拉长 --dur-loop 掩盖错位。后台节流暂停后再挂新 spinner 可能再偏一次，属已知边界。
 */
export function spinnerPhaseDelayMs(nowMs = performance.now(), periodMs = MOTION.loopMs): number {
  return -(nowMs % periodMs);
}

export type PresenceStage = 'enter' | 'in' | 'out';

export interface Presence {
  /** 是否渲染（退场动画播完才 false） */
  mounted: boolean;
  /** 写到容器 data-mp-stage；CSS 按 mp-* 类 + stage 三态给起始/目标态 */
  stage: PresenceStage;
  spread: { 'data-mp-stage': PresenceStage };
}

interface PresenceState {
  mounted: boolean;
  stage: PresenceStage;
}

/** 强制一次样式计算：让刚提交的 enter 起始态先成为「已计算样式」，随后切 in 才会起播 transition */
function flushStyles(): void {
  if (typeof document !== 'undefined') void document.body?.offsetWidth;
}

/**
 * 进出场在场管理：open 驱动挂载与延迟卸载。
 * - open=true：挂载且 stage='enter'（CSS 起始态），同一次提交的 layout 阶段强制样式计算后
 *   切 'in'——首帧即起播，不空等定时器（首挂载 open 即 true 同样走 enter→in，
 *   供菜单类「挂载即入场」组件复用）；
 * - open=false：stage='out' 播退场，exitMs（+80ms 兜底余量）后卸载；
 * - out 期间 open 回真：取消卸载、stage 直接回 'in'——transition 从当前位置
 *   回弹，不重播不跳变（可打断要求的核心路径）。
 */
export function usePresence(open: boolean, exitMs: number = MOTION.exitMs): Presence {
  const reduced = useSyncExternalStore(
    subscribeInteractionPreferences, prefersReducedMotionPreference, () => false
  );
  const [state, setState] = useState<PresenceState>({ mounted: open, stage: 'enter' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(open);
  openRef.current = open;
  const unmountTimerRef = useRef<number | null>(null);

  const clearUnmount = (): void => {
    if (unmountTimerRef.current != null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  };

  useLayoutEffect(() => {
    if (reduced) {
      clearUnmount();
      const nextStage = open ? 'in' : 'enter';
      if (stateRef.current.mounted !== open || stateRef.current.stage !== nextStage) {
        setState({ mounted: open, stage: nextStage });
      }
      return;
    }
    if (open) {
      clearUnmount();
      const cur = stateRef.current;
      if (!cur.mounted) setState({ mounted: true, stage: 'enter' });
      // 退场中重开：从当前插值位置回弹
      else if (cur.stage === 'out') setState({ mounted: true, stage: 'in' });
      return;
    }
    if (!stateRef.current.mounted) return;
    setState({ mounted: true, stage: 'out' });
    unmountTimerRef.current = window.setTimeout(() => {
      unmountTimerRef.current = null;
      setState({ mounted: false, stage: 'enter' });
    }, exitMs + 80);
    return clearUnmount;
  }, [open, exitMs, reduced]);

  // enter 起始态已提交到 DOM：先落成计算样式再切 in（paint 前完成，不闪起始帧）
  useLayoutEffect(() => {
    if (!state.mounted || state.stage !== 'enter' || !openRef.current) return;
    if (!reduced) flushStyles();
    setState((s) => (s.mounted && s.stage === 'enter' ? { mounted: true, stage: 'in' } : s));
  }, [state.mounted, state.stage, reduced]);

  useEffect(() => clearUnmount, []);

  return {
    mounted: state.mounted,
    stage: state.stage,
    spread: { 'data-mp-stage': state.stage }
  };
}

/**
 * 值驱动的在场管理：value 非空即打开；关闭（转空）时冻结最后一个非空值供退场期渲染，
 * 免得退场动画期内容闪空。队列换值（非空→非空）直接换内容不过场。
 */
export function usePresenceValue<T>(
  value: T | null | undefined,
  exitMs?: number
): { presence: Presence; value: T | null } {
  const presence = usePresence(value != null, exitMs);
  const snapRef = useRef<T | null>(value ?? null);
  if (value != null) snapRef.current = value;
  else if (!presence.mounted) snapRef.current = null;
  return { presence, value: value ?? (presence.mounted ? snapRef.current : null) };
}
