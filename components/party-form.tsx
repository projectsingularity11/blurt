"use client";
import { SessionRecovery } from "./session-recovery";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTransitionRouter } from "next-view-transitions";
import { ArrowRight, ChevronDown, Users } from "lucide-react";
import { Button, Header, Select, Status, TextInput } from "./ui";
import { api } from "@/lib/client";
import { normalizeCode } from "@/lib/rules";
export default function PartyForm({ join = false }: { join?: boolean }) {
  const router = useTransitionRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("code") || "");
  const [rounds, setRounds] = useState(7);
  const [duration, setDuration] = useState(25);
  const [category, setCategory] = useState("All pictures");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setName(localStorage.getItem("blurt-name") || "");
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const v = await api(join ? "join" : "create", {
        name,
        ...(join
          ? { code: normalizeCode(code) }
          : { rounds, duration, category }),
      });
      localStorage.setItem("blurt-name", name);
      router.push(`/party/${v.code}`);
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <Header label="Petal Party" />
      <main className="form-layout">
        <div className="form-heading">
          <span className="form-icon">
            <Users size={24} />
          </span>
          <h1>{join ? "Make an entrance" : "Get the room together"}</h1>
          <p>
            {join
              ? "Your friends are one code away"
              : "A private picture game for 2–8 friends"}
          </p>
        </div>
        <form className="form-panel" onSubmit={submit}>
          {join ? (
            <label>
              Room code
              <TextInput
                autoFocus
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="ABCDE"
                required
                maxLength={5}
                minLength={5}
                className="text-input code-input"
                autoComplete="off"
              />
            </label>
          ) : null}
          <label>
            Your name
            <TextInput
              autoFocus={!join}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              maxLength={24}
              required
              autoComplete="nickname"
            />
          </label>
          {!join ? (
            <>
              <fieldset>
                <legend>How many rounds?</legend>
                <div className="segmented">
                  {[3, 5, 7].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={rounds === n}
                      onClick={() => setRounds(n)}
                      className={rounds === n ? "selected" : ""}
                    >
                      {n}
                      <span> rounds</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <details>
                <summary>
                  Room settings
                  <ChevronDown size={16} />
                </summary>
                <div className="advanced">
                  <label>
                    Round duration
                    <Select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    >
                      <option value="15">15 seconds</option>
                      <option value="25">25 seconds</option>
                      <option value="40">40 seconds</option>
                    </Select>
                  </label>
                  <label>
                    Category
                    <Select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "All pictures",
                        "Animals",
                        "Food",
                        "Objects",
                        "Nature",
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </label>
                </div>
              </details>
            </>
          ) : null}
          <Button disabled={busy} className="full-width">
            {busy ? "One moment…" : join ? "Join Party" : "Create Party"}
            <ArrowRight size={17} />
          </Button>
          <Status message={message} />
          <SessionRecovery message={message} onReset={() => setMessage("")} />
        </form>
        <p className="form-footnote">Play as a guest</p>
      </main>
    </>
  );
}
