"use client";
import { useState } from "react";
import { Button } from "./ui";
export function SessionRecovery({
  message,
  onReset,
}: {
  message: string;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!message.startsWith("Session expired")) return null;
  async function restart() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/session", { method: "POST" });
      if (!r.ok) throw Error();
      onReset();
    } catch {
      setError("Try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="session-recovery">
      <p>Continue with a fresh guest profile after your session ends</p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void restart()}
        disabled={busy}
      >
        {busy ? "One moment…" : "Continue as new guest"}
      </Button>
      {error ? <p role="status">{error}</p> : null}
    </div>
  );
}
