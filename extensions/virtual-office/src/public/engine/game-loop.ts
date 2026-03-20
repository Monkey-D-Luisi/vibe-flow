/**
 * Game Loop -- requestAnimationFrame with fixed timestep for logic.
 *
 * Uses a fixed 60fps tick for logic updates and variable-rate rendering.
 * This ensures consistent behavior regardless of display refresh rate.
 */

const TICK_MS = 1000 / 60;
const MAX_DELTA = 200; // cap delta to avoid spiral of death on tab-switch

export interface GameLoopCallbacks {
  /** Called at fixed 60fps intervals with elapsed ms since last tick. */
  update(dt: number): void;
  /** Called every animation frame. */
  render(): void;
}

let running = false;
let animFrameId = 0;
let accumulator = 0;
let lastTime = 0;

/**
 * Start the game loop.
 * Calls `update(dt)` at fixed 60fps and `render()` every frame.
 */
export function startLoop(callbacks: GameLoopCallbacks): void {
  if (running) return;
  running = true;
  lastTime = performance.now();
  accumulator = 0;

  function frame(now: number): void {
    if (!running) return;

    let delta = now - lastTime;
    lastTime = now;

    // Cap delta to prevent spiral of death after tab-switch
    if (delta > MAX_DELTA) delta = MAX_DELTA;

    accumulator += delta;
    while (accumulator >= TICK_MS) {
      callbacks.update(TICK_MS);
      accumulator -= TICK_MS;
    }

    callbacks.render();
    animFrameId = requestAnimationFrame(frame);
  }

  animFrameId = requestAnimationFrame(frame);
}

/** Stop the game loop. */
export function stopLoop(): void {
  running = false;
  cancelAnimationFrame(animFrameId);
}
