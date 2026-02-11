/**
 * A simple 1D Pseudo-Noise generator.
 * Returns a smooth, non-repeating value between -1 and 1 based on time.
 * This makes movement look human instead of robotic.
 */
export function pseudoNoise(t: number): number {
  return (
    (Math.sin(t) +
      Math.sin(2.2 * t + 5.52) +
      Math.sin(2.9 * t + 0.93) +
      Math.sin(4.6 * t + 8.94)) /
    4
  );
}

/**
 * Standard Damping function for smooth catch-up movement
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  // Frame-rate independent smoothing
  const factor = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * factor;
}
