/** Compact GLSL for the persona status orb.
 *
 *  A full-screen triangle renders a sphere SDF lit with a fake normal, filled
 *  by domain-warped fbm noise (the "fluid" interior), wrapped in a fresnel rim
 *  and a moving specular glint. The persona's brand colour drives the hue; a
 *  handful of spring-eased uniforms drive its mood:
 *
 *    uIntensity — overall brightness / liveliness (0 idle … 1 hot)
 *    uFlow      — how fast the interior churns (terminal output streaming)
 *    uError     — red shift + edge jitter (red ANSI seen)
 *    uBloom     — one-shot expanding halo on command completion
 *
 *  Original implementation — noise/fresnel/SDF are standard techniques. */

export const ORB_VERT = /* glsl */ `
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const ORB_FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uIntensity;
uniform float uFlow;
uniform float uError;
uniform float uBloom;
uniform float uSpin;    // planet self-rotation speed (rad/s)
uniform vec3  uHueCore; // bright persona colour
uniform vec3  uHueDeep; // shaded persona colour

// ── value noise + fbm ──────────────────────────────────────────────
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.05;
    amp *= 0.5;
  }
  return v;
}

void main() {
  // Centre coords; body radius ≈ 1 at r = 1. Tight margin so the planet
  // fills most of its box.
  vec2 uv = (vUv - 0.5) * 2.2;

  // Gentle breathing while idle; settles as the orb gets busy.
  float breath = (0.5 + 0.5 * sin(uTime * 1.5)) * (1.0 - uIntensity) * 0.06;
  uv /= (1.0 + breath);

  // Error jitter — a nervous shimmer when something went red.
  uv += uError * 0.05 * vec2(sin(uTime * 57.0), cos(uTime * 49.0));

  float r = length(uv);
  float z = sqrt(max(0.0, 1.0 - r * r));
  vec3 n = vec3(uv, z);

  // Planet surface — map the disc onto a sphere and spin it about the polar
  // axis, so banded fbm scrolls like a turning planet (the limb foreshortens
  // as longitude compresses near the edge). Churns faster with uFlow.
  float spin = uTime * (uSpin + uFlow * 0.4);
  float lon = atan(uv.x, max(z, 0.06)) + spin;
  float lat = asin(clamp(uv.y, -1.0, 1.0));
  vec2 puv = vec2(lon * 0.85, lat * 1.25);
  float ft = uTime * (0.05 + 0.4 * uFlow);
  vec2 warp = vec2(
    fbm(puv * 1.6 + vec2(ft * 0.30, 0.0)),
    fbm(puv * 1.6 + vec2(0.0, ft * 0.24) + 5.0)
  );
  float m = fbm(puv * 1.8 + warp * 0.7);
  float fluid = smoothstep(0.2, 0.72, m);

  vec3 col = mix(uHueDeep, uHueCore, fluid);

  // Sphere lighting — a lit hemisphere fading to a soft terminator gives the
  // body real 3D depth instead of reading as a flat ring. Lit side glows in
  // the persona colour; the dark side keeps a warm ambient floor.
  vec3 L = normalize(vec3(0.45, 0.5, 0.78));
  float diff = max(dot(n, L), 0.0);
  col *= 0.5 + 0.7 * diff;
  // Brighten the lit crown toward the pure colour.
  col += uHueCore * pow(diff, 2.0) * 0.35;

  // Inner core glow.
  col += uHueCore * (0.1 + 0.16 * uIntensity) * (1.0 - smoothstep(0.0, 0.7, r));

  // Soft fresnel rim (kept subtle so it stays a ball, not a donut).
  float fres = pow(1.0 - n.z, 3.5);
  col = mix(col, uHueCore * 1.2, fres * (0.22 + 0.22 * uIntensity));

  // Crisp hairline at the edge.
  float hair = smoothstep(0.90, 0.965, r) * (1.0 - smoothstep(0.965, 1.0, r));
  col += mix(uHueCore, vec3(1.0), 0.35) * hair * (0.5 + 0.4 * uIntensity);

  // Moving specular glint.
  vec3 light = normalize(vec3(0.42, 0.6, 0.72));
  float spec = pow(max(dot(n, light), 0.0), 26.0);
  col += vec3(spec) * (0.35 + 0.45 * uIntensity);

  // Red shift on error.
  col = mix(col, vec3(1.0, 0.26, 0.2) * (0.45 + fluid), uError * 0.7);

  // Overall liveliness.
  col *= 0.6 + 0.55 * uIntensity;

  // Body alpha (soft edge).
  float alpha = smoothstep(1.02, 0.9, r);

  // Completion bloom — an expanding ring of light around the rim.
  float ringR = 1.0 + uBloom * 0.6;
  float ring = exp(-pow((r - ringR) / 0.16, 2.0)) * uBloom;
  col += uHueCore * ring * 1.6;
  alpha = max(alpha, ring * 0.85);

  // Premultiplied output (renderer uses premultipliedAlpha).
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
