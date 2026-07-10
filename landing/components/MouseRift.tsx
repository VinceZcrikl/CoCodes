"use client";

import { useEffect, useRef } from "react";

import {
  createLavaWebGLRenderer,
  type LavaWebGLCurtain,
} from "./lavaWebGL";

const FRAME_INTERVAL = 1000 / 60;
const HOLD_TIME = 260;
const HEAL_DURATION = 1650;
const POINT_LIFETIME = HOLD_TIME + HEAL_DURATION + 300;
const SAMPLE_DISTANCE = 5;
// Keep one gesture alive through brief event throttling (for example when the
// main thread is busy); large pointer teleports are still split by distance.
const RESTART_DELAY = 280;
const RESTART_DISTANCE = 240;
const MAX_STROKES = 4;
const MAX_POINTS = 420;
const MAX_LAVA_CURTAINS = 6;

const CLAW_LANES = [
  { shift: -8.5, aperture: 0.46, alpha: 0.38, start: 0.08, end: 0.84, phase: 0.4 },
  { shift: 0, aperture: 1.48, alpha: 1, start: 0, end: 1, phase: 1.5 },
  { shift: 8.5, aperture: 0.52, alpha: 0.44, start: 0.18, end: 0.94, phase: 2.7 },
] as const;

type RiftPoint = {
  x: number;
  y: number;
  born: number;
  roughness: number;
  seed: number;
  power: number;
};

type RiftStroke = {
  points: RiftPoint[];
  lastMove: number;
  lavaTravel: number;
  nextLavaGap: number;
  lavaCount: number;
};

type LavaCurtain = {
  sourcePoint: RiftPoint;
  sourceStroke: RiftStroke;
  baseX: number;
  baseY: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  lipSide: -1 | 1;
  baseHalfWidth: number;
  anchorX: number;
  anchorY: number;
  born: number;
  drainAt: number | null;
  width: number;
  targetLength: number;
  sway: number;
  flowSpeed: number;
  filaments: number;
  seed: number;
  phase: number;
};

type LavaCurtainGeometry = {
  leftTopX: number;
  leftTopY: number;
  rightTopX: number;
  rightTopY: number;
  leftBottomX: number;
  leftBottomY: number;
  rightBottomX: number;
  rightBottomY: number;
  bottomCenterX: number;
  bottomCenterY: number;
  bottomWidth: number;
  topCenterY: number;
  length: number;
  wave: number;
};

