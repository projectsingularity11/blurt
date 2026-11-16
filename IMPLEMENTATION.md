# BLURT implementation record

The finished application runs at https://blurt-eight.vercel.app with a separate Supabase project named blurt (`buwlkrqbbhsxyepeqjim`, us-east-1). Sakuga is untouched.

- Native anonymous authentication with HttpOnly refresh cookies and explicit expired-session recovery
- Authoritative daily, party, practice and timed solo game rules with server-validated answers and scores
- Atomic versioned documents, relational projections, distributed limits, idempotent deals and persisted match history
- Private Storage with authorized stage delivery; private Realtime subscriptions bridged to authenticated same-origin SSE
- Database deadlines advanced every second by pg_cron, including unattended matches
- A shared no-repeat picture history that includes late spectators and survives mode changes and restarts
- A pinned calendar through 16 November 2027 and a 2,231-picture shared stack
- 2,597 new licensed photographs, 15,582 private prepared objects, 1,715 accepted aliases and public per-image credits
- Clear Frutiger Aero glass, dimensional pink controls, playful local fonts, interactive bubbles, watery pointer, professional CC0 sounds and native page transitions
- Stable guess focus, keyboard play, reduced-motion support and responsive layouts

Production verification: 25 unit/database tests and 12 browser scenarios passed, including the final targeted multiplayer rerun; lint, strict TypeScript and production build passed. Production deployment is READY and the temporary content import endpoint is closed.

See BACKEND.md for architecture, content/README.md for the reproducible picture pipeline, THIRD_PARTY_NOTICES.md for licenses and REDESIGN.md for the final visual scope and deployment identifiers.
