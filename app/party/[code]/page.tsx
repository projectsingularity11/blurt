"use client";
import { SessionRecovery } from "@/components/session-recovery";
import { use, useEffect, useRef, useState } from "react";
import { useTransitionRouter } from "next-view-transitions";
import {
  ArrowRight,
  Check,
  Copy,
  LogOut,
  RotateCcw,
  Users,
  Crown,
  Clock3,
} from "lucide-react";
import {
  Button,
  Header,
  PlayerList,
  PuzzleFrame,
  PhotoCredit,
  RoomCode,
  Scoreboard,
  StageIndicator,
  Status,
  TextInput,
} from "@/components/ui";
import { subscribeRoom } from "@/lib/live";
import { api, copy, load } from "@/lib/client";
import { ranking, normalizeCode, stageAt } from "@/lib/rules";
import { playCue } from "@/lib/audio";
import type { View } from "@/lib/types";
export default function Party({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = normalizeCode(rawCode);
  const router = useTransitionRouter();
  const [v, setV] = useState<View>();
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState("Connecting…");
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const r = v?.room;
  useEffect(() => {
    let alive = true;
    let stopLive: (() => void) | undefined;
    let heartbeat: ReturnType<typeof setInterval>;
    async function init() {
      try {
        const initial = await load("room", code);
        if (!alive) return;
        setV(initial);
        setNow(initial.now);
        offset.current = initial.now - Date.now();
        const stop = await subscribeRoom(
          code,
          (data) => {
            if (!alive) return;
            offset.current = data.now - Date.now();
            setV((previous) =>
              previous && previous.now > data.now ? previous : data,
            );
          },
          (status) => {
            if (alive) setConnection(status);
          },
          (error) => {
            if (alive) {
              setMessage(error);
              setV(undefined);
            }
          },
        );
        if (!alive) {
          stop();
          return;
        }
        stopLive = stop;
        heartbeat = setInterval(() => {
          void api("heartbeat", { code }).catch((error) => {
            if (!alive) return;
            if ((error as Error).message.startsWith("Session expired")) {
              setMessage((error as Error).message);
              setV(undefined);
            }
            setConnection("Reconnecting…");
          });
        }, 15000);
        await api("heartbeat", { code });
      } catch (e) {
        if ((e as Error).message === "Join this room first") {
          router.replace(`/party/join?code=${code}`);
        } else if (alive) {
          setMessage((e as Error).message);
          setConnection("Connection lost");
        }
      }
    }
    void init();
    const clock = setInterval(() => setNow(Date.now() + offset.current), 200);
    return () => {
      alive = false;
      stopLive?.();
      clearInterval(heartbeat);
      clearInterval(clock);
    };
  }, [code, router]);
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(action, { code, ...data });
      if (action === "leave") {
        router.push("/");
        return;
      }
      if (result.room)
        setV((previous) =>
          previous && previous.now > result.now ? previous : result,
        );
      if (action === "partyGuess") {
        setGuess("");
        playCue(result.room?.solved[result.me] ? "success" : "miss");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function invite() {
    try {
      await copy(`${location.origin}/party/${code}`);
      setMessage("Invite link copied");
    } catch {
      setMessage("Share the room code if the link won’t copy");
    }
  }
  if (!r || !v)
    return (
      <>
        <Header label="Petal Party" />
        <main className="form-layout">
          <h1>{message || "Opening the room…"}</h1>
          <SessionRecovery
            message={message}
            onReset={() => router.replace(`/party/join?code=${code}`)}
          />
          {message ? (
            <Button onClick={() => location.reload()}>Try again</Button>
          ) : null}
        </main>
      </>
    );
  const host = r.host === v.me;
  const me = r.members.find((p) => p.id === v.me);
  const reveal = !!r.revealAt;
  const countdown = !!r.starts && now < r.starts;
  const solved = r.solved[v.me];
  const stage = r.starts ? stageAt(r.starts, r.duration, now) : r.stage;
  const stageUsed = r.myGuesses.some((g) => g.stage === stage);
  const winners = ranking(r.members.filter((m) => !m.spectator)).filter(
    (m) => m.rank === 1,
  );
  return (
    <>
      <Header
        label={
          r.status === "playing"
            ? `Round ${r.round} of ${r.rounds}`
            : "Petal Party"
        }
      />
      {r.status === "lobby" ? (
        <main className="lobby-layout">
          <div className="lobby-intro">
            <span className="eyebrow">Your room, your people</span>
            <h1>
              Room for a little
              <br />
              friendly competition
            </h1>
            <div className="invite-panel">
              <div>
                <span className="field-caption">Room code</span>
                <RoomCode code={r.code} />
              </div>
              <Button variant="secondary" onClick={invite}>
                <Copy size={16} />
                Copy invite
              </Button>
            </div>
          </div>
          <section className="lobby-panel">
            <div className="panel-heading">
              <h2>The guessing crew</h2>
              <span>{r.members.length}/8</span>
            </div>
            <PlayerList
              members={r.members}
              me={v.me}
              host={r.host}
              onRemove={
                host ? (id) => void act("remove", { target: id }) : undefined
              }
            />
            <div className="lobby-settings">
              <span>{r.rounds} rounds</span>
              <span>{r.duration}s per round</span>
              <span>{r.category}</span>
            </div>
            <div className="lobby-actions">
              <Button
                variant={me?.ready ? "secondary" : "primary"}
                disabled={busy}
                onClick={() => void act("ready")}
              >
                {me?.ready ? (
                  <>
                    <Check size={17} />
                    You’re ready
                  </>
                ) : (
                  "I’m ready"
                )}
              </Button>
              {host ? (
                <Button
                  disabled={
                    busy ||
                    r.members.filter((m) => m.connected !== false).length < 2 ||
                    !r.members
                      .filter((m) => m.connected !== false)
                      .every((m) => m.ready)
                  }
                  onClick={() => void act("start")}
                >
                  Start game
                  <ArrowRight size={16} />
                </Button>
              ) : null}
            </div>
            <p className="lobby-hint">
              {r.members.length < 2
                ? "Invite a friend to get started"
                : r.members.every((m) => m.ready)
                  ? host
                    ? "Everyone is ready to play"
                    : "Waiting for the host to start"
                  : "The game starts when everyone is ready"}
            </p>
            <Status message={message} />
            <SessionRecovery
              message={message}
              onReset={() => router.replace(`/party/join?code=${code}`)}
            />
          </section>
          <div className="lobby-bottom">
            <button className="text-button" onClick={() => void act("leave")}>
              <LogOut size={14} />
              Leave room
            </button>
            <span className="connection">
              <i className={connection === "Connected" ? "online" : ""} />
              {connection}
            </span>
          </div>
        </main>
      ) : r.status === "finished" ? (
        <main className="results-layout">
          <div className="winner-icon">
            <Crown size={29} />
          </div>
          <p className="eyebrow">That’s a wrap</p>
          <h1>{winners.map((p) => p.name).join(" & ")}</h1>
          <p className="muted">
            {winners.length > 1 ? "Share the top spot" : "Takes the top spot"}
          </p>
          <Scoreboard members={r.members} />
          <div className="result-actions">
            {host ? (
              <Button disabled={busy} onClick={() => void act("rematch")}>
                <RotateCcw size={17} />
                Play again
              </Button>
            ) : (
              <span className="muted">Waiting for the host to rematch</span>
            )}
            <Button variant="secondary" onClick={invite}>
              <Copy size={16} />
              Copy invite
            </Button>
          </div>
          <Status message={message} />
          <SessionRecovery
            message={message}
            onReset={() => router.replace(`/party/join?code=${code}`)}
          />
          <button className="text-button" onClick={() => void act("leave")}>
            Back to the menu
            <ArrowRight size={15} />
          </button>
        </main>
      ) : (
        <main className="party-layout">
          <aside className="players-sidebar">
            <div className="sidebar-heading">
              <Users size={16} />
              <h2>The crew</h2>
            </div>
            <PlayerList
              members={r.members}
              me={v.me}
              host={r.host}
              solved={r.solved}
            />
            <div className="room-label">
              Room <RoomCode code={r.code} />
            </div>
          </aside>
          <section className="party-center">
            <div className="round-top">
              <span>
                {reveal
                  ? "The reveal"
                  : countdown
                    ? "Get ready"
                    : "Trust your first guess"}
              </span>
              <span
                className={`timer ${now > (r.ends || 0) - 5000 && !reveal ? "urgent" : ""}`}
              >
                <Clock3 size={16} />
                {reveal
                  ? "Next up…"
                  : countdown
                    ? Math.max(1, Math.ceil(((r.starts || now) - now) / 1000))
                    : `${Math.max(0, Math.ceil(((r.ends || now) - now) / 1000))}s`}
              </span>
            </div>
            {countdown ? (
              <div className="puzzle-frame countdown">
                <span>Eyes on the picture</span>
                <strong>
                  {Math.max(1, Math.ceil(((r.starts || now) - now) / 1000))}
                </strong>
              </div>
            ) : (
              <PuzzleFrame
                stage={stage}
                answer={r.answer}
                src={`/api/image?mode=room&code=${r.code}&round=${r.round}&stage=${stage}&reveal=${reveal}`}
              />
            )}
            <PhotoCredit credit={r.credit} />
            <StageIndicator stage={stage} done={reveal} />
            {reveal ? (
              <div className="round-reveal">
                <h1>{r.answer}</h1>
                <p>
                  {solved
                    ? `+${solved} points`
                    : "A new perspective for the next one"}
                </p>
              </div>
            ) : solved ? (
              <div className="solved-panel">
                <Check size={21} />
                <strong>Got it +{solved}</strong>
                <div className="reactions">
                  {["✦", "♡", "👏", "👀"].map((x) => (
                    <button
                      key={x}
                      aria-label={`React ${x}`}
                      onClick={() => void act("reaction", { reaction: x })}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </div>
            ) : me?.spectator ? (
              <p className="muted">
                Join the next match after watching this one
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("partyGuess", {
                    text: guess,
                    key: crypto.randomUUID(),
                  });
                }}
              >
                <label htmlFor="party-guess" className="sr-only">
                  Your guess
                </label>
                <div className="guess-controls">
                  <TextInput
                    id="party-guess"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    placeholder={
                      stageUsed ? "A little clearer, soon…" : "What do you see?"
                    }
                    maxLength={80}
                    disabled={busy || stageUsed || countdown}
                    autoComplete="off"
                  />
                  <Button
                    disabled={busy || stageUsed || countdown || !guess.trim()}
                  >
                    Guess
                    <ArrowRight size={17} />
                  </Button>
                </div>
                <p className="guess-subline">
                  {stageUsed
                    ? "Your next guess unlocks on the next reveal"
                    : "Make your one guess per reveal count"}
                </p>
              </form>
            )}
            <Status message={message} />
            <SessionRecovery
              message={message}
              onReset={() => router.replace(`/party/join?code=${code}`)}
            />
            <div className="mobile-crew">
              <PlayerList
                members={r.members}
                me={v.me}
                host={r.host}
                solved={r.solved}
              />
            </div>
          </section>
          <aside className="feed-sidebar">
            <div className="sidebar-heading">
              <h2>{reveal ? "The guesses" : "Wild guesses"}</h2>
              <span>{r.feed.length}</span>
            </div>
            {r.feed.length ? (
              <ul className="wrong-feed" aria-live="polite">
                {r.feed.map((g, i) => (
                  <li key={`${r.round}-${i}`}>
                    <span>{g.text || "Skipped"}</span>
                    {g.player ? (
                      <small>
                        {r.members.find((m) => m.id === g.player)?.name ||
                          g.author ||
                          "A player"}
                        {g.correct ? " · Got it" : ""}
                      </small>
                    ) : (
                      <small>Not quite</small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="feed-empty">
                <span>“…”</span>
                <p>Your friends’ guesses land here</p>
              </div>
            )}
            <span className="connection">
              <i className={connection === "Connected" ? "online" : ""} />
              {connection}
            </span>
            <button
              className="text-button leave-game"
              onClick={() => void act("leave")}
            >
              Leave room
            </button>
          </aside>
        </main>
      )}
    </>
  );
}