type RiftLane = (typeof CLAW_LANES)[number];
type CanvasPoint = { x: number; y: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

/** Draws a short-lived claw tear behind the pointer. The canvas is purely
 * decorative and never captures links, text selection, or the real cursor. */
export default function MouseRift() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const magmaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refractionRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const heatRefractionRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const magmaCanvas = magmaCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(any-pointer: fine)");
    let enabled = finePointer.matches && !reduceMotion.matches;
    const makeLavaRenderer = () =>
      magmaCanvas
      ? createLavaWebGLRenderer(magmaCanvas, {
          quality: 2,
          pixelBudget: 2_000_000,
          maxDpr: 1,
        })
      : null;
    let lavaRenderer = enabled ? makeLavaRenderer() : null;
    let width = 0;
    let height = 0;
    let frameId = 0;
    let lastFrame = performance.now();
    let activeStroke: RiftStroke | null = null;
    let lastSample: { x: number; y: number; time: number } | null = null;
    const strokes: RiftStroke[] = [];
    const lavaCurtains: LavaCurtain[] = [];
    const lavaWebGLCurtains: LavaWebGLCurtain[] = [];

    const hideMagmaCanvas = () => {
      lavaRenderer?.clear();
      if (!magmaCanvas) return;
      magmaCanvas.style.opacity = "0";
      magmaCanvas.style.visibility = "hidden";
    };

    const hideRefractions = () => {
      for (const refraction of refractionRefs.current) {
        if (!refraction) continue;
        refraction.style.opacity = "0";
        refraction.style.visibility = "hidden";
        refraction.style.clipPath = "none";
        refraction.style.setProperty("-webkit-clip-path", "none");
      }
      for (const heat of heatRefractionRefs.current) {
        if (!heat) continue;
        heat.style.opacity = "0";
        heat.style.visibility = "hidden";
      }
    };

    const clearCanvas = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      strokes.length = 0;
      lavaCurtains.length = 0;
      activeStroke = null;
      lastSample = null;
      ctx.clearRect(0, 0, width, height);
      canvas.style.opacity = "0";
      canvas.style.visibility = "hidden";
      hideMagmaCanvas();
      hideRefractions();
    };

    const releaseBackingStore = () => {
      clearCanvas();
      width = 1;
      height = 1;
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = "1px";
      canvas.style.height = "1px";
      lavaRenderer?.resize(1, 1, 0.5);
      if (magmaCanvas) {
        magmaCanvas.style.width = "1px";
        magmaCanvas.style.height = "1px";
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      // The wide glow is deliberately soft, so a capped backing store remains
      // crisp while avoiding a full Retina canvas on large displays.
      const pixelBudget = 4_000_000;
      const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
      const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 1.35, budgetDpr));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Explicitly initialize the full backing store as transparent. Besides
      // being correct for compositors, this avoids stale tiles after a resize.
      ctx.clearRect(0, 0, width, height);
      canvas.style.opacity = "0";
      canvas.style.visibility = "hidden";
      lavaRenderer?.resize(width, height, window.devicePixelRatio || 1);
      hideMagmaCanvas();
      strokes.length = 0;
      lavaCurtains.length = 0;
      activeStroke = null;
      lastSample = null;
      hideRefractions();
    };

    const makePoint = (x: number, y: number, born: number, power: number): RiftPoint => ({
      x,
      y,
      born,
      power,
      roughness: (Math.random() - 0.5) * 2,
      seed: Math.random(),
    });

    const startStroke = (x: number, y: number, now: number) => {
      canvas.style.visibility = "visible";
      canvas.style.opacity = "1";
      const stroke: RiftStroke = {
        points: [makePoint(x, y, now, 0.48)],
        lastMove: now,
        lavaTravel: 0,
        nextLavaGap: 250 + Math.random() * 60,
        lavaCount: 0,
      };
      strokes.push(stroke);
      if (strokes.length > MAX_STROKES) strokes.shift();
      activeStroke = stroke;
      lastSample = { x, y, time: now };
    };

    const pointOpening = (point: RiftPoint, now: number, strokeClosure: number) => {
      const age = now - point.born;
      const life = 1 - Math.max(0, age - HOLD_TIME) / HEAL_DURATION;
      return smoothstep(life) * strokeClosure;
    };

    const lanePoints = (points: RiftPoint[], lane: RiftLane) => {
      const last = points.length - 1;
      const start = Math.floor(last * lane.start);
      const end = Math.min(points.length, Math.ceil(last * lane.end) + 1);
      return points.slice(start, end);
    };

    const sideCoordinates = (
      points: RiftPoint[],
      side: -1 | 1,
      now: number,
      strokeClosure: number,
      lane: RiftLane,
      apertureScale = 1,
    ): CanvasPoint[] =>
      points.map((point, index) => {
        const previous = points[Math.max(0, index - 1)];
        const next = points[Math.min(points.length - 1, index + 1)];
        const dx = next.x - previous.x;
        const dy = next.y - previous.y;
        const length = Math.hypot(dx, dy) || 1;
        const opening = pointOpening(point, now, strokeClosure);
        const endDistance = Math.min(index, points.length - 1 - index);
        const taper = smoothstep(endDistance / 2.5);
        const laneWobble =
          point.roughness * 0.72 + Math.sin(point.seed * 8 + index * 0.42 + lane.phase) * 0.42;
        const halfWidth =
          (3.15 + point.power * 2.2) * lane.aperture * apertureScale * taper * opening;
        const offset = lane.shift + laneWobble * opening + side * halfWidth;
        return {
          x: point.x + (-dy / length) * offset,
          y: point.y + (dx / length) * offset,
        };
      });

    const appendSmoothPath = (coordinates: CanvasPoint[], move: boolean) => {
      if (!coordinates.length) return;
      if (move) ctx.moveTo(coordinates[0].x, coordinates[0].y);
      else ctx.lineTo(coordinates[0].x, coordinates[0].y);

      for (let index = 1; index < coordinates.length - 1; index += 1) {
        const point = coordinates[index];
        const next = coordinates[index + 1];
        ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      }

      const last = coordinates[coordinates.length - 1];
      ctx.lineTo(last.x, last.y);
    };

    const fissureShape = (
      points: RiftPoint[],
      now: number,
      strokeClosure: number,
      lane: RiftLane,
      apertureScale = 1,
    ) => {
      const upper = sideCoordinates(points, -1, now, strokeClosure, lane, apertureScale);
      const lower = sideCoordinates(points, 1, now, strokeClosure, lane, apertureScale).reverse();
      ctx.beginPath();
      appendSmoothPath(upper, true);
      appendSmoothPath(lower, false);
      ctx.closePath();
    };

    const edgePath = (
      points: RiftPoint[],
      side: -1 | 1,
      now: number,
      strokeClosure: number,
      lane: RiftLane,
    ) => {
      ctx.beginPath();
      appendSmoothPath(sideCoordinates(points, side, now, strokeClosure, lane), true);
    };

    const updateRefractions = (now: number) => {
      const mainLane = CLAW_LANES[1];

      for (let bandIndex = 0; bandIndex < MAX_STROKES; bandIndex += 1) {
        const band = refractionRefs.current[bandIndex];
        const stroke = strokes[bandIndex];
        if (!band || !stroke || stroke.points.length < 3) {
          if (band) {
            band.style.opacity = "0";
            band.style.visibility = "hidden";
          }
          continue;
        }

        const idleFor = now - stroke.lastMove;
        const closure = smoothstep(1 - Math.max(0, idleFor - HOLD_TIME) / HEAL_DURATION);
        if (closure <= 0.02) {
          band.style.opacity = "0";
          band.style.visibility = "hidden";
          continue;
        }

        const cut = lanePoints(stroke.points, mainLane);
        const upper = sideCoordinates(cut, -1, now, closure, mainLane, 4.4);
        const lower = sideCoordinates(cut, 1, now, closure, mainLane, 4.4).reverse();
        const step = Math.max(2, Math.ceil(cut.length / 28));
        const sample = (coordinates: CanvasPoint[]) =>
          coordinates.filter(
            (_, index) => index === 0 || index === coordinates.length - 1 || index % step === 0,
          );
        const polygon = [...sample(upper), ...sample(lower)];
        if (polygon.length < 4) {
          band.style.opacity = "0";
          band.style.visibility = "hidden";
          continue;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const point of polygon) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }

        const pad = 3;
        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;
        band.style.left = minX + "px";
        band.style.top = minY + "px";
        band.style.width = Math.max(1, maxX - minX) + "px";
        band.style.height = Math.max(1, maxY - minY) + "px";
        const clipPath =
          "polygon(" +
          polygon.map((point) => point.x - minX + "px " + (point.y - minY) + "px").join(",") +
          ")";
        band.style.clipPath = clipPath;
        band.style.setProperty("-webkit-clip-path", clipPath);
        band.style.visibility = "visible";
        band.style.opacity = String(Math.min(0.76, closure * 0.72));
      }
    };

    const tangentAt = (points: RiftPoint[], index: number) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      return { tx: dx / length, ty: dy / length, nx: -dy / length, ny: dx / length };
    };

    const lowerLipCoordinates = (
      points: RiftPoint[],
      now: number,
      closure: number,
      lane: RiftLane,
      apertureScale = 1,
    ) => {
      const firstSide = sideCoordinates(points, -1, now, closure, lane, apertureScale);
      const secondSide = sideCoordinates(points, 1, now, closure, lane, apertureScale);
      return firstSide.map((point, index) =>
        point.y >= secondSide[index].y ? point : secondSide[index],
      );
    };

    const drawRiftWorld = (
      points: RiftPoint[],
      now: number,
      closure: number,
      lane: RiftLane,
    ) => {
      if (points.length < 3) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      const tail = points[0];
      const head = points[points.length - 1];
      ctx.save();
      fissureShape(points, now, closure, lane, 0.82);
      ctx.clip();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.96 * closure;

      // The cut reveals a distant indigo sky above a molten horizon. All
      // details are derived from stable point seeds, so the world never flickers.
      const world = ctx.createLinearGradient(0, minY - 12, 0, maxY + 18);
      world.addColorStop(0, "#020617");
      world.addColorStop(0.34, "#101b45");
      world.addColorStop(0.62, "#45205e");
      world.addColorStop(0.78, "#8d1f31");
      world.addColorStop(1, "#ff5b0a");
      ctx.fillStyle = world;
      ctx.fillRect(minX - 28, minY - 28, maxX - minX + 56, maxY - minY + 56);

      const nebulaX = head.x - (head.x - tail.x) * 0.28;
      const nebulaY = head.y - (head.y - tail.y) * 0.28;
      const nebulaRadius = Math.max(28, Math.min(96, Math.hypot(head.x - tail.x, head.y - tail.y) * 0.34));
      const nebula = ctx.createRadialGradient(
        nebulaX,
        nebulaY,
        0,
        nebulaX,
        nebulaY,
        nebulaRadius,
      );
      nebula.addColorStop(0, "rgba(91, 188, 255, 0.5)");
      nebula.addColorStop(0.38, "rgba(104, 72, 231, 0.3)");
      nebula.addColorStop(1, "rgba(38, 20, 92, 0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = nebula;
      ctx.fillRect(
        nebulaX - nebulaRadius,
        nebulaY - nebulaRadius,
        nebulaRadius * 2,
        nebulaRadius * 2,
      );

      ctx.beginPath();
      for (let index = 2; index < points.length - 1; index += 4) {
        const point = points[index];
        const { nx, ny } = tangentAt(points, index);
        const opening = pointOpening(point, now, closure);
        if (opening < 0.05) continue;
        const offset = (point.seed - 0.5) * (5 + point.power * 4) * opening;
        const parallax = Math.sin(now * 0.0014 + point.seed * 17) * 0.7;
        const x = point.x + nx * offset + parallax;
        const y = point.y + ny * offset - parallax * 0.4;
        const radius = (0.32 + point.seed * 0.55) * opening;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = "rgba(235, 247, 255, 0.9)";
      ctx.fill();

      ctx.beginPath();
      appendSmoothPath(lowerLipCoordinates(points, now, closure, lane, 0.4), true);
      ctx.strokeStyle = "rgba(255, 82, 18, " + 0.75 * closure + ")";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    };

    const drawMoltenLip = (
      points: RiftPoint[],
      now: number,
      closure: number,
      lane: RiftLane,
    ) => {
      const lowerLip = lowerLipCoordinates(points, now, closure, lane, 0.92);
      if (lowerLip.length < 2) return;
      const tail = lowerLip[0];
      const head = lowerLip[lowerLip.length - 1];
      const magma = ctx.createLinearGradient(tail.x, tail.y, head.x + 0.01, head.y + 0.01);
      magma.addColorStop(0, "rgba(101, 16, 17, 0)");
      magma.addColorStop(0.2, "rgba(151, 28, 20, 0.38)");
      magma.addColorStop(0.58, "rgba(255, 61, 6, 0.88)");
      magma.addColorStop(0.86, "rgba(255, 145, 24, 0.96)");
      magma.addColorStop(1, "rgba(255, 225, 113, 1)");

      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      appendSmoothPath(lowerLip, true);
      ctx.strokeStyle = magma;
      ctx.globalAlpha = 0.4 * closure;
      ctx.lineWidth = 11;
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      appendSmoothPath(lowerLip, true);
      ctx.strokeStyle = "rgba(48, 5, 9, " + 0.82 * closure + ")";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 5.8;
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      appendSmoothPath(lowerLip, true);
      ctx.strokeStyle = magma;
      ctx.globalAlpha = 0.94 * closure;
      ctx.lineWidth = 2.25;
      ctx.stroke();
    };

    const drawBranches = (points: RiftPoint[], now: number, closure: number) => {
      ctx.beginPath();
      for (let index = 4; index < points.length - 2; index += 6) {
        const point = points[index];
        if (point.seed < 0.55) continue;
        const opening = pointOpening(point, now, closure);
        if (opening < 0.04) continue;

        const { tx, ty, nx, ny } = tangentAt(points, index);
        const side = point.seed > 0.76 ? 1 : -1;
        const branchLength = (6 + point.seed * 9) * opening;
        const startX = point.x + nx * side * 3.5 * opening;
        const startY = point.y + ny * side * 3.5 * opening;
        ctx.moveTo(startX, startY);
        ctx.lineTo(
          startX + nx * side * branchLength + tx * (point.roughness + 0.7) * 3,
          startY + ny * side * branchLength + ty * (point.roughness + 0.7) * 3,
        );
      }
      ctx.strokeStyle = "rgba(211, 166, 255, " + 0.54 * closure + ")";
      ctx.lineWidth = Math.max(0.25, 0.78 * closure);
      ctx.stroke();
    };

    const drawFragments = (points: RiftPoint[], now: number, closure: number) => {
      ctx.beginPath();
      for (let index = 2; index < points.length; index += 4) {
        const point = points[index];
        if (point.seed < 0.4) continue;
        const opening = pointOpening(point, now, closure);
        if (opening < 0.04) continue;

        const { tx, ty, nx, ny } = tangentAt(points, index);
        const age = Math.max(0, now - point.born);
        const side = point.seed > 0.68 ? 1 : -1;
        const drift = Math.min(16, 4 + age * (0.013 + point.seed * 0.009));
        const x = point.x + nx * side * drift + tx * (point.seed - 0.5) * 6;
        const y = point.y + ny * side * drift + ty * (point.seed - 0.5) * 6;
        const radius = (0.4 + point.seed * 0.72) * opening;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = "rgba(246, 230, 255, " + 0.82 * closure + ")";
      ctx.fill();
    };

    const drawHeadFlare = (points: RiftPoint[], now: number, closure: number) => {
      if (points.length < 2) return;
      const headIndex = points.length - 1;
      const head = points[headIndex];
      const opening = pointOpening(head, now, closure);
      if (opening <= 0.02) return;

      const { tx, ty, nx, ny } = tangentAt(points, headIndex);
      const centerX = head.x + tx * 2.5;
      const centerY = head.y + ty * 2.5;
      const radius = (15 + head.power * 11) * opening;
      const flare = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 0.01);
      flare.addColorStop(0, "rgba(255, 253, 255, 0.98)");
      flare.addColorStop(0.12, "rgba(239, 207, 255, 0.9)");
      flare.addColorStop(0.36, "rgba(191, 116, 255, 0.48)");
      flare.addColorStop(0.68, "rgba(93, 151, 224, 0.2)");
      flare.addColorStop(1, "rgba(61, 92, 183, 0)");
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(centerX - tx * 9 * opening, centerY - ty * 9 * opening);
      ctx.lineTo(centerX + tx * 20 * opening, centerY + ty * 20 * opening);
      ctx.moveTo(centerX - nx * 8 * opening, centerY - ny * 8 * opening);
      ctx.lineTo(centerX + nx * 8 * opening, centerY + ny * 8 * opening);
      ctx.strokeStyle = "rgba(255, 245, 255, " + 0.9 * opening + ")";
      ctx.lineWidth = Math.max(0.3, 1.05 * opening);
      ctx.stroke();
    };

    const curtainOpening = (curtain: LavaCurtain, now: number) => {
      const closure = smoothstep(
        1 - Math.max(0, now - curtain.sourceStroke.lastMove - HOLD_TIME) / HEAL_DURATION,
      );
      return pointOpening(curtain.sourcePoint, now, closure);
    };

    const spawnLavaCurtain = (
      stroke: RiftStroke,
      point: RiftPoint,
      dx: number,
      dy: number,
      now: number,
    ) => {
      if (lavaCurtains.length >= MAX_LAVA_CURTAINS) return;
      if (
        lavaCurtains.some(
          (curtain) => Math.hypot(curtain.baseX - point.x, curtain.baseY - point.y) < 72,
        )
      ) {
        return;
      }

      const length = Math.hypot(dx, dy) || 1;
      const tx = dx / length;
      const ty = dy / length;
      const nx = -ty;
      const ny = tx;
      const lipSide: -1 | 1 = ny >= 0 ? 1 : -1;
      const seed = point.seed;
      const baseHalfWidth =
        (3.15 + point.power * 2.2) * CLAW_LANES[1].aperture * 0.92;
      const baseX = point.x;
      const baseY = point.y;
      const anchorX = baseX + nx * lipSide * baseHalfWidth;
      const anchorY = baseY + ny * lipSide * baseHalfWidth + 0.8;
      const horizontalScale = Math.abs(tx) < 0.35 ? 0.58 : 1;
      const curtainWidth = (40 + point.power * (36 + seed * 36)) * horizontalScale;

      lavaCurtains.push({
        sourcePoint: point,
        sourceStroke: stroke,
        baseX,
        baseY,
        tx,
        ty,
        nx,
        ny,
        lipSide,
        baseHalfWidth,
        anchorX,
        anchorY,
        born: now,
        drainAt: null,
        width: curtainWidth,
        targetLength: (108 + seed * 105 + point.power * 44) * (0.74 + horizontalScale * 0.26),
        sway: 3 + seed * 4.5,
        flowSpeed: 22 + seed * 23,
        filaments: 2 + (seed > 0.7 ? 1 : 0),
        seed,
        phase: seed * Math.PI * 2,
      });
      stroke.lavaCount += 1;
      canvas.style.visibility = "visible";
      canvas.style.opacity = "1";
    };

    const updateLavaCurtains = (now: number) => {
      for (let index = lavaCurtains.length - 1; index >= 0; index -= 1) {
        const curtain = lavaCurtains[index];
        const age = now - curtain.born;
        const opening = curtainOpening(curtain, now);
        const healing = now > curtain.sourceStroke.lastMove + HOLD_TIME;

        // Follow the molten lip only while it is visibly open. Once healing
        // begins, freeze the mouth so the waterfall drains vertically instead
        // of sliding sideways into the closing centre line.
        if (!healing && opening > 0.12) {
          const edge = curtain.baseHalfWidth * opening;
          curtain.anchorX = curtain.baseX + curtain.nx * curtain.lipSide * edge;
          curtain.anchorY = curtain.baseY + curtain.ny * curtain.lipSide * edge + 0.8;
        } else if (opening <= 0.12 && curtain.drainAt === null && age > 220) {
          curtain.drainAt = now;
        }

        if (curtain.drainAt === null && age > 2350) curtain.drainAt = now;
        if (curtain.drainAt !== null && now - curtain.drainAt > 820) {
          lavaCurtains.splice(index, 1);
        }
      }
    };

    const traceLavaCurtain = (geometry: LavaCurtainGeometry) => {
      const {
        leftTopX,
        leftTopY,
        rightTopX,
        rightTopY,
        leftBottomX,
        leftBottomY,
        rightBottomX,
        rightBottomY,
        bottomCenterX,
        bottomCenterY,
        bottomWidth,
        topCenterY,
        length,
        wave,
      } = geometry;
      ctx.beginPath();
      ctx.moveTo(leftTopX, leftTopY);
      ctx.bezierCurveTo(
        leftTopX - wave * 0.65,
        topCenterY + length * 0.18,
        leftBottomX - wave * 1.45,
        topCenterY + length * 0.46,
        leftBottomX - wave * 0.4,
        topCenterY + length * 0.62,
      );
      ctx.bezierCurveTo(
        leftBottomX + wave * 0.55,
        topCenterY + length * 0.76,
        leftBottomX - wave * 0.3,
        topCenterY + length * 0.9,
        leftBottomX,
        leftBottomY,
      );
      ctx.quadraticCurveTo(
        bottomCenterX - bottomWidth * 0.2,
        bottomCenterY + 17,
        bottomCenterX,
        bottomCenterY + 10,
      );
      ctx.quadraticCurveTo(
        bottomCenterX + bottomWidth * 0.24,
        bottomCenterY + 14,
        rightBottomX,
        rightBottomY,
      );
      ctx.bezierCurveTo(
        rightBottomX + wave * 0.3,
        topCenterY + length * 0.9,
        rightBottomX - wave * 0.55,
        topCenterY + length * 0.76,
        rightBottomX + wave * 0.4,
        topCenterY + length * 0.62,
      );
      ctx.bezierCurveTo(
        rightBottomX + wave * 1.45,
        topCenterY + length * 0.46,
        rightTopX + wave * 0.65,
        topCenterY + length * 0.18,
        rightTopX,
        rightTopY,
      );
      ctx.closePath();
    };

    const collectLavaWebGLCurtains = (now: number) => {
      lavaWebGLCurtains.length = 0;
      for (const curtain of lavaCurtains) {
        const age = now - curtain.born;
        const wetting = smoothstep(age / 180);
        const growth = smoothstep(age / (720 + curtain.seed * 240));
        const drainAge = curtain.drainAt === null ? 0 : now - curtain.drainAt;
        const drain = curtain.drainAt === null ? 0 : smoothstep(drainAge / 760);
        const fade = curtain.drainAt === null ? 1 : 1 - smoothstep((drainAge - 360) / 420);
        const opacity = wetting * fade;
        if (opacity <= 0.01) continue;

        const topSeal = curtain.drainAt === null ? 1 : 1 - smoothstep(drainAge / 320);
        const topWidth = Math.max(2, curtain.width * wetting * (0.18 + topSeal * 0.82));
        const length = curtain.targetLength * (0.08 + growth * 0.92) + drain * 34;
        const topX =
          curtain.anchorX + Math.sin(now * 0.0011 + curtain.phase) * curtain.sway * 0.35;
        const topY = curtain.anchorY + drain * 18;
        const wave = Math.sin(now * 0.00135 + curtain.phase) * curtain.sway;
        const bottomWidth =
          curtain.width *
          (0.72 + curtain.seed * 0.18 + Math.sin(now * 0.001 + curtain.phase * 1.7) * 0.065) *
          (1 - drain * 0.12);

        lavaWebGLCurtains.push({
          topX,
          topY,
          bottomX: topX + wave + (curtain.seed - 0.5) * 2,
          bottomY: topY + length,
          topWidth,
          bottomWidth,
          opacity,
          seed: curtain.seed,
          ageSeconds: Math.max(0, age / 1000),
          flowSpeed: curtain.flowSpeed,
          drain,
          heat: clamp01(0.76 + curtain.sourcePoint.power * 0.24),
          tangentX: curtain.tx,
          tangentY: curtain.ty,
        });
      }
      return lavaWebGLCurtains;
    };

    const updateLavaHeatRefractions = (
      curtains: readonly LavaWebGLCurtain[],
      now: number,
    ) => {
      for (let index = 0; index < MAX_LAVA_CURTAINS; index += 1) {
        const heat = heatRefractionRefs.current[index];
        const curtain = curtains[index];
        if (!heat || !curtain || curtain.opacity <= 0.02) {
          if (heat) {
            heat.style.opacity = "0";
            heat.style.visibility = "hidden";
          }
          continue;
        }

        const bandWidth = Math.max(curtain.topWidth, curtain.bottomWidth) * 1.68 + 30;
        const bandHeight = Math.max(24, curtain.bottomY - curtain.topY + 48);
        const centerX = (curtain.topX + curtain.bottomX) * 0.5;
        const shimmer = Math.sin(now * 0.0023 + curtain.seed * 14) * 2.2;
        heat.style.left = centerX - bandWidth * 0.5 + "px";
        heat.style.top = curtain.topY - 18 + "px";
        heat.style.width = bandWidth + "px";
        heat.style.height = bandHeight + "px";
        heat.style.transform =
          "translateX(" + shimmer + "px) skewX(" + (curtain.seed - 0.5) * 2.4 + "deg)";
        heat.style.visibility = "visible";
        heat.style.opacity = String(Math.min(0.24, curtain.opacity * 0.2));
      }
    };

    const drawLavaCurtains = (now: number) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const curtain of lavaCurtains) {
        const age = now - curtain.born;
        const wetting = smoothstep(age / 180);
        const growth = smoothstep(age / (720 + curtain.seed * 240));
        const drainAge = curtain.drainAt === null ? 0 : now - curtain.drainAt;
        const drain = curtain.drainAt === null ? 0 : smoothstep(drainAge / 760);
        const fade = curtain.drainAt === null ? 1 : 1 - smoothstep((drainAge - 360) / 420);
        const alpha = wetting * fade;
        if (alpha <= 0.01) continue;

        const topSeal = curtain.drainAt === null ? 1 : 1 - smoothstep(drainAge / 320);
        const topWidth = Math.max(2, curtain.width * wetting * (0.18 + topSeal * 0.82));
        const length = curtain.targetLength * (0.08 + growth * 0.92) + drain * 34;
        const topCenterX =
          curtain.anchorX + Math.sin(now * 0.0011 + curtain.phase) * curtain.sway * 0.35;
        const topCenterY = curtain.anchorY + drain * 18;
        const topVectorX = curtain.tx * topWidth * 0.5;
        const topVectorY = curtain.ty * topWidth * 0.18;
        const leftTopX = topCenterX - topVectorX;
        const leftTopY = topCenterY - topVectorY;
        const rightTopX = topCenterX + topVectorX;
        const rightTopY = topCenterY + topVectorY;
        const wave = Math.sin(now * 0.00135 + curtain.phase) * curtain.sway;
        const bottomWidth =
          curtain.width *
          (0.72 + curtain.seed * 0.18 + Math.sin(now * 0.001 + curtain.phase * 1.7) * 0.065) *
          (1 - drain * 0.12);
        const bottomCenterX = topCenterX + wave + (curtain.seed - 0.5) * 2;
        const bottomCenterY = topCenterY + length;
        const leftBottomX = bottomCenterX - bottomWidth * 0.5;
        const rightBottomX = bottomCenterX + bottomWidth * 0.5;
        const leftBottomY =
          bottomCenterY + Math.sin(curtain.phase * 2.3 + now * 0.0008) * 3.5;
        const rightBottomY =
          bottomCenterY + Math.sin(curtain.phase * 1.6 + 1.7 + now * 0.0009) * 3;
        const geometry: LavaCurtainGeometry = {
          leftTopX,
          leftTopY,
          rightTopX,
          rightTopY,
          leftBottomX,
          leftBottomY,
          rightBottomX,
          rightBottomY,
          bottomCenterX,
          bottomCenterY,
          bottomWidth,
          topCenterY,
          length,
          wave,
        };

        const body = ctx.createLinearGradient(0, topCenterY, 0, bottomCenterY + 8);
        body.addColorStop(0, "rgba(134, 17, 25, 0.98)");
        body.addColorStop(0.1, "rgba(255, 82, 9, 0.98)");
        body.addColorStop(0.5, "rgba(218, 39, 9, 0.96)");
        body.addColorStop(1, "rgba(103, 12, 23, 0.94)");

        ctx.globalCompositeOperation = "lighter";
        traceLavaCurtain(geometry);
        ctx.globalAlpha = 0.16 * alpha;
        ctx.fillStyle = "rgba(255, 58, 4, 1)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 80, 8, 0.5)";
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.globalCompositeOperation = "source-over";
        traceLavaCurtain(geometry);
        ctx.globalAlpha = 0.98 * alpha;
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = "rgba(55, 5, 11, " + 0.88 * alpha + ")";
        ctx.lineWidth = 2.6;
        ctx.stroke();

        // Clip moving hot filaments inside the broad red-orange curtain. The
        // dashed highlight phase travels downward slowly while the body stays
        // continuous, which reads as viscous flow instead of falling beads.
        ctx.save();
        traceLavaCurtain(geometry);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        for (let filament = 0; filament < curtain.filaments; filament += 1) {
          const fraction = (filament + 1) / (curtain.filaments + 1);
          const startX = leftTopX + (rightTopX - leftTopX) * fraction;
          const startY = leftTopY + (rightTopY - leftTopY) * fraction;
          const endX =
            bottomCenterX +
            (fraction - 0.5) * bottomWidth * 0.72 +
            Math.sin(now * 0.0017 + curtain.phase + filament) * 4.8;
          const endY = bottomCenterY + 2;
          const filamentWave = Math.sin(now * 0.0013 + curtain.phase + filament * 1.8) * 6;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.bezierCurveTo(
            startX + filamentWave,
            topCenterY + length * 0.32,
            endX - filamentWave,
            topCenterY + length * 0.72,
            endX,
            endY,
          );
          ctx.globalAlpha = 0.3 * alpha;
          ctx.strokeStyle = "rgba(255, 164, 34, 0.95)";
          ctx.lineWidth = Math.max(1.2, curtain.width / (curtain.filaments * 6.2));
          ctx.setLineDash([]);
          ctx.stroke();

          ctx.globalAlpha = 0.78 * alpha;
          ctx.strokeStyle = "rgba(255, 239, 150, 0.98)";
          ctx.lineWidth = Math.max(0.65, curtain.width / (curtain.filaments * 13));
          ctx.setLineDash([18 + curtain.seed * 10, 13 + (1 - curtain.seed) * 8]);
          ctx.lineDashOffset = -(age / 1000) * curtain.flowSpeed - filament * 11;
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();

        // A hot reservoir at the mouth keeps each sheet visibly connected to
        // the lower lip of the spacetime tear throughout the attached phase.
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.22 * alpha;
        ctx.beginPath();
        ctx.moveTo(leftTopX, leftTopY);
        ctx.lineTo(rightTopX, rightTopY);
        ctx.strokeStyle = "rgba(255, 76, 6, 1)";
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.92 * alpha;
        ctx.strokeStyle = "rgba(59, 5, 8, 1)";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.94 * alpha;
        ctx.strokeStyle = "rgba(255, 198, 70, 1)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    };

    const drawStroke = (stroke: RiftStroke, now: number) => {
      const points = stroke.points;
      if (points.length < 2) return;

      const idleFor = now - stroke.lastMove;
      const closure = smoothstep(1 - Math.max(0, idleFor - HOLD_TIME) / HEAL_DURATION);
      if (closure <= 0) return;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const lane of CLAW_LANES) {
        const cut = lanePoints(points, lane);
        if (cut.length < 2) continue;
        const tail = cut[0];
        const head = cut[cut.length - 1];

        const mist = ctx.createLinearGradient(tail.x, tail.y, head.x + 0.01, head.y + 0.01);
        mist.addColorStop(0, "rgba(56, 104, 186, 0)");
        mist.addColorStop(0.18, "rgba(80, 91, 205, 0.18)");
        mist.addColorStop(0.64, "rgba(151, 87, 237, 0.44)");
        mist.addColorStop(0.9, "rgba(224, 166, 255, 0.72)");
        mist.addColorStop(1, "rgba(250, 239, 255, 0.94)");

        const hotEdge = ctx.createLinearGradient(tail.x, tail.y, head.x + 0.01, head.y + 0.01);
        hotEdge.addColorStop(0, "rgba(113, 75, 207, 0)");
        hotEdge.addColorStop(0.18, "rgba(133, 78, 224, 0.34)");
        hotEdge.addColorStop(0.72, "rgba(218, 142, 255, 0.86)");
        hotEdge.addColorStop(1, "rgba(255, 249, 255, 1)");

        const coldEdge = ctx.createLinearGradient(tail.x, tail.y, head.x + 0.01, head.y + 0.01);
        coldEdge.addColorStop(0, "rgba(54, 77, 180, 0)");
        coldEdge.addColorStop(0.22, "rgba(82, 74, 203, 0.3)");
        coldEdge.addColorStop(0.74, "rgba(154, 98, 240, 0.78)");
        coldEdge.addColorStop(1, "rgba(236, 216, 255, 0.96)");

        // A broad blue-violet haze sits below the actual cut, matching the
        // diffuse atmospheric bloom in the reference without using blur.
        ctx.globalCompositeOperation = "lighter";
        fissureShape(cut, now, closure, lane, 4.8);
        ctx.fillStyle = mist;
        ctx.globalAlpha = 0.2 * lane.alpha * closure;
        ctx.fill();

        fissureShape(cut, now, closure, lane, 2.15);
        ctx.fillStyle = mist;
        ctx.globalAlpha = 0.34 * lane.alpha * closure;
        ctx.fill();

        // The narrow near-black core makes the trail read as a physical tear,
        // while the side lanes stay faint enough to remain one claw gesture.
        ctx.globalCompositeOperation = "source-over";
        fissureShape(cut, now, closure, lane, 0.9);
        ctx.fillStyle = "rgba(7, 3, 24, " + 0.92 * closure + ")";
        ctx.globalAlpha = lane.alpha;
        ctx.fill();

        if (lane.shift === 0) {
          drawRiftWorld(cut, now, closure, lane);
          drawMoltenLip(cut, now, closure, lane);
        }

        ctx.globalCompositeOperation = "lighter";
        edgePath(cut, -1, now, closure, lane);
        ctx.strokeStyle = hotEdge;
        ctx.lineWidth = Math.max(0.22, 1.2 * lane.alpha * closure);
        ctx.globalAlpha = 0.96 * closure;
        ctx.stroke();

        edgePath(cut, 1, now, closure, lane);
        ctx.strokeStyle = coldEdge;
        ctx.lineWidth = Math.max(0.2, 0.92 * lane.alpha * closure);
        ctx.globalAlpha = 0.86 * closure;
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1;
      drawBranches(points, now, closure);
      drawFragments(points, now, closure);
      drawHeadFlare(points, now, closure);
      ctx.restore();
    };

    const render = (now: number) => {
      if (now - lastFrame < FRAME_INTERVAL - 1) {
        frameId = window.requestAnimationFrame(render);
        return;
      }
      lastFrame = now;
      // Paint a fully transparent frame with `copy` rather than leaving
      // untouched backing-store tiles; this keeps alpha compositing stable
      // while moving magma extends far beyond the original crack geometry.
      ctx.save();
      ctx.globalCompositeOperation = "copy";
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      for (let index = strokes.length - 1; index >= 0; index -= 1) {
        const stroke = strokes[index];
        while (stroke.points.length && now - stroke.points[0].born > POINT_LIFETIME) {
          stroke.points.shift();
        }
        if (!stroke.points.length || now - stroke.lastMove > HOLD_TIME + HEAL_DURATION) {
          strokes.splice(index, 1);
          if (activeStroke === stroke) activeStroke = null;
        }
      }
      updateLavaCurtains(now);
      const currentLavaWebGLCurtains = collectLavaWebGLCurtains(now);
      updateLavaHeatRefractions(currentLavaWebGLCurtains, now);
      updateRefractions(now);

      if (!strokes.length && !lavaCurtains.length) {
        canvas.style.opacity = "0";
        canvas.style.visibility = "hidden";
        hideMagmaCanvas();
        hideRefractions();
        frameId = 0;
        return;
      }

      let lavaRenderedInWebGL = false;
      if (lavaRenderer && magmaCanvas && lavaCurtains.length) {
        lavaRenderedInWebGL =
          currentLavaWebGLCurtains.length > 0 &&
          lavaRenderer.render(currentLavaWebGLCurtains, now);
        magmaCanvas.style.opacity = lavaRenderedInWebGL ? "1" : "0";
        magmaCanvas.style.visibility = lavaRenderedInWebGL ? "visible" : "hidden";
      } else {
        hideMagmaCanvas();
      }
      if (!lavaRenderedInWebGL) drawLavaCurtains(now);
      for (const stroke of strokes) drawStroke(stroke, now);
      frameId = window.requestAnimationFrame(render);
    };

    const ensureAnimation = () => {
      if (!frameId && enabled) {
        lastFrame = performance.now() - FRAME_INTERVAL;
        frameId = window.requestAnimationFrame(render);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!enabled || (event.pointerType && event.pointerType !== "mouse")) return;

      const now = performance.now();
      const x = event.clientX;
      const y = event.clientY;
      const shouldRestart =
        !activeStroke ||
        !lastSample ||
        now - activeStroke.lastMove > RESTART_DELAY ||
        Math.hypot(x - lastSample.x, y - lastSample.y) > RESTART_DISTANCE;

      if (shouldRestart) {
        startStroke(x, y, now);
        ensureAnimation();
        return;
      }

      if (!activeStroke || !lastSample) return;
      const stroke = activeStroke;
      const sample = lastSample;
      const dx = x - sample.x;
      const dy = y - sample.y;
      const distance = Math.hypot(dx, dy);
      const elapsed = Math.max(8, now - sample.time);
      stroke.lastMove = now;
      if (distance < SAMPLE_DISTANCE) {
        ensureAnimation();
        return;
      }

      const velocity = distance / elapsed;
      const power = clamp01(0.44 + velocity * 0.42);
      const count = Math.min(20, Math.max(1, Math.floor(distance / SAMPLE_DISTANCE)));
      const newPoints: RiftPoint[] = [];
      for (let index = 1; index <= count; index += 1) {
        const progress = index / count;
        const point = makePoint(
          sample.x + dx * progress,
          sample.y + dy * progress,
          now - Math.min(24, (count - index) * (elapsed / count)),
          power,
        );
        stroke.points.push(point);
        newPoints.push(point);
      }

      stroke.lavaTravel += distance;
      let spawnedFromSegment = 0;
      while (
        stroke.lavaTravel >= stroke.nextLavaGap &&
        stroke.lavaCount < 3 &&
        lavaCurtains.length < MAX_LAVA_CURTAINS &&
        newPoints.length &&
        spawnedFromSegment < 1
      ) {
        stroke.lavaTravel -= stroke.nextLavaGap;
        stroke.nextLavaGap = 190 + Math.random() * 60;
        const sourceProgress = 0.76;
        const sourcePoint =
          newPoints[Math.min(newPoints.length - 1, Math.floor(newPoints.length * sourceProgress))];
        spawnLavaCurtain(stroke, sourcePoint, dx, dy, now);
        spawnedFromSegment += 1;
      }
      if (stroke.points.length > MAX_POINTS) {
        stroke.points.splice(0, stroke.points.length - MAX_POINTS);
      }
      lastSample = { x, y, time: now };
      ensureAnimation();
    };

    const releaseStroke = () => {
      if (activeStroke) activeStroke.lastMove = performance.now() - HOLD_TIME;
      activeStroke = null;
      lastSample = null;
      ensureAnimation();
    };

    const syncMotionPreference = () => {
      const nextEnabled = finePointer.matches && !reduceMotion.matches;
      if (nextEnabled === enabled) return;
      enabled = nextEnabled;
      if (enabled) {
        if (!lavaRenderer) lavaRenderer = makeLavaRenderer();
        resize();
      } else {
        releaseBackingStore();
        lavaRenderer?.destroy();
        lavaRenderer = null;
      }
    };

    const onResize = () => {
      if (enabled) resize();
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearCanvas();
    };

    if (enabled) resize();
    else releaseBackingStore();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", clearCanvas, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointercancel", releaseStroke);
    window.addEventListener("blur", releaseStroke);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.documentElement.addEventListener("mouseleave", releaseStroke);
    reduceMotion.addEventListener("change", syncMotionPreference);
    finePointer.addEventListener("change", syncMotionPreference);

    return () => {
      releaseBackingStore();
      lavaRenderer?.destroy();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", clearCanvas);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointercancel", releaseStroke);
      window.removeEventListener("blur", releaseStroke);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.documentElement.removeEventListener("mouseleave", releaseStroke);
      reduceMotion.removeEventListener("change", syncMotionPreference);
      finePointer.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  return (
    <>
      <div className="mouse-rift-refractions" aria-hidden="true">
        {Array.from({ length: MAX_STROKES }, (_, index) => (
          <span
            key={index}
            ref={(node) => {
              refractionRefs.current[index] = node;
            }}
            className="mouse-rift-refraction"
          />
        ))}
        {Array.from({ length: MAX_LAVA_CURTAINS }, (_, index) => (
          <span
            key={"heat-" + index}
            ref={(node) => {
              heatRefractionRefs.current[index] = node;
            }}
            className="mouse-rift-heat"
          />
        ))}
      </div>
      <canvas ref={magmaCanvasRef} className="mouse-rift-lava" aria-hidden="true" />
      <canvas ref={canvasRef} className="mouse-rift" aria-hidden="true" />
    </>
  );
}
