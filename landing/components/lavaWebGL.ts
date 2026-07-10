export const MAX_LAVA_WEBGL_CURTAINS = 6;

export type LavaWebGLQuality = 0 | 1 | 2;

export type LavaWebGLCurtain = {
  topX: number;
  topY: number;
  bottomX: number;
  bottomY: number;
  topWidth: number;
  bottomWidth: number;
  opacity: number;
  seed: number;
  ageSeconds: number;
  flowSpeed: number;
  drain: number;
  heat: number;
  tangentX: number;
  tangentY: number;
};

export type LavaWebGLRenderer = {
  resize: (cssWidth: number, cssHeight: number, requestedDpr: number) => void;
  render: (curtains: readonly LavaWebGLCurtain[], nowMs: number) => boolean;
  clear: () => void;
  destroy: () => void;
  isContextLost: () => boolean;
};

type LavaWebGLOptions = {
  quality?: LavaWebGLQuality;
  pixelBudget?: number;
  maxDpr?: number;
};

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(
    float((gl_VertexID << 1) & 2),
    float(gl_VertexID & 2)
  );
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

#define MAX_CURTAINS 6
#define LAVA_QUALITY __QUALITY__

uniform vec2 uResolution;
uniform vec2 uViewport;
uniform float uTime;
uniform int uCurtainCount;

// A: top.xy, bottom.xy
// B: topWidth, bottomWidth, opacity, seed
// C: ageSeconds, flowSpeedPxPerSecond, drain01, heat01
uniform vec4 uCurtainA[MAX_CURTAINS];
uniform vec4 uCurtainB[MAX_CURTAINS];
uniform vec4 uCurtainC[MAX_CURTAINS];
uniform vec4 uCurtainD[MAX_CURTAINS];

out vec4 outColor;

const mat2 NOISE_ROT = mat2(0.80, -0.60, 0.60, 0.80);

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.5 * valueNoise(p);
  p = NOISE_ROT * p * 2.02 + vec2(11.7, 7.9);
  sum += 0.25 * valueNoise(p);
  float norm = 0.75;
#if LAVA_QUALITY >= 1
  p = NOISE_ROT * p * 2.03 + vec2(5.3, 17.1);
  sum += 0.125 * valueNoise(p);
  norm += 0.125;
#endif
#if LAVA_QUALITY >= 2
  p = NOISE_ROT * p * 2.01 + vec2(13.9, 3.7);
  sum += 0.0625 * valueNoise(p);
  norm += 0.0625;
#endif
  return sum / norm;
}

vec3 lavaPalette(float temperature) {
  float t = clamp(temperature, 0.0, 1.0);
  vec3 color = mix(
    vec3(0.018, 0.001, 0.004),
    vec3(0.31, 0.009, 0.004),
    smoothstep(0.02, 0.25, t)
  );
  color = mix(color, vec3(0.97, 0.075, 0.004), smoothstep(0.20, 0.52, t));
  color = mix(color, vec3(1.0, 0.37, 0.018), smoothstep(0.48, 0.76, t));
  color = mix(color, vec3(1.0, 0.82, 0.24), smoothstep(0.72, 0.91, t));
  color = mix(color, vec3(1.0, 0.965, 0.76), smoothstep(0.89, 1.0, t));
  return color;
}

// Both dst and the shader output use premultiplied alpha.
void compositeOver(inout vec4 dst, vec3 straightColor, float alpha) {
  float a = clamp(alpha, 0.0, 1.0);
  vec4 source = vec4(straightColor * a, a);
  dst = source + dst * (1.0 - a);
}

