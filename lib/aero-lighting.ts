// Collapse only the three diffuse light layers; keep the photo and all sharp
// glass objects in their original DOM/CSS at the device's full resolution.
export function cacheAeroLighting(root: HTMLElement) {
  if (
    !window.Worker ||
    !window.OffscreenCanvas ||
    !HTMLCanvasElement.prototype.transferControlToOffscreen
  )
    return () => {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let stop = () => {};
  const start = () => {
    stop();
    if (reduced.matches) return;
    const originals = [".aero-sun", ".aero-clouds", ".aero-lightwash"].map(
      (selector) => root.querySelector<HTMLElement>(selector)!,
    );
    const epoch = performance.timeOrigin + performance.now();
    const started = originals.map((element) => {
      const current = element.getAnimations()[0]?.currentTime;
      return epoch - (typeof current === "number" ? current : 0);
    });
    const canvas = document.createElement("canvas");
    canvas.className = "aero-light-cache";
    canvas.setAttribute("aria-hidden", "true");
    let worker: Worker | undefined;
    let readyFrame = 0,
      resizeFrame = 0;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const configuration = () => ({
      width: root.clientWidth,
      height: root.clientHeight,
      viewportWidth: innerWidth,
      dpr: devicePixelRatio,
      dark: document.documentElement.dataset.theme === "dark",
    });
    const configure = () => {
      if (disposed) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        worker?.postMessage({
          type: "configure",
          configuration: configuration(),
        });
      });
    };
    const visibility = () =>
      worker?.postMessage({ type: "visibility", hidden: document.hidden });
    const observer = new MutationObserver(configure);
    const bounds = new ResizeObserver(configure);
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      worker = undefined;
      cancelAnimationFrame(readyFrame);
      cancelAnimationFrame(resizeFrame);
      clearTimeout(timeout);
      observer.disconnect();
      bounds.disconnect();
      window.removeEventListener("resize", configure);
      document.removeEventListener("visibilitychange", visibility);
      root.classList.remove("has-light-cache");
      canvas.remove();
    };
    stop = cleanup;
    try {
      // Leave the CSS version visible until the worker has presented its cache.
      root.insertBefore(canvas, originals[0]);
      worker = new Worker("/effects/aero-lighting.worker.js");
      const offscreen = canvas.transferControlToOffscreen();
      worker.onmessage = ({ data }) => {
        if (disposed) return;
        if (data.type === "fallback") cleanup();
        else if (data.type === "ready") {
          clearTimeout(timeout);
          readyFrame = requestAnimationFrame(() => {
            if (!disposed) root.classList.add("has-light-cache");
          });
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        cleanup();
      };
      worker.postMessage(
        {
          type: "init",
          canvas: offscreen,
          configuration: configuration(),
          started,
        },
        [offscreen],
      );
      timeout = setTimeout(cleanup, 5000);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      bounds.observe(root);
      window.addEventListener("resize", configure, { passive: true });
      document.addEventListener("visibilitychange", visibility);
      if (document.hidden) visibility();
    } catch {
      cleanup();
    }
  };
  start();
  reduced.addEventListener("change", start);
  return () => {
    reduced.removeEventListener("change", start);
    stop();
  };
}
