# BLURT backend

Production uses Supabase project `buwlkrqbbhsxyepeqjim`, completely separate from Sakuga

## State and access

Native anonymous Auth provides durable guest IDs, with access/refresh cookies handled on the server

The Edge API authenticates every request with `auth.getUser`, uses database time, validates strict command schemas and enforces distributed rate limits

One revisioned document represents a room, a guest’s daily run or a guest’s solo mode; document-scoped advisory locks and compare-and-swap prevent losing writes from affecting normalized projections

Answers, correctness, scoring, stages, membership and host permissions are server-owned; clients never receive a deck or future asset identifier

Private normalized tables retain daily runs, guesses, rooms, matches, rounds, memberships, solo sessions, solo rounds and solo guesses

## No-repeat library

Migration `20261116050000_no_repeat_catalog.sql` adds licensed source metadata, unique source hashes, a unique new-answer constraint, reserved daily pictures, guest picture history and idempotent picture deals

A short database transaction serializes only content allocation, records all participants and reserves a whole party deck or one solo picture, excluding the union of participating guests’ previous deals across Free Bloom, Flash Bloom and parties

The normal game-document transactions remain independent, so ongoing guesses do not acquire the allocation lock

New daily pictures never enter the shared pool; the seed transaction pins every day of a full year with unique images and retains today’s already published puzzle

The stack never resets when a run ends and never cycles on exhaustion

Private Storage objects must exist before their catalog release can activate; original and prepared hashes, license metadata and the content audit are retained in the repository

## Scheduling and live updates

Postgres pg_cron advances multiplayer deadlines and Flash Bloom timeouts every second, even with no browsers connected

Multiplayer consumes a pre-dealt private deck in both TypeScript and the database scheduler

Membership-protected Realtime channels carry revision hints only; Vercel converts these to sanitized same-origin SSE snapshots while guest tokens remain server-side

## Deployment

`npm run edge:prepare` generates the Deno domain from the tested `lib/` sources and packages immutable SQL migrations; only legacy recovery images are bundled

The runtime’s existing database connection applies trusted migrations transactionally and seeds the content catalog once per release; arbitrary SQL and service credentials are never accepted from or returned to clients

The one-time private content importer is disabled after import verification, and its temporary capability key is not committed

See `REDESIGN.md` for the final release and verification record
