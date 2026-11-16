"use client";
import { SessionRecovery } from "@/components/session-recovery";
import { DailyStats } from "@/components/daily-stats";
import { useEffect, useState, useRef } from "react";
import { Link } from "next-view-transitions";
import { ArrowRight, Share2, Users } from "lucide-react";
import {
  Button,
  GuessHistory,
  Header,
  Help,
  PuzzleFrame,
  PhotoCredit,
  StageIndicator,
  Status,
  TextInput,
} from "@/components/ui";
import { api, clock, copy, load, shareText } from "@/lib/client";
import { playCue } from "@/lib/audio";
import type { View } from "@/lib/types";
export default function Daily() {
  const [view, setView] = useState<View>();
  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const d = view?.daily;
  const offset = useRef(0);
  async function refresh() {
    try {
      const v = await load("daily");
      setView(v);
      offset.current = v.now - Date.now();
      setNow(v.now);
      setMessage("");
      localStorage.setItem("blurt-guest", "established");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    let loadedDay = Math.floor(Date.now() / 86400000);
    const timer = setInterval(() => {
      setNow(Date.now() + offset.current);
      const day = Math.floor((Date.now() + offset.current) / 86400000);
      if (day !== loadedDay) {
        loadedDay = day;
        void refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  async function submit(skip = false) {
    if (busy) return;
    setBusy(true);
    try {
      const v = await api(skip ? "skip" : "dailyGuess", {
        text: guess,
        key: crypto.randomUUID(),
      });
      setView(v);
      setGuess("");
      setMessage(
        v.daily?.solved
          ? "Got it"
          : skip
            ? "Skipped to the next reveal"
            : "Look a little closer",
      );
      playCue(v.daily?.solved ? "success" : "reveal");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!d) return;
    const text = shareText(d.number, d.guesses, `${location.origin}/daily`);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await copy(text);
        setMessage("Copied to clipboard");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage("Try sharing again");
    }
  }
  return (
    <>
      <Header
        label={
          d
            ? `Daily Bloom · ${d.number.toString().padStart(3, "0")}`
            : "Daily Bloom"
        }
      />
      <main className="daily-layout">
        <div className="section-top">
          <span className="eyebrow">Find the picture in five reveals</span>
          <Help />
        </div>
        {d ? (
          <>
            <PuzzleFrame
              stage={d.stage}
              answer={d.answer}
              src={`/api/image?mode=daily&v=${d.guesses.length}`}
            />
            <PhotoCredit credit={d.credit} />
            <StageIndicator
              stage={d.solved ? d.guesses.length : d.stage}
              done={d.done}
            />
            {d.done ? (
              <section className="daily-result">
                <p className="eyebrow">
                  {d.solved ? `Got it in ${d.guesses.length}` : "Not this time"}
                </p>
                <h1>{d.answer}</h1>
                <div className="result-actions">
                  <Button onClick={share}>
                    <Share2 size={17} />
                    Share result
                  </Button>
                  <Link className="button secondary" href="/party/create">
                    <Users size={17} />
                    Play with friends
                  </Link>
                </div>
                <DailyStats />
              </section>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label htmlFor="daily-guess" className="sr-only">
                  Your guess
                </label>
                <div className="guess-controls">
                  <TextInput
                    id="daily-guess"
                    autoComplete="off"
                    placeholder="What do you see?"
                    maxLength={80}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    disabled={busy}
                  />
                  <Button disabled={busy || !guess.trim()}>
                    Guess <ArrowRight size={17} />
                  </Button>
                </div>
                <div className="guess-subline">
                  <span>
                    {5 - d.guesses.length}{" "}
                    {5 - d.guesses.length === 1 ? "attempt" : "attempts"}{" "}
                    remaining
                  </span>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void submit(true)}
                  >
                    Skip this reveal <ArrowRight size={13} />
                  </button>
                </div>
              </form>
            )}
            <Status message={message} />
            <SessionRecovery message={message} onReset={() => void refresh()} />
            <GuessHistory guesses={d.guesses} />
            <div className="daily-bottom">
              <span>Next picture in</span>
              <strong>{clock(d.ends - now)}</strong>
            </div>
          </>
        ) : (
          <div className="loading-panel">
            <p>{message || "Finding today’s picture…"}</p>
            <SessionRecovery message={message} onReset={() => void refresh()} />
            {message ? <Button onClick={refresh}>Try again</Button> : null}
          </div>
        )}
      </main>
    </>
  );
}
