/* The three existing CSS light gradients, cached and composited off the UI thread.
   Keep colors, bounds, easing and durations in sync with globals.css. No WebGL. */
let canvas, context, configuration;
let frame = 0;
let started = [];
let pausedAt = 0;
let ready = false;
let lastPaint = -Infinity;
// The fields drift only a few pixels per second; at 15 Hz their worst-case
// color change between cached frames is below one 8-bit channel step. The
// foreground, pointer, planets and browser compositor remain uncapped.
const LIGHT_INTERVAL = 1000 / 15;
let cacheKey = "";
let layers;

function surface(width, height) {
  return new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
}
function radial(target, x, y, rx, ry, stops) {
  const ctx = target.getContext("2d");
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [position, color] of stops) gradient.addColorStop(position, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(-x / rx, -y / ry, target.width / rx, target.height / ry);
  ctx.restore();
}
function prepare({ width, height, viewportWidth, dark }) {
  const diameter = viewportWidth * 0.65;
  const sun = surface(diameter, diameter);
  const radius = diameter * Math.SQRT1_2;
  radial(sun, diameter / 2, diameter / 2, radius, radius, [
    [0, "#fff9"],
    [0.45, "#ffffff12"],
    [0.65, "#fff0"],
  ]);
  const clouds = surface(width, height);
  // CSS paints the first gradient last, so build these from back to front.
  for (const [x, y, rx, ry, color] of [
    [0.7, 0.36, 0.25, 0.05, "#ffffff7a"],
    [0.89, 0.32, 0.28, 0.06, "#ffffffac"],
    [0.19, 0.21, 0.26, 0.07, "#ffffffa1"],
    [0.12, 0.17, 0.22, 0.06, "#ffffffd4"],
  ]) {
    radial(clouds, width * x, height * y, width * rx, height * ry, [
      [0, color],
      [0.99, "#fff0"],
    ]);
  }
  const wash = surface(width, height);
  radial(
    wash,
    width * 0.5,
    height * 0.38,
    width * Math.SQRT1_2,
    height * 0.62 * Math.SQRT2,
    dark
      ? [
          [0, "#064966b5"],
          [0.36, "#06496655"],
          [0.7, "#06496600"],
        ]
      : [
          [0, "#e7fbffb8"],
          [0.3, "#dbfaff70"],
          [0.68, "#dbfaff00"],
        ],
  );
  return { sun, clouds, wash };
}
// CSS ease-in-out: cubic-bezier(.42, 0, .58, 1), including alternate direction.
function ease(value) {
  let low = 0,
    high = 1,
    t = value;
  for (let i = 0; i < 14; i++) {
    t = (low + high) / 2;
    const x =
      3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t ** 2 * 0.58 + t ** 3;
    if (x < value) low = t;
    else high = t;
  }
  return 3 * (1 - t) * t ** 2 + t ** 3;
}
function progress(elapsed, duration, reverse = false) {
  let value = Math.max(0, elapsed / duration) % 2;
  if (value > 1) value = 2 - value;
  return ease(reverse ? 1 - value : value);
}
function draw(time) {
  frame = 0;
  if (pausedAt) return;
  if (time - lastPaint < LIGHT_INTERVAL - 1) {
    frame = requestAnimationFrame(draw);
    return;
  }
  lastPaint = time;
  const { width, height, viewportWidth, dpr, dark } = configuration;
  const pixelWidth = Math.round(width * dpr),
    pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const key = `${width}:${height}:${viewportWidth}:${dark}`;
  if (cacheKey !== key) {
    layers = prepare(configuration);
    cacheKey = key;
  }
  const epoch = time + performance.timeOrigin;
  const sun = progress(epoch - started[0], 24000, true);
  const cloud = progress(epoch - started[1], 38000);
  const wash = progress(epoch - started[2], 19000);
  context.resetTransform();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(dpr, dpr);
  const diameter = viewportWidth * 0.65;
  context.save();
  context.globalAlpha = 0.8 + 0.2 * sun;
  context.translate(
    width * 1.05 - diameter / 2 + (-0.03 + 0.06 * sun) * diameter,
    -height * 0.16 + diameter / 2 + (-0.02 + 0.04 * sun) * diameter,
  );
  context.scale(1 + 0.06 * sun, 1 + 0.06 * sun);
  context.drawImage(
    layers.sun,
    -diameter / 2,
    -diameter / 2,
    diameter,
    diameter,
  );
  context.restore();
  context.save();
  context.globalAlpha = dark ? 0.16 : 0.3;
  context.drawImage(
    layers.clouds,
    (-0.04 + 0.08 * cloud) * width,
    0.02 * cloud * height,
    width,
    height,
  );
  context.restore();
  context.save();
  context.globalAlpha = 0.8 + 0.2 * wash;
  context.translate(
    width / 2 + (-0.03 + 0.06 * wash) * width,
    height / 2 + (-0.02 + 0.04 * wash) * height,
  );
  context.scale(1 + 0.06 * wash, 1 + 0.06 * wash);
  context.drawImage(layers.wash, -width / 2, -height / 2, width, height);
  context.restore();
  if (!ready) {
    ready = true;
    // Give the first canvas frame a presentation opportunity before hiding CSS.
    frame = requestAnimationFrame((next) => {
      self.postMessage({ type: "ready" });
      draw(next);
    });
  } else frame = requestAnimationFrame(draw);
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      canvas = data.canvas;
      configuration = data.configuration;
      canvas.addEventListener(
        "contextlost",
        () => {
          cancelAnimationFrame(frame);
          self.postMessage({ type: "fallback" });
        },
        { once: true },
      );
      started = data.started;
      context = canvas.getContext("2d", { alpha: true });
      if (!context || typeof requestAnimationFrame !== "function")
        throw Error("Unsupported background cache");
      frame = requestAnimationFrame(draw);
    } else if (data.type === "configure") {
      configuration = data.configuration;
      lastPaint = -Infinity;
    } else if (data.type === "visibility") {
      const now = performance.timeOrigin + performance.now();
      if (data.hidden && !pausedAt) {
        pausedAt = now;
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!data.hidden && pausedAt) {
        started = started.map((start) => start + now - pausedAt);
        pausedAt = 0;
        lastPaint = -Infinity;
        if (!frame) frame = requestAnimationFrame(draw);
      }
    }
  } catch {
    self.postMessage({ type: "fallback" });
  }
};
