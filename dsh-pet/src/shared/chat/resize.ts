import { CHAT_H_PAD, CHAT_MAX_W, CHAT_MIN_W } from './styles.ts';

const CHAT_MIN_H = 96;
const KEY_RESIZE_STEP_PX = 16;

type ResizeAxis = 'width' | 'height' | 'both';

/** 聊天框尺寸驱动：文字自动尺寸与对应方向的手动调整互斥，手动优先。 */
export interface ChatResizeDriver {
  readonly resizeInput: () => void;
  readonly dispose: () => void;
}

/** 三个拉伸方向各自的可聚焦手柄。 */
export interface ChatResizeHandles {
  readonly right: HTMLElement;
  readonly bottom: HTMLElement;
  readonly corner: HTMLElement;
}

interface ActiveResize {
  readonly pointerId: number;
  readonly axis: ResizeAxis;
  readonly handle: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly startWidth: number;
  readonly startHeight: number;
}

/** 把拖动目标宽度夹到允许区间。 */
export function clampChatWidth(width: number, maxWidth: number): number {
  return Math.max(CHAT_MIN_W, Math.min(Math.ceil(width), Math.max(CHAT_MIN_W, maxWidth)));
}

/** 把拖动目标高度夹到允许区间。 */
export function clampChatHeight(height: number, maxHeight: number): number {
  return Math.max(CHAT_MIN_H, Math.min(Math.ceil(height), Math.max(CHAT_MIN_H, maxHeight)));
}

/** 创建输入自动尺寸与三向拖动驱动；关闭弹窗时必须 dispose。 */
export function createChatResizeDriver(opts: {
  root: HTMLElement;
  input: HTMLTextAreaElement;
  handles: ChatResizeHandles;
  maxWidth: () => number;
  maxHeight: () => number;
  onLayout: () => void;
}): ChatResizeDriver {
  const { root, input, maxWidth, maxHeight, onLayout } = opts;
  const bindings = [
    { handle: opts.handles.right, axis: 'width' },
    { handle: opts.handles.bottom, axis: 'height' },
    { handle: opts.handles.corner, axis: 'both' },
  ] as const;
  let measureCtx: CanvasRenderingContext2D | null = null;
  let manualWidth = false;
  let active: ActiveResize | null = null;

  const resizeInput = (): void => {
    if (!manualWidth) {
      const ctx =
        measureCtx ?? (measureCtx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D);
      ctx.font = getComputedStyle(input).font;
      const textWidth = ctx.measureText(input.value || ' ').width;
      root.style.width = clampChatWidth(textWidth + CHAT_H_PAD, Math.min(CHAT_MAX_W, maxWidth())) + 'px';
    }
    input.style.height = 'auto';
    input.style.height = Math.max(input.scrollHeight, 22) + 'px';
  };

  const finish = (event?: PointerEvent): void => {
    if (active === null || (event && event.pointerId !== active.pointerId)) return;
    const current = active;
    active = null;
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    onLayout();
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (active === null || event.pointerId !== active.pointerId) return;
    if (active.axis !== 'height') {
      manualWidth = true;
      root.style.width = clampChatWidth(active.startWidth + event.clientX - active.startX, maxWidth()) + 'px';
    }
    if (active.axis !== 'width') {
      root.style.height = clampChatHeight(active.startHeight + event.clientY - active.startY, maxHeight()) + 'px';
    }
    onLayout();
  };
  const onKeyDown = (event: KeyboardEvent, axis: ResizeAxis): void => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if ((axis === 'width' && !horizontal) || (axis === 'height' && horizontal)) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    if (horizontal) {
      manualWidth = true;
      const delta = event.key === 'ArrowRight' ? KEY_RESIZE_STEP_PX : -KEY_RESIZE_STEP_PX;
      root.style.width = clampChatWidth(rect.width + delta, maxWidth()) + 'px';
    } else {
      const delta = event.key === 'ArrowDown' ? KEY_RESIZE_STEP_PX : -KEY_RESIZE_STEP_PX;
      root.style.height = clampChatHeight(rect.height + delta, maxHeight()) + 'px';
    }
    onLayout();
  };

  const listeners = bindings.map((binding) => {
    const { handle, axis } = binding;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || active !== null) return;
      event.preventDefault();
      event.stopPropagation();
      if (axis !== 'height') manualWidth = true;
      const rect = root.getBoundingClientRect();
      active = {
        pointerId: event.pointerId,
        axis,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
      };
      handle.setPointerCapture(event.pointerId);
    };
    const onHandleKeyDown = (event: KeyboardEvent): void => onKeyDown(event, axis);
    return { ...binding, onPointerDown, onHandleKeyDown };
  });
  for (const { handle, onPointerDown, onHandleKeyDown } of listeners) {
    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('keydown', onHandleKeyDown);
  }
  input.addEventListener('input', resizeInput);

  return {
    resizeInput,
    dispose: () => {
      finish();
      input.removeEventListener('input', resizeInput);
      for (const { handle, onPointerDown, onHandleKeyDown } of listeners) {
        handle.removeEventListener('pointerdown', onPointerDown);
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        handle.removeEventListener('lostpointercapture', finish);
        handle.removeEventListener('keydown', onHandleKeyDown);
      }
    },
  };
}
