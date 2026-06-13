/** Critically-damped scalar springs — smooth, overshoot-free easing for the
 *  orb's mood uniforms. Each uniform chases a target so transitions feel
 *  organic instead of stepped. Standard second-order critical damping. */
export interface Spring {
  value: number;
  velocity: number;
  target: number;
  omega: number; // stiffness — higher settles faster
}

export function makeSpring(initial: number, omega = 10): Spring {
  return { value: initial, velocity: 0, target: initial, omega };
}

export function stepSpring(s: Spring, dt: number): void {
  if (dt > 0.05) dt = 0.05; // clamp frame stalls for stability
  const dx = s.value - s.target;
  const accel = -2 * s.omega * s.velocity - s.omega * s.omega * dx;
  s.velocity += accel * dt;
  s.value += s.velocity * dt;
}

/** Convert a #rrggbb / #rgb hex string to a 0..1 RGB triplet. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const int = parseInt(h, 16);
  if (Number.isNaN(int) || h.length !== 6) return [0.82, 0.65, 0.43]; // gold
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

/** Darken an RGB triplet toward black by factor `k` (0..1 = keep fraction). */
export function shade(rgb: [number, number, number], k: number): [number, number, number] {
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}
