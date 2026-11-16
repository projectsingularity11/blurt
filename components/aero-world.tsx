"use client";

import { useEffect, useRef } from "react";
import { playCue } from "@/lib/audio";
import { cacheAeroLighting } from "@/lib/aero-lighting";

// Thin-film sphere styling is adapted from Visnalize/makeaero (MIT).
// The droplet and spring-trailing cursor adapt Frutiger.js (MIT).
const bubbles = [
  [7, 18, 146],
  [92, 16, 108],
  [3, 65, 74],
  [94, 72, 155],
  [18, 87, 53],
  [82, 88, 67],
  [28, 8, 35],
  [74, 9, 49],
  [43, 89, 27],
  [60, 13, 24],
  [12, 46, 31],
  [89, 44, 38],
];
export function AeroWorld() {
  const world = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => world.current ? cacheAeroLighting(world.current) : undefined, []);
  const cursor = useRef<HTMLDivElement>(null);
  const effects = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = field.current;
    if (!root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const shells = [...root.querySelectorAll<HTMLElement>(".bubble-shell")];
    const states = shells.map((el) => ({
      el,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      cx: 0,
      cy: 0,
      r: 0,
      popped: false,
    }));
    let frame = 0,
      last = 0,
      movedAt = -10000,
      activeCard: HTMLElement | null = null;
    let cardBounds: DOMRect | null = null;
    const point = { x: -100, y: -100 },
      tail = { x: -100, y: -100 };
    const measure = () => {
      for (const b of states) {
        b.el.style.transform = "";
        const r = b.el.getBoundingClientRect();
        b.cx = r.x + r.width / 2;
        b.cy = r.y + r.height / 2;
        b.r = r.width / 2;
        b.x = b.y = b.vx = b.vy = 0;
      }
    };
    measure();
    const animate = (time: number) => {
      const dt = Math.min((time - last) / 1000 || 1 / 60, 1 / 30);
      last = time;
      let settling = false;
      const moving = time - movedAt < 220;
      if (cursor.current && fine.matches && !reduced.matches) {
        tail.x += (point.x - tail.x) * 0.22;
        tail.y += (point.y - tail.y) * 0.22;
        cursor.current.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
        const wake = cursor.current.firstElementChild as HTMLElement;
        const dx = tail.x - point.x,
          dy = tail.y - point.y;
        wake.style.transform = `translate3d(${dx}px,${dy}px,0) scale(${1 + Math.min(Math.hypot(dx, dy) / 55, 0.65)})`;
        settling = Math.abs(dx) + Math.abs(dy) > 0.2;
      }
      for (const b of states) {
        const dx = b.cx - point.x,
          dy = b.cy - point.y,
          d = Math.hypot(dx, dy) || 1;
        const force =
          moving && !b.popped ? Math.max(0, 1 - d / (b.r + 135)) * 65 : 0;
        b.vx += (((dx / d) * force - b.x) * 135 - b.vx * 20) * dt;
        b.vy += (((dy / d) * force - b.y) * 135 - b.vy * 20) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (
          Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.vx) + Math.abs(b.vy) >
          0.08
        ) {
          b.el.style.transform = `translate3d(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px,0)`;
          settling = true;
        }
      }
      if ((moving || settling) && !document.hidden && !reduced.matches)
        frame = requestAnimationFrame(animate);
      else frame = 0;
    };
    const kick = () => {
      if (!frame && !document.hidden && !reduced.matches) {
        last = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !fine.matches || reduced.matches) return;
      if (!(e.target instanceof Element)) return;
      point.x = e.clientX;
      point.y = e.clientY;
      movedAt = performance.now();
      cursor.current?.classList.add("visible");
      const card = (e.target as Element).closest<HTMLElement>(".mode-card");
      if (activeCard !== card) {
        if (activeCard) {
          activeCard.style.removeProperty("--tilt-x");
          activeCard.style.removeProperty("--tilt-y");
        }
        activeCard = card;
        cardBounds = card?.getBoundingClientRect() || null;
      }
      if (card && cardBounds) {
        const r = cardBounds;
        card.style.setProperty(
          "--tilt-x",
          `${(0.5 - (e.clientY - r.top) / r.height) * 5}deg`,
        );
        card.style.setProperty(
          "--tilt-y",
          `${((e.clientX - r.left) / r.width - 0.5) * 5}deg`,
        );
      }
      kick();
    };
    const pop = (b: (typeof states)[number]) => {
      if (b.popped) return;
      b.popped = true;
      playCue("pop");
      const sphere = b.el.firstElementChild as HTMLElement;
      if (!reduced.matches)
        sphere.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: "scale(1.13)", opacity: 0.85, offset: 0.3 },
            { transform: "scale(1.28)", opacity: 0 },
          ],
          { duration: 270, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
      const burst = document.createElement("span");
      burst.className = "bubble-burst";
      b.el.append(burst);
      for (let i = 0; i < 7; i++) {
        const drop = document.createElement("i");
        drop.style.setProperty("--angle", `${(i * 360) / 7}deg`);
        drop.style.setProperty("--travel", `${b.r * 0.85}px`);
        burst.append(drop);
      }
      sphere.style.opacity = "0";
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!root.isConnected) return;
        burst.remove();
        sphere.style.opacity = "";
        if (!reduced.matches)
          sphere.animate(
            [
              { transform: "scale(.2)", opacity: 0 },
              { transform: "scale(1)", opacity: 1 },
            ],
            { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
        b.popped = false;
      }, 1900);
      timers.add(timer);
    };
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const click = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const target = e.target;
      const control = target.closest("button,a,summary");
      if (control && !control.hasAttribute("disabled")) playCue("click");
      if (
        !control &&
        !target.closest(
          "input,select,form,.mode-card,.solo-panel,.daily-layout,.party-center,.lobby-panel,.form-panel",
        )
      ) {
        const hit = states.find((b) => {
          const r = b.el.firstElementChild!.getBoundingClientRect();
          return (
            Math.hypot(
              r.x + r.width / 2 - e.clientX,
              r.y + r.height / 2 - e.clientY,
            ) <
            r.width / 2
          );
        });
        if (hit) pop(hit);
      }
      if (reduced.matches) return;
      // Two high-resolution CSS rings and four specular droplets, bounded to one short burst.
      const ripple = document.createElement("span");
      ripple.className = "water-click";
      ripple.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
      ripple.innerHTML = "<i></i><i></i><b></b><b></b><b></b><b></b>";
      effects.current?.append(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), {
        once: true,
      });
    };
    const leave = () => cursor.current?.classList.remove("visible");
    const visibility = () => {
      document.documentElement.toggleAttribute("data-page-hidden", document.hidden);
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else kick();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("resize", measure);
    document.addEventListener("click", click);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      document.documentElement.removeAttribute("data-page-hidden");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("resize", measure);
      document.removeEventListener("click", click);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <>
      <div className="aero-world" ref={world} aria-hidden="true">
        <div className="aero-sun" />
        <div className="aero-clouds" />
        <div className="aero-lightwash" />
        <div className="orbital-garden">
          <i className="glass-planet planet-pink"><b /></i>
          <i className="glass-planet planet-lime"><b /></i>
          <i className="chrome-orbit orbit-one" />
          <i className="chrome-orbit orbit-two" />
          <i className="aero-star star-one" />
          <i className="aero-star star-two" />
          <i className="aero-star star-three" />
        </div>
      </div>
      <div className="aero-bubbles" ref={field} aria-hidden="true">
        {bubbles.map(([x, y, size], i) => (
          <div
            className="bubble-shell"
            key={i}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `clamp(${size * 0.65}px,${size / 14.4}vw,${size}px)`,
              animationDelay: `${-i * 1.9}s`,
            }}
          >
            <div className="soap-bubble">
              <span className="bubble-specular" />
              <span className="bubble-window" />
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-effects" ref={effects}>
        <div className="water-cursor" ref={cursor} aria-hidden="true">
          <span className="water-wake" />
          <svg width="22" height="26" viewBox="0 0 24 26" fill="none">
            <defs>
              <radialGradient id="aero-cursor-drop" cx="35%" cy="30%" r="65%">
                <stop stopColor="#fff" />
                <stop offset=".35" stopColor="#ffd2ea" />
                <stop offset=".7" stopColor="#f90083" />
                <stop offset="1" stopColor="#a60062" />
              </radialGradient>
            </defs>
            <path
              d="M12 2.5S5.5 10.5 5.5 15.5a6.5 6.5 0 0 0 13 0C18.5 10.5 12 2.5 12 2.5Z"
              fill="url(#aero-cursor-drop)"
              stroke="#fff"
              strokeWidth="1.2"
            />
            <ellipse
              cx="9.5"
              cy="13"
              rx="2"
              ry="3"
              transform="rotate(-25 9.5 13)"
              fill="#ffffffb8"
            />
          </svg>
        </div>
      </div>
    </>
  );
}
