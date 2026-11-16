# BLURT

[Play BLURT](https://blurt-eight.vercel.app)

A Frutiger Aero picture game with Daily Bloom, private Petal Party rooms, untimed Free Bloom and 90-second Flash Bloom

## Run

Requires Node 24+

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The example points at BLURT’s own Supabase project with its public publishable key, so local guests can use the real private image library without database credentials

For a fully offline development adapter, remove the Supabase variables and run the content preparation pipeline first; game state then persists in `.data/blurt.sqlite`

## Production architecture

- Separate Supabase project `buwlkrqbbhsxyepeqjim` in us-east-1; Sakuga is untouched
- Supabase anonymous Auth with server-side HttpOnly cookies and refresh
- Per-room and per-player game documents with revision checks and atomic normalized projections
- Private `blurt-puzzles` Storage with server-authorized current-stage delivery
- Private Realtime revision hints bridged through authenticated same-origin SSE
- PostgreSQL deadlines for multiplayer and Flash Bloom, including when browsers close
- Durable cross-mode picture deals and guest history, with a reserved non-repeating daily year
- Vercel Node 24 in iad1; production is public and Preview deployments keep Vercel authentication

Vercel needs only the Supabase URL and public publishable key; database and service credentials stay inside Supabase

## Content

The audited counts are in `content/catalog-summary.json`

- `content/puzzles.json` is the private server-side answer catalog
- `content/sources.json` records creators, licenses, source URLs, original-image hashes, decoded-image hashes and all prepared-asset checksums
- `/credits/photos` publishes individual attribution
- Early reveals are tiny native-resolution WebP files, scaled with crisp pixel rendering in the browser
- Final reveals are 1080-pixel images, prepared from originals with at least 1080 pixels on their longest side
- All new prepared images live in private Supabase Storage and are intentionally excluded from Git and browser bundles
- New daily pictures are reserved apart from the shared stack
- Free Bloom, Flash Bloom and parties exclude every picture already dealt to a participating guest
- Exhaustion returns a clear message instead of recycling pictures

The retained launch puzzles remain available for historical results

Reproduce discovery, licensed preparation and the final duplicate/subject audit:

```sh
python scripts/catalog-collect.py
node --use-env-proxy scripts/catalog-prepare.mjs
node scripts/catalog-finalize.mjs
node scripts/catalog-aliases.mjs
```

Use `BLURT_CATALOG_DIR` to select a cache directory; see `content/README.md` for the private import process and licensing details

## Design and performance

The UI adapts licensed MakeAero thin-film bubbles and Frutiger.js controls, cursor and SVG icons; source links and licenses are in `THIRD_PARTY_NOTICES.md`

DynaPuff and Nunito are self-hosted, and feedback uses the premade professional Serene Tones pack

The interface has no Garden model, Three.js runtime, canvas, full-screen refraction shader or raster background download; pointer repulsion runs on one animation-frame loop that sleeps when settled, with transform-only bubble movement and page transitions

Reduced motion, sound choice, keyboard access, clear loading/error states and persistent guess-field focus are supported

## Verify and deploy

```sh
npm run lint
npm run typecheck
npm test
npm run build
CLOUD_TEST=1 BASE_URL=http://localhost:3000 npm run test:e2e
npm run edge:prepare
```

`edge:prepare` generates Deno domain modules from `lib/` and packages the trusted SQL migrations; only the ten legacy images remain bundled as recovery fixtures

Deploy `blurt-api` to BLURT’s Supabase project after the prepared objects are uploaded and verified, then deploy the application to the existing Vercel `blurt` project

The Edge runtime applies only checked-in migrations under an advisory lock and seeds a release only after every new image has all six private stages; it never accepts arbitrary SQL from requests
