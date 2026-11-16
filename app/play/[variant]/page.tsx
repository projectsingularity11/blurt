"use client";
import { use, useEffect, useState, useCallback } from "react";
import { ArrowRight, RotateCcw, Flag } from "lucide-react";
import { api, load } from "@/lib/client";
import { playCue } from "@/lib/audio";
import catalog from "@/content/catalog-summary.json";
import type { View } from "@/lib/types";
import {
  Header,
  Button,
  TextInput,
  PuzzleFrame,
  PhotoCredit,
  StageIndicator,
  GuessHistory,
  Status,
} from "@/components/ui";
import { SessionRecovery } from "@/components/session-recovery";
export default function Solo({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = use(params);
  const mode = variant === "flash" ? "FLASH" : "FREE";
  const [data, setData] = useState<View>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [now, setNow] = useState(0);
  const refresh = useCallback(
    () =>
      load("solo", mode)
        .then((v) => {
          setData(v);
          setNow(v.now);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [mode],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const start = performance.now();
    const server = data?.now || Date.now();
    const timer = setInterval(
      () => setNow(server + performance.now() - start),
      250,
    );
    return () => clearInterval(timer);
  }, [data]);
  const run = data?.solo;
  const expired = !!(run?.ends && now >= run.ends && !run.finished);
  useEffect(() => {
    if (expired) void refresh();
  }, [expired, refresh]);
  async function act(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const v = await api(action, { code: mode, text });
      setData(v);
      setNow(v.now);
      setText("");
      if (action === "soloGuess" || action === "soloSkip")
        playCue(v.solo?.correct ? "success" : "miss");
      else playCue("reveal");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = mode === "FLASH" ? "Flash Bloom" : "Free Bloom";
  return (
    <>
      <Header label={title} />
      <main className="solo-panel">
        <SessionRecovery message={error} onReset={() => void refresh()} />
        {!data ? (
          <div className="loading-panel">Getting your pictures ready…</div>
        ) : !run || run.finished ? (
          <section className="solo-intro">
            <img src="/brand/bloom.webp" alt="" />
            <h1>{title}</h1>
            {run ? (
              <>
                <div className="solo-summary">
                  {run.score.toLocaleString()}
                  <small> pts</small>
                </div>
                <p>
                  {run.solved} pictures solved · Best{" "}
                  {run.best.toLocaleString()}
                </p>
              </>
            ) : (
              <p>
                {mode === "FLASH"
                  ? "Find as many pictures as you can in 90 seconds"
                  : `${catalog.stack.toLocaleString()} fresh pictures to play at your own pace`}
              </p>
            )}
            <Button disabled={busy} onClick={() => act("soloStart")}>
              {run ? <RotateCcw size={17} /> : null}
              {run ? "Play again" : "Let’s play"} <ArrowRight size={18} />
            </Button>
            <p className="small-copy" style={{ marginTop: 22 }}>
              Every three consecutive solves raises your multiplier up to 3×
            </p>
          </section>
        ) : (
          <>
            <div className="solo-top">
              <strong>
                {run.score.toLocaleString()} <small>pts</small>
              </strong>
              <div className="solo-metrics">
                <span>
                  <small>STREAK</small>
                  {run.streak}
                </span>
                <span>
                  <small>{mode === "FLASH" ? "SECONDS" : "SOLVED"}</small>
                  {run.ends
                    ? Math.max(0, Math.ceil((run.ends - now) / 1000))
                    : run.solved}
                </span>
                <span>
                  <small>BEST</small>
                  {run.best.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="section-top">
              <span className="eyebrow">Picture {run.position}</span>
              <span className="solo-category">{run.category}</span>
            </div>
            <PuzzleFrame
              src={`/api/image?mode=solo&code=${mode}&run=${run.id}&picture=${run.position}&stage=${run.stage}&done=${run.done}`}
              stage={run.stage}
              answer={run.answer}
            />
            <PhotoCredit credit={run.credit} />
            <StageIndicator stage={run.stage} done={run.done} />
            {run.done ? (
              <div className="solo-result">
                <h2>{run.answer}</h2>
                <p>
                  {run.correct
                    ? `+${run.points} points`
                    : "Keep your eyes open"}
                </p>
                <Button
                  autoFocus
                  disabled={busy}
                  onClick={() => act("soloNext")}
                >
                  Next picture <ArrowRight size={17} />
                </Button>
              </div>
            ) : (
              <>
                <form
                  className="guess-controls"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("soloGuess");
                  }}
                >
                  <TextInput
                    aria-label="Your guess"
                    placeholder="What do you see?"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={80}
                    disabled={busy}
                    autoComplete="off"
                  />
                  <Button disabled={busy || !text.trim()} type="submit">
                    Guess <ArrowRight size={17} />
                  </Button>
                </form>
                <div className="guess-subline">
                  <span>{6 - run.stage} chances left</span>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => act("soloSkip")}
                  >
                    Skip reveal
                  </button>
                </div>
              </>
            )}
            <GuessHistory guesses={run.guesses} />
            <button
              className="text-button"
              disabled={busy}
              onClick={() => act("soloFinish")}
            >
              <Flag size={13} /> Finish run
            </button>
          </>
        )}
        <Status message={error} />
        {error ? (
          <Button variant="secondary" onClick={() => void refresh()}>
            Try again
          </Button>
        ) : null}
      </main>
    </>
  );
}
