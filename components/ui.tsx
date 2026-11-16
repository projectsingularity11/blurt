"use client";
import { useEffect, useRef, useState } from "react";
import {
  Moon,
  Sun,
  Volume2,
  VolumeX,
  X,
  ArrowLeft,
  ArrowUpRight,
  Check,
  HelpCircle,
} from "lucide-react";
import { Link } from "next-view-transitions";
import type { Guess, Member, PictureCredit } from "@/lib/types";
import { playCue } from "@/lib/audio";
import { ranking } from "@/lib/rules";
export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "wordmark small" : "wordmark"}>
      <img src="/brand/bloom.webp" alt="" className="wordmark-emblem" />
      blurt<span>.</span>
    </span>
  );
}
export function Button({
  className = "",
  variant = "primary",
  onPointerDown,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      className={`button fj-button fj-button--aero ${variant} ${className}`}
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        const guess = event.currentTarget
          .closest("form")
          ?.querySelector<HTMLInputElement>("input[data-guess-input]");
        if (guess && !event.defaultPrevented) {
          event.preventDefault();
          guess.focus({ preventScroll: true });
        }
      }}
    >
      <span className="button-content">{children}</span>
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const input = useRef<HTMLInputElement>(null);
  const guess =
    props["aria-label"] === "Your guess" || !!props.id?.endsWith("-guess");
  useEffect(() => {
    if (!guess || props.disabled) return;
    const frame = requestAnimationFrame(() =>
      input.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [guess, props.disabled]);
  return (
    <input
      className="text-input"
      {...props}
      ref={input}
      data-guess-input={guess || undefined}
      disabled={guess ? false : props.disabled}
      readOnly={props.readOnly || (guess && props.disabled)}
      aria-busy={(guess && props.disabled) || undefined}
      aria-disabled={(guess && props.disabled) || undefined}
    />
  );
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="text-input" {...props} />;
}
export function Dialog({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-top">
        <h2 id="dialog-title">{title}</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function ThemeControl() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const change = () => {
      if (!localStorage.getItem("blurt-theme")) {
        document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
        setDark(mq.matches);
      }
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  return (
    <IconButton
      label={dark ? "Use light theme" : "Use dark theme"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? "dark" : "light";
        localStorage.setItem("blurt-theme", next ? "dark" : "light");
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
export function Controls() {
  const [sound, setSound] = useState(true);
  useEffect(() => setSound(localStorage.getItem("blurt-sound") !== "off"), []);
  return (
    <div className="corner-controls">
      <IconButton
        label={sound ? "Mute sound" : "Enable sound"}
        onClick={() => {
          const next = !sound;
          setSound(next);
          localStorage.setItem("blurt-sound", next ? "on" : "off");
          if (next) playTone();
        }}
      >
        {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </IconButton>
      <span className="control-divider" />
      <ThemeControl />
    </div>
  );
}
export function playTone() {
  playCue("success");
}
export function Help() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="help" onClick={() => setOpen(true)}>
        <HelpCircle size={16} />
        How to play
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="A little clearer"
      >
        <p>Guess the picture as each reveal makes it clearer</p>
        <div className="how-stages">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} style={{ opacity: 0.18 + n * 0.16 }}>
              {n}
            </span>
          ))}
        </div>
        <p className="muted">
          Daily Bloom brings you one new picture every day
        </p>
        <p className="muted">
          Petal Party lets 2–8 friends race to guess the same picture
        </p>
        <p className="muted">
          Free Bloom is untimed practice and Flash Bloom is a 90-second streak
          run
        </p>
        <Button onClick={() => setOpen(false)}>
          Got it <ArrowUpRight size={16} />
        </Button>
      </Dialog>
    </>
  );
}
export function Header({ label }: { label: string }) {
  return (
    <header className="game-header">
      <Link href="/" className="back" aria-label="Back to menu">
        <ArrowLeft size={18} />
        <Wordmark small />
      </Link>
      <span className="header-label">{label}</span>
      <Controls />
    </header>
  );
}
export function StageIndicator({
  stage,
  done = false,
}: {
  stage: number;
  done?: boolean;
}) {
  return (
    <div className="stage-row">
      <div className="stage-track" aria-label={`Reveal ${stage} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`${n <= stage ? "filled" : ""} ${n === stage ? "current" : ""}`}
          >
            {done && n === stage ? <Check size={12} /> : null}
          </span>
        ))}
      </div>
      <span>{done ? "Picture revealed" : `Reveal ${stage} of 5`}</span>
    </div>
  );
}
export function PuzzleFrame({
  src,
  stage,
  answer,
}: {
  src: string;
  stage: number;
  answer?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className="puzzle-frame">
      {failed ? (
        <div className="image-error">
          <p>Picture unavailable</p>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setRetry((v) => v + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <img
          key={`${src}-${retry}`}
          src={`${src}&retry=${retry}`}
          alt={answer || `Mystery picture, reveal ${stage} of 5`}
          className={answer ? "revealed-image" : "pixel-image"}
          onError={() => setFailed(true)}
        />
      )}
      <span className="picture-corner">
        {answer ? "THE REVEAL" : "LOOK CLOSER"}
      </span>
    </div>
  );
}
export function GuessHistory({ guesses }: { guesses: Guess[] }) {
  return (
    <ol className="guess-history" aria-label="Your guesses">
      {guesses.map((g, i) => (
        <li key={i}>
          <span className="guess-number">0{g.stage}</span>
          <span>{g.text || "Skipped"}</span>
          <span className={g.correct ? "success" : "muted"}>
            {g.correct ? "Got it" : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}
export function PlayerList({
  members,
  me,
  host,
  solved,
  onRemove,
}: {
  members: Member[];
  me: string;
  host: string;
  solved?: Record<string, number>;
  onRemove?: (id: string) => void;
}) {
  return (
    <ul className="player-list">
      {members.map((m, i) => (
        <li key={m.id}>
          <span className={`avatar avatar-${i % 3}`}>
            {m.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="player-name">
            {m.name}
            {m.id === me ? <small>you</small> : null}
            <span className="player-detail">
              {m.connected === false
                ? "Away"
                : m.spectator
                  ? "Spectating"
                  : m.id === host
                    ? "Host"
                    : m.ready
                      ? "Ready"
                      : "Joined"}
            </span>
          </span>
          {m.reaction ? <span>{m.reaction}</span> : null}
          {solved?.[m.id] ? (
            <Check className="success" size={18} />
          ) : m.ready ? (
            <span className="ready-dot" />
          ) : null}
          {onRemove && m.id !== me ? (
            <IconButton
              label={`Remove ${m.name}`}
              onClick={() => onRemove(m.id)}
            >
              <X size={14} />
            </IconButton>
          ) : (
            <span className="player-points">{m.points || ""}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
export function Scoreboard({ members }: { members: Member[] }) {
  return (
    <ol className="scoreboard">
      {ranking(members.filter((m) => !m.spectator)).map((m) => (
        <li key={m.id}>
          <span className={m.rank === 1 ? "rank first" : "rank"}>
            {m.rank.toString().padStart(2, "0")}
          </span>
          <span>{m.name}</span>
          <strong>
            {m.points}
            <small> pts</small>
          </strong>
        </li>
      ))}
    </ol>
  );
}
export function RoomCode({ code }: { code: string }) {
  return <span className="room-code">{code}</span>;
}
export function Status({ message }: { message: string }) {
  const friendly: Record<string, string> = {
    "Connection lost. Try again": "Try again to reconnect",
    "Session expired. Try again": "Your guest session has ended",
    "Could not start your session. Try again shortly":
      "Try starting your session again shortly",
    "Too many requests. Try again shortly": "Try again in a moment",
    "The room changed. Try again": "Try again after the room updates",
  };
  return (
    <p className="status" role="status" aria-live="polite">
      {friendly[message] || message}
    </p>
  );
}

export function PhotoCredit({ credit }: { credit?: PictureCredit }) {
  if (!credit) return null;
  return (
    <p className="source-credit">
      {credit.author ? `Image by ${credit.author} · ` : ""}
      <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
        Image source
      </a>{" "}
      ·{" "}
      <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
        {credit.license}
      </a>
    </p>
  );
}
