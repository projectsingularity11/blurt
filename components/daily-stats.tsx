"use client";
import { useEffect, useState } from "react";
export function DailyStats() {
  const [stats, setStats] = useState<{
    played: number;
    won: number;
    best: number | null;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/stats", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!stats) return null;
  return (
    <dl className="daily-stats" aria-label="Your daily results">
      <div>
        <dd>{stats.played}</dd>
        <dt>Played</dt>
      </div>
      <div>
        <dd>{stats.won}</dd>
        <dt>Solved</dt>
      </div>
      <div>
        <dd>{stats.best || "—"}</dd>
        <dt>Best reveal</dt>
      </div>
    </dl>
  );
}
