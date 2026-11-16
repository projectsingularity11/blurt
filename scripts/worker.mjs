// Run as a supervised process, separate from the web/serverless deployment.
const origin = process.env.BLURT_ORIGIN || "http://localhost:3000";
if (!process.env.BLURT_WORKER_SECRET) throw Error("Set BLURT_WORKER_SECRET");
while (true) {
  try {
    const r = await fetch(`${origin}/api/advance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.BLURT_WORKER_SECRET}` },
    });
    if (!r.ok) console.error("Transition worker:", r.status);
  } catch (e) {
    console.error("Transition worker:", e.message);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
