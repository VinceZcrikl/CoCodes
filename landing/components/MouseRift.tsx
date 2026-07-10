"use client";

import { useEffect, useRef } from "react";

const FRAME_INTERVAL = 1000 / 60;
const HOLD_TIME = 150;
const HEAL_DURATION = 1050;
const POINT_LIFETIME = HOLD_TIME + HEAL_DURATION + 220;
const SAMPLE_DISTANCE = 5;
// Keep one gesture alive through brief event throttling (for example when the
// main thread is busy); large pointer teleports are still split by distance.
const RESTART_DELAY = 280;
const RESTART_DISTANCE = 240;
const MAX_STROKES = 4;
const MAX_POINTS = 94;
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
  const refractionRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(any-pointer: fine)");
    let enabled = finePointer.matches && !reduceMotion.matches;
    let width = 0;
    let height = 0;
    let frameId = 0;
    let lastFrame = performance.now();
    let activeStroke: RiftStroke | null = null;
    let lastSample: { x: number; y: number; time: number } | null = null;
    const strokes: RiftStroke[] = [];
    const lavaCurtains: LavaCurtain[] = [];

    const hideRefractions = () => {
      for (const refraction of refractionRefs.current) {
        if (!refraction) continue;
        refraction.style.opacity = "0";
        refraction.style.visibility = "hidden";
        refraction.style.clipPath = "none";
        refraction.style.setProperty("-webkit-clip-path", "none");
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
        nextLavaGap: 72 + Math.random() * 38,
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
      ctx.globalAlpha = 0.3 * closure;
      ctx.lineWidth = 5.5;
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      appendSmoothPath(lowerLip, true);
      ctx.strokeStyle = "rgba(48, 5, 9, " + 0.82 * closure + ")";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      appendSmoothPath(lowerLip, true);
      ctx.strokeStyle = magma;
      ctx.globalAlpha = 0.94 * closure;
      ctx.lineWidth = 1.08;
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
      const curtainWidth = (24 + point.power * (20 + seed * 24)) * horizontalScale;

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
        targetLength: (86 + seed * 92 + point.power * 30) * (0.74 + horizontalScale * 0.26),
        sway: 1.5 + seed * 3.2,
        flowSpeed: 22 + seed * 23,
        filaments: 2 + (seed > 0.5 ? 1 : 0) + (curtainWidth > 48 ? 1 : 0),
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

        // Follow the molten lip only while it is visibly open. Once healing
        // begins, freeze the mouth so the waterfall drains vertically instead
        // of sliding sideways into the closing centre line.
        if (opening > 0.12) {
          const edge = curtain.baseHalfWidth * opening;
          curtain.anchorX = curtain.baseX + curtain.nx * curtain.lipSide * edge;
          curtain.anchorY = curtain.baseY + curtain.ny * curtain.lipSide * edge + 0.8;
        } else if (curtain.drainAt === null && age > 220) {
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
        leftTopX - wave * 0.18,
        topCenterY + length * 0.24,
        leftBottomX - wave,
        topCenterY + length * 0.7,
        leftBottomX,
        leftBottomY,
      );
      ctx.quadraticCurveTo(
        bottomCenterX - bottomWidth * 0.2,
        bottomCenterY + 7,
        bottomCenterX,
        bottomCenterY + 2,
      );
      ctx.quadraticCurveTo(
        bottomCenterX + bottomWidth * 0.24,
        bottomCenterY + 5,
        rightBottomX,
        rightBottomY,
      );
      ctx.bezierCurveTo(
        rightBottomX + wave,
        topCenterY + length * 0.7,
        rightTopX + wave * 0.18,
        topCenterY + length * 0.24,
        rightTopX,
        rightTopY,
      );
      ctx.closePath();
    };

    const drawMagmaDrops = (now: number) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const drop of magmaDrops) {
        const age = now - drop.born;
        const anchor = magmaAnchor(drop, now);
        const dieAt = (drop.detachedAt ?? drop.born + drop.detachAfter) + drop.postLife;
        const appear = smoothstep(age / 80);
        const fade = 1 - smoothstep((now - (dieAt - 210)) / 210);
        const alpha = appear * fade;
        if (alpha <= 0.01) continue;
        const normalizedAge = clamp01(age / Math.max(1, dieAt - drop.born));
        const heat =
          clamp01(1 - normalizedAge * 0.72) *
          (0.92 + Math.sin(now * 0.018 + drop.phase) * 0.08);

        if (drop.detachedAt === null) {
          strokeMagmaPath(drop, anchor.x, anchor.y, drop.x, drop.y, alpha, heat);
        } else {
          const detachAge = now - drop.detachedAt;
          if (detachAge < 120) {
            const retract = smoothstep(detachAge / 120);
            const neckX = drop.detachX + (anchor.x - drop.detachX) * retract;
            const neckY = drop.detachY + (anchor.y - drop.detachY) * retract;
            strokeMagmaPath(
              drop,
              anchor.x,
              anchor.y,
              neckX,
              neckY,
              alpha * (1 - retract),
              heat,
              0.76,
            );
          }

          const tailX = drop.x - drop.vx * 0.03;
          const tailY = drop.y - Math.max(8, drop.vy * 0.12);
          strokeMagmaPath(drop, tailX, tailY, drop.x, drop.y, alpha, heat, 0.72);
        }

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255, 54, 4, " + 0.18 * alpha + ")";
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.radius * 2.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(45, 7, 4, " + 0.94 * alpha + ")";
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.radius * 1.38, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255, 73, 7, " + 0.96 * alpha + ")";
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 230, 115, " + 0.92 * heat * alpha + ")";
        ctx.beginPath();
        ctx.arc(
          drop.x - drop.radius * 0.22,
          drop.y - drop.radius * 0.24,
          drop.radius * 0.34,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
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
      updateMagmaDrops(now);
      updateRefractions(now);

      if (!strokes.length && !magmaDrops.length) {
        canvas.style.opacity = "0";
        canvas.style.visibility = "hidden";
        hideRefractions();
        frameId = 0;
        return;
      }

      for (const stroke of strokes) drawStroke(stroke, now);
      drawMagmaDrops(now);
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

      stroke.magmaTravel += distance;
      let spawnedFromSegment = 0;
      while (
        stroke.magmaTravel >= stroke.nextMagmaGap &&
        stroke.magmaCount < 8 &&
        magmaDrops.length < MAX_MAGMA_DROPS &&
        newPoints.length &&
        spawnedFromSegment < 2
      ) {
        stroke.magmaTravel -= stroke.nextMagmaGap;
        stroke.nextMagmaGap = 28 + Math.random() * 14;
        const sourceProgress = spawnedFromSegment === 0 ? 0.42 : 0.78;
        const sourcePoint =
          newPoints[Math.min(newPoints.length - 1, Math.floor(newPoints.length * sourceProgress))];
        spawnMagmaDrop(stroke, sourcePoint, dx, dy, now);
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
      if (enabled) resize();
      else releaseBackingStore();
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
      </div>
      <canvas ref={canvasRef} className="mouse-rift" aria-hidden="true" />
    </>
  );
}
