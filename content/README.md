# BLURT picture library

The release contains 2,597 new audited images, with 2,231 shared-stack pictures and 366 reserved daily pictures; the ten original launch puzzles remain for historical results

The production calendar is pinned from 2026-11-16 through 2027-11-16, preserving the puzzle that was already published on the first day

## Provenance and licenses

`puzzles.json` is server-only answer data with accepted aliases, category, immutable ID, source hash, credit and daily reservation

`sources.json` preserves every new image’s Commons file page, creator, original license and license URL, original dimensions, source SHA1, decoded-image SHA256 and all six prepared-asset SHA256 checksums

Original files use their individual CC BY, CC BY-SA, CC0 or public-domain terms; resized and pixelated derivatives retain those terms, and public attribution is available at `/credits/photos` and after a reveal

The original launch photographs use the Unsplash License, with their original photo identifiers retained in `puzzles.json`

Subject-name discovery used the CC0 Corpora collection and OpenMoji’s CC BY-SA factual annotations, followed by Wikipedia lead-image lookup and Commons license verification; no OpenMoji artwork is included

## Audit

- At least 1080 pixels on the original’s longest side, so the final 1080-pixel letterboxed reveal does not require enlarging the original
- Explicit accepted reuse license and a recorded creator
- Unique source hash, decoded-image hash and normalized canonical answer
- Perceptual near-duplicate comparison before activation
- Subject-description checks to remove ambiguous names that resolve to cities, regions, biographies or broad taxonomic groups
- Accepted Wikipedia redirects and useful common aliases, rather than exact-spelling-only answers
- A distinct reserved daily pool that never enters solo or party deals

The final pass retained 2,597 of the 2,959 prepared candidates

## Prepared files and private storage

Reveals 1–5 are native 12, 22, 42, 90 and 240 pixel WebP files, enlarged crisply with CSS `image-rendering: pixelated`; final reveals are 1080 pixels

All 15,582 new files were uploaded with SHA256 checks and verified in the private `blurt-puzzles` bucket under `v2/`; total prepared size is 536,613,738 bytes

The median first-stage image is only a few hundred bytes; guesses never require image processing, public image search or a full-size original download

New prepared files and originals are not committed or included in Vercel function bundles; the checksummed source manifest and preparation scripts are committed

Only the authorized game API can select a stage; arbitrary `stage`, filename or puzzle parameters cannot reveal future images

## Reproduction and updates

```sh
python scripts/catalog-collect.py
node --use-env-proxy scripts/catalog-prepare.mjs
node scripts/catalog-finalize.mjs
node scripts/catalog-aliases.mjs
```

The cache defaults to `.cache/blurt-catalog`; `BLURT_CATALOG_DIR` overrides it

A production import requires an explicitly authorized temporary administrative deployment with a new private capability, scoped only to BLURT’s private image bucket; the importer used for this release is now closed and returns HTTP 410

Keep published IDs, answers and reserved dates immutable; replacement images need new IDs and a new content release, while historical records and assets remain available

The Edge seed transaction refuses activation unless every new puzzle has all six private objects; the migration reserves the next year without changing today’s already published puzzle
