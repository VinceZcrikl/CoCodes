/** Persona status orb — a small WebGL indicator.
 *
 *  A coloured blob (per-persona, or an explicit colour) that breathes quietly
 *  and — when `reactive` — shows what the CLI is doing: it churns brighter
 *  while output streams, flashes a bloom on exit, and shifts red on errors.
 *  Reads the terminal pulse via `getPulse()` and drives the shader through
 *  critically-damped springs, so terminal output never re-renders React.
 *
 *  The canvas fills its parent (which sets the footprint) — `ogl` writes inline
 *  pixel sizes, so we measure the PARENT, never the canvas itself. Rendering is
 *  one full-screen triangle, a single draw call per frame. */
import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { ORB_VERT, ORB_FRAG } from "./orbShaders";
import { makeSpring, stepSpring, hexToRgb, shade } from "./orbSprings";
import { getPulse, startAgentPulse, stopAgentPulse } from "../../state/agentPulse";

/** Brand colour per CLI persona (matches the cockpit tab accents). */
export const CLI_COLORS: Record<string, string> = {
  claude: "#d0a76f", // gold
  codex: "#5dd6c5", // teal
  grok: "#b48ee0", // violet
  gemini: "#7eb8f7", // blue
};

interface Props {
  /** Persona CLI — picks a brand colour when `color` is not given. */
  cli?: string;
  /** Explicit hex colour; overrides the CLI colour. */
  color?: string;
  /** React to terminal activity (default true). When false the orb just
   *  breathes gently in its colour — good for ambient indicators. */
  reactive?: boolean;
  /** Planet self-rotation speed in rad/s (0 ≈ still). */
  spin?: number;
}

function resolve(color?: string, cli?: string): string {
  return color ?? CLI_COLORS[cli ?? "claude"] ?? CLI_COLORS.claude;
}

export default function PersonaOrb({ cli = "claude", color, reactive = true, spin = 0.18 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Live values readable inside the rAF loop without re-running setup.
  const colorRef = useRef(resolve(color, cli));
  colorRef.current = resolve(color, cli);
  const reactiveRef = useRef(reactive);
  reactiveRef.current = reactive;
  const spinRef = useRef(spin);
  spinRef.current = spin;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        premultipliedAlpha: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      return; // no WebGL — orb silently absent
    }
    const gl = renderer.gl;

    const c0 = hexToRgb(colorRef.current);
    const program = new Program(gl, {
      vertex: ORB_VERT,
      fragment: ORB_FRAG,
      transparent: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.32 },
        uFlow: { value: 0 },
        uError: { value: 0 },
        uBloom: { value: 0 },
        uSpin: { value: spinRef.current },
        uHueCore: { value: c0 },
        uHueDeep: { value: shade(c0, 0.52) },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    // Measure the PARENT — ogl writes inline px sizes onto the canvas, so the
    // canvas's own box can't be trusted as the source of truth.
    const fit = () => {
      const host = canvas.parentElement;
      const w = host?.clientWidth || 24;
      const h = host?.clientHeight || 24;
      renderer.setSize(Math.max(8, w), Math.max(8, h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let pulsing = false;
    if (reactiveRef.current) {
      pulsing = true;
      void startAgentPulse();
    }

    // Mood springs.
    const sIntensity = makeSpring(0.32, 8);
    const sFlow = makeSpring(0, 10);
    const sError = makeSpring(0, 14);
    const sBloom = makeSpring(0, 6); // impulse-driven; target stays 0
    let lastExitAt = 0;

    const wallStart = performance.now();
    let last = wallStart;
    let raf = 0;
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (reactiveRef.current) {
        const p = getPulse();
        const flowing = now - p.lastDataMs < 320 && p.intensity > 0.05;
        const errorRecent = p.errorMs && now - p.errorMs < 900;
        if (p.exit && p.exit.at !== lastExitAt) {
          lastExitAt = p.exit.at;
          sBloom.value = 1;
          sBloom.velocity = 0;
          if (p.exit.code && p.exit.code !== 0) sError.value = 1;
        }
        sIntensity.target = flowing ? 0.55 + 0.45 * Math.min(1, p.intensity) : 0.3;
        sFlow.target = flowing ? Math.min(1, p.intensity) : 0;
        sError.target = errorRecent ? 1 : 0;
      } else {
        // Ambient: gentle life only.
        sIntensity.target = 0.44;
        sFlow.target = 0.06;
        sError.target = 0;
      }

      stepSpring(sIntensity, dt);
      stepSpring(sFlow, dt);
      stepSpring(sError, dt);
      stepSpring(sBloom, dt);

      const c = hexToRgb(colorRef.current);
      (program.uniforms.uHueCore.value as number[]).splice(0, 3, ...c);
      (program.uniforms.uHueDeep.value as number[]).splice(0, 3, ...shade(c, 0.52));

      program.uniforms.uTime.value = reduce ? 0 : (now - wallStart) / 1000;
      program.uniforms.uSpin.value = spinRef.current;
      program.uniforms.uIntensity.value = sIntensity.value;
      program.uniforms.uFlow.value = sFlow.value;
      program.uniforms.uError.value = sError.value;
      program.uniforms.uBloom.value = Math.max(0, sBloom.value);

      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      renderer.render({ scene: mesh });
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onVisibility = () => {
      if (reduce) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (pulsing) stopAgentPulse();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className="persona-orb" aria-hidden="true" />;
}