void main() {
  // Convert the WebGL lower-left origin to the page's upper-left CSS pixels.
  vec2 fragPx = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  fragPx *= uViewport / uResolution;
  vec4 accum = vec4(0.0);

  for (int i = 0; i < MAX_CURTAINS; i++) {
    if (i >= uCurtainCount) break;

    vec4 a = uCurtainA[i];
    vec4 b = uCurtainB[i];
    vec4 c = uCurtainC[i];
    vec4 d = uCurtainD[i];
    float opacity = b.z;
    if (opacity <= 0.001) continue;

    vec2 topPt = a.xy;
    vec2 bottomPt = a.zw;
    float topWidth = max(b.x, 2.0);
    float bottomWidth = max(b.y, 2.0);
    float maxWidth = max(topWidth, bottomWidth);
    float seed = b.w;
    float age = c.x;
    float flowSpeed = max(c.y, 1.0);
    float drain = clamp(c.z, 0.0, 1.0);
    float heat = clamp(c.w, 0.0, 1.0);

    // Conservative bounds include the glow, smoke, and sparks. Expensive
    // material noise only runs close to a visible curtain.
    float padX = maxWidth * 1.60 + 48.0;
    if (
      fragPx.x < min(topPt.x, bottomPt.x) - padX ||
      fragPx.x > max(topPt.x, bottomPt.x) + padX ||
      fragPx.y < topPt.y - 132.0 ||
      fragPx.y > bottomPt.y + 72.0
    ) continue;

    float lengthPx = max(bottomPt.y - topPt.y, 2.0);
    float rawV = (fragPx.y - topPt.y) / lengthPx;
    float v = clamp(rawV, 0.0, 1.0);
    float curve = v * v * (3.0 - 2.0 * v);
    float centerX = mix(topPt.x, bottomPt.x, curve);
    centerX += sin(v * 5.5 + uTime * 0.55 + seed * 6.28318) *
      (0.7 + 1.3 * v) * heat;

    float halfWidth = max(1.0, 0.5 * mix(topWidth, bottomWidth, curve));
    float x = (fragPx.x - centerX) / halfWidth;
    float leftEdgeNoise = valueNoise(vec2(
      v * 5.0 + seed * 37.1,
      seed * 11.3 + uTime * 0.035
    ));
    float rightEdgeNoise = valueNoise(vec2(
      v * 5.7 + seed * 19.7,
      seed * 29.1 - uTime * 0.028
    ));
    float edgeNoise = x < 0.0 ? leftEdgeNoise : rightEdgeNoise;
    float edgeFine = valueNoise(vec2(
      v * 13.0 + seed * 53.0,
      seed * 7.3 + uTime * 0.018
    ));
    float boundary = 1.0 + (edgeNoise - 0.5) * 0.30 +
      (edgeFine - 0.5) * 0.11 + sin(v * 15.0 + seed * 9.0) * 0.045;
    float bottomNoise = valueNoise(vec2(
      x * 2.1 + seed * 17.0,
      seed * 31.0 + uTime * 0.025
    ));
    float bottomV = 0.98 + (bottomNoise - 0.5) * 0.22 +
      pow(max(0.0, 1.0 - abs(x)), 1.7) * 0.10;
    float aaX = 1.5 / halfWidth;
    float aaY = 1.5 / lengthPx;
    float sideMask = 1.0 - smoothstep(boundary - aaX, boundary + aaX, abs(x));
    float topMask = smoothstep(-aaY, aaY, rawV);
    float endMask = 1.0 - smoothstep(bottomV - aaY, bottomV + aaY, rawV);
    float bodyMask = sideMask * topMask * endMask;

    // A thick shared molten lip keeps the waterfall attached to the tear.
    vec2 mouthTangent = normalize(d.xy + vec2(0.0001, 0.0));
    vec2 mouthNormal = vec2(-mouthTangent.y, mouthTangent.x);
    vec2 mouthDelta = fragPx - topPt;
    float mouthAlong = dot(mouthDelta, mouthTangent);
    float mouthAcross = dot(mouthDelta, mouthNormal);
    float mouthX = 1.0 - smoothstep(
      topWidth * 0.42,
      topWidth * 0.58,
      abs(mouthAlong)
    );
    float mouth = exp(-abs(mouthAcross) / 3.3) * mouthX;
    float shapeMask = max(bodyMask, mouth * 0.92);

    float dx = max(abs(fragPx.x - centerX) - halfWidth * boundary, 0.0);
    float bottomEdgeY = topPt.y + lengthPx * bottomV;
    float dy = max(max(topPt.y - fragPx.y, fragPx.y - bottomEdgeY), 0.0);
    float outsideDistance = length(vec2(dx, dy));
    float haloNear = exp(-outsideDistance / (8.0 + 5.0 * heat));
    float haloFar = exp(-outsideDistance / (24.0 + 10.0 * heat));
    float halo = (haloNear * 0.72 + haloFar * 0.28) *
      (1.0 - 0.62 * shapeMask);

#if LAVA_QUALITY >= 1
    // Slowly rising smoke with a widening, curled plume instead of a box.
    float rise = topPt.y - fragPx.y;
    float smokeVertical = smoothstep(-16.0, 6.0, rise) *
      (1.0 - smoothstep(45.0, 132.0, rise));
    if (smokeVertical > 0.001) {
      float plumeHalfWidth = maxWidth * 0.50 + 18.0 + max(rise, 0.0) * 0.28;
      float curl = sin(rise * 0.055 + seed * 8.0 + uTime * 0.55) * 8.0;
      float smokeHorizontal = 1.0 - smoothstep(
        plumeHalfWidth * 0.55,
        plumeHalfWidth,
        abs(fragPx.x - topPt.x + curl)
      );
      vec2 smokeUv = vec2(
        fragPx.x * 0.012 + seed * 31.0,
        fragPx.y * 0.010 + uTime * 0.13
      );
      smokeUv.x += 0.25 * sin(smokeUv.y * 3.1 + seed * 7.0);
      float smokeNoise = fbm(smokeUv);
      float smokeDensity = smoothstep(0.45, 0.72, smokeNoise) *
        smokeVertical * smokeHorizontal * opacity *
        (0.08 + 0.05 * heat) * (1.0 - 0.50 * drain);
      float hotSmoke = 1.0 - smoothstep(4.0, 65.0, max(rise, 0.0));
      vec3 smokeColor = mix(
        vec3(0.026, 0.010, 0.016),
        vec3(0.11, 0.024, 0.007),
        hotSmoke
      );
      compositeOver(accum, smokeColor, smokeDensity);
    }
#endif

    compositeOver(
      accum,
      vec3(1.0, 0.105, 0.008),
      halo * opacity * (0.11 + 0.15 * heat) * (1.0 - 0.25 * drain)
    );

    if (shapeMask > 0.001) {
      // Domain-warped, downward-advection fields create branching hot veins.
      float flow = age * flowSpeed / lengthPx;
      vec2 warpUv = vec2(x * 1.30, (rawV - flow) * 1.80);
      warpUv += vec2(seed * 23.1, seed * 7.3);
      float warp = fbm(warpUv);
      vec2 lavaUv = vec2(
        x * 1.62 + (warp - 0.5) * 1.30,
        (rawV - flow) * 2.05
      );
      lavaUv += vec2(seed * 41.7, seed * 19.2);
      float field = fbm(lavaUv);
      vec2 branchUv = vec2(
        (x + (rawV - 0.45) * (seed - 0.5) * 0.72) * 1.24 -
          (warp - 0.5) * 0.82,
        (rawV - flow * 0.92) * 1.58
      ) + vec2(seed * 27.3, seed * 13.9);
      float branchField = fbm(branchUv);
      float ridge = 1.0 - smoothstep(0.014, 0.052, abs(field - 0.51));
      float branchRidge = 1.0 - smoothstep(0.012, 0.046, abs(branchField - 0.535));
      float fineField = valueNoise(lavaUv * 1.68 + vec2(7.1, 3.7));
      float fineRidge = 1.0 - smoothstep(0.008, 0.026, abs(fineField - 0.52));
      float veins = clamp(
        max(ridge * 0.88, branchRidge * (0.5 + 0.2 * warp)) + fineRidge * 0.04,
        0.0,
        1.0
      );
      float depthFromEdge = boundary - abs(x);
      float interior = smoothstep(0.02, 0.34, depthFromEdge);
      float coolingPatches = smoothstep(
        0.64,
        0.84,
        warp + 0.08 * valueNoise(lavaUv * 0.45)
      ) * (1.0 - veins);
      float cooling = clamp(
        (1.0 - interior) * 0.98 + coolingPatches * 0.45,
        0.0,
        1.0
      );
      float centerCore = pow(
        clamp(1.0 - abs(x) / max(boundary, 0.001), 0.0, 1.0),
        1.7
      );
      float liveHeat = heat * (1.0 - 0.30 * drain);
      float temperature = clamp(
        (0.17 + field * 0.10 + centerCore * 0.12 + veins * 0.68) * liveHeat,
        0.0,
        1.0
      );
      temperature *= 1.0 - cooling * 0.72;
      temperature = max(temperature, mouth * 0.82 * liveHeat);
      vec3 bodyColor = lavaPalette(temperature);
      float crustMix = clamp(cooling * (0.80 - veins * 0.45), 0.0, 0.90);
      bodyColor = mix(bodyColor, vec3(0.018, 0.0015, 0.003), crustMix);
      float bodyAlpha = shapeMask * opacity * (0.91 + 0.07 * cooling);
      compositeOver(accum, bodyColor, bodyAlpha);
    }

#if LAVA_QUALITY >= 1
    // A stable sparse particle grid gives sparks upward motion and short tails.
    float sparkRise = topPt.y - fragPx.y;
    float sparkVertical = smoothstep(-28.0, 4.0, sparkRise) *
      (1.0 - smoothstep(32.0, 135.0, sparkRise));
    float sparkHorizontal = 1.0 - smoothstep(
      maxWidth * 0.55 + 8.0,
      maxWidth * 1.60 + 40.0,
      abs(fragPx.x - topPt.x)
    );
    if (sparkVertical * sparkHorizontal > 0.001) {
      vec2 sparkGrid = vec2(
        (fragPx.x - topPt.x) / 14.0,
        (fragPx.y - topPt.y + age * (28.0 + heat * 18.0)) / 22.0
      );
      vec2 cell = floor(sparkGrid);
      vec2 local = fract(sparkGrid);
      vec2 randomPoint = 0.18 + 0.64 *
        hash22(cell + vec2(seed * 97.0, seed * 43.0));
      float sparse = smoothstep(
        0.955,
        0.995,
        hash21(cell + vec2(seed * 131.0, seed * 61.0))
      );
      vec2 delta = (local - randomPoint) * vec2(14.0, 22.0);
      vec2 coreDelta = delta * vec2(0.55, 0.13);
      vec2 glowDelta = delta * vec2(0.18, 0.045);
      float sparkCore = exp(-dot(coreDelta, coreDelta) * 2.0) * sparse;
      float sparkGlow = exp(-dot(glowDelta, glowDelta) * 1.2) * sparse;
      float sparkLife = opacity * (1.0 - drain) * sparkVertical * sparkHorizontal;
      compositeOver(accum, vec3(1.0, 0.10, 0.008), sparkGlow * sparkLife * 0.15);
      compositeOver(accum, vec3(1.0, 0.72, 0.16), sparkCore * sparkLife * 0.86);
    }
#endif
  }

  outColor = accum;
}
`;

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Mouse rift lava shader failed to compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext, quality: LavaWebGLQuality) => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER.replace("__QUALITY__", String(quality)),
  );
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Mouse rift lava shader failed to link:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

export const createLavaWebGLRenderer = (
  canvas: HTMLCanvasElement,
  options: LavaWebGLOptions = {},
): LavaWebGLRenderer | null => {
  const context = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!context) return null;

  const gl = context;
  const quality = options.quality ?? 2;
  const pixelBudget = options.pixelBudget ?? 2_400_000;
  const maxDpr = options.maxDpr ?? 1.15;
  const curtainA = new Float32Array(MAX_LAVA_WEBGL_CURTAINS * 4);
  const curtainB = new Float32Array(MAX_LAVA_WEBGL_CURTAINS * 4);
  const curtainC = new Float32Array(MAX_LAVA_WEBGL_CURTAINS * 4);
  const curtainD = new Float32Array(MAX_LAVA_WEBGL_CURTAINS * 4);

  let program: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let locations: Record<string, WebGLUniformLocation> | null = null;
  let cssWidth = 1;
  let cssHeight = 1;
  let requestedDpr = 1;
  let contextLost = false;
  let destroyed = false;
  let failed = false;
  let healthChecked = false;
  let startTimeMs = 0;

  const releaseResources = () => {
    if (vao) gl.deleteVertexArray(vao);
    if (program) gl.deleteProgram(program);
    vao = null;
    program = null;
    locations = null;
  };

  const buildResources = () => {
    releaseResources();
    const nextProgram = createProgram(gl, quality);
    const nextVao = gl.createVertexArray();
    if (!nextProgram || !nextVao) {
      if (nextProgram) gl.deleteProgram(nextProgram);
      if (nextVao) gl.deleteVertexArray(nextVao);
      return false;
    }
    const names = [
      "uResolution",
      "uViewport",
      "uTime",
      "uCurtainCount",
      "uCurtainA[0]",
      "uCurtainB[0]",
      "uCurtainC[0]",
      "uCurtainD[0]",
    ] as const;
    const nextLocations: Record<string, WebGLUniformLocation> = {};
    for (const name of names) {
      const location = gl.getUniformLocation(nextProgram, name);
      if (!location) {
        gl.deleteVertexArray(nextVao);
        gl.deleteProgram(nextProgram);
        return false;
      }
      nextLocations[name] = location;
    }
    program = nextProgram;
    vao = nextVao;
    locations = nextLocations;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    return true;
  };

  const resize = (nextWidth: number, nextHeight: number, nextDpr: number) => {
    cssWidth = Math.max(1, Math.round(nextWidth));
    cssHeight = Math.max(1, Math.round(nextHeight));
    requestedDpr = Math.max(0.5, nextDpr || 1);
    const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, cssWidth * cssHeight));
    const dpr = Math.max(0.5, Math.min(requestedDpr, maxDpr, budgetDpr));
    const bufferWidth = Math.max(1, Math.round(cssWidth * dpr));
    const bufferHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    if (!contextLost) gl.viewport(0, 0, bufferWidth, bufferHeight);
  };

  const clear = () => {
    if (destroyed || contextLost || failed || !program) return;
    try {
      if (gl.isContextLost()) {
        contextLost = true;
        return;
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } catch {
      failed = true;
    }
  };

  const render = (curtains: readonly LavaWebGLCurtain[], nowMs: number) => {
    if (destroyed || contextLost || failed || !program || !vao || !locations) return false;
    if (gl.isContextLost()) {
      contextLost = true;
      return false;
    }

    try {
      const count = Math.min(curtains.length, MAX_LAVA_WEBGL_CURTAINS);
      let minX = cssWidth;
      let minY = cssHeight;
      let maxX = 0;
      let maxY = 0;
      for (let index = 0; index < count; index += 1) {
        const curtain = curtains[index];
        const offset = index * 4;
        curtainA[offset] = curtain.topX;
        curtainA[offset + 1] = curtain.topY;
        curtainA[offset + 2] = curtain.bottomX;
        curtainA[offset + 3] = curtain.bottomY;
        curtainB[offset] = curtain.topWidth;
        curtainB[offset + 1] = curtain.bottomWidth;
        curtainB[offset + 2] = curtain.opacity;
        curtainB[offset + 3] = curtain.seed;
        curtainC[offset] = curtain.ageSeconds;
        curtainC[offset + 1] = curtain.flowSpeed;
        curtainC[offset + 2] = curtain.drain;
        curtainC[offset + 3] = curtain.heat;
        curtainD[offset] = curtain.tangentX;
        curtainD[offset + 1] = curtain.tangentY;
        curtainD[offset + 2] = 0;
        curtainD[offset + 3] = 0;

        const maxWidth = Math.max(curtain.topWidth, curtain.bottomWidth);
        const horizontalPad = maxWidth * 1.6 + 48;
        minX = Math.min(minX, Math.min(curtain.topX, curtain.bottomX) - horizontalPad);
        maxX = Math.max(maxX, Math.max(curtain.topX, curtain.bottomX) + horizontalPad);
        minY = Math.min(minY, curtain.topY - 138);
        maxY = Math.max(maxY, curtain.bottomY + 76);
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return true;

      minX = Math.max(0, minX);
      minY = Math.max(0, minY);
      maxX = Math.min(cssWidth, maxX);
      maxY = Math.min(cssHeight, maxY);
      const scaleX = canvas.width / cssWidth;
      const scaleY = canvas.height / cssHeight;
      const scissorX = Math.max(0, Math.floor(minX * scaleX));
      const scissorY = Math.max(0, Math.floor((cssHeight - maxY) * scaleY));
      const scissorWidth = Math.min(
        canvas.width - scissorX,
        Math.max(1, Math.ceil((maxX - minX) * scaleX)),
      );
      const scissorHeight = Math.min(
        canvas.height - scissorY,
        Math.max(1, Math.ceil((maxY - minY) * scaleY)),
      );
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(scissorX, scissorY, scissorWidth, scissorHeight);

      if (!startTimeMs) startTimeMs = nowMs;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(locations.uResolution, canvas.width, canvas.height);
      gl.uniform2f(locations.uViewport, cssWidth, cssHeight);
      gl.uniform1f(locations.uTime, (nowMs - startTimeMs) / 1000);
      gl.uniform1i(locations.uCurtainCount, count);
      gl.uniform4fv(locations["uCurtainA[0]"], curtainA);
      gl.uniform4fv(locations["uCurtainB[0]"], curtainB);
      gl.uniform4fv(locations["uCurtainC[0]"], curtainC);
      gl.uniform4fv(locations["uCurtainD[0]"], curtainD);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.disable(gl.SCISSOR_TEST);

      if (!healthChecked) {
        healthChecked = true;
        if (gl.getError() !== gl.NO_ERROR) {
          failed = true;
          return false;
        }
      }
      return true;
    } catch {
      failed = true;
      try {
        gl.bindVertexArray(null);
        gl.disable(gl.SCISSOR_TEST);
      } catch {
        // The 2D fallback takes over if the context is no longer callable.
      }
      return false;
    }
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    program = null;
    vao = null;
    locations = null;
  };

  const onContextRestored = () => {
    if (destroyed) return;
    contextLost = false;
    failed = false;
    healthChecked = false;
    startTimeMs = 0;
    if (!buildResources()) {
      contextLost = true;
      return;
    }
    resize(cssWidth, cssHeight, requestedDpr);
    clear();
  };

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  if (!buildResources()) {
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    return null;
  }

  return {
    resize,
    render,
    clear,
    isContextLost: () => contextLost || gl.isContextLost(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (!contextLost) releaseResources();
    },
  };
};
