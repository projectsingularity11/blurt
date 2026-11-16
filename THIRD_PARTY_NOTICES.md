# BLURT sources and licenses

## Interface

- Clear soap-bubble thin-film gradients and layered Aero sky: [Visnalize / MakeAero](https://github.com/Visnalize/makeaero), MIT, copyright 2025 Visnalize; adapted to crisp unblurred spheres and interactive popping in `components/aero-world.tsx` and `app/globals.css`; full license in `vendor/makeaero/LICENSE`
- Glossy button domes, illustrated SVG icons and droplet cursor: [Biagio Scaglia / Frutiger.js](https://github.com/biagio-scaglia/frutiger-js), MIT, copyright 2026 Biagio Scaglia; source and license in `vendor/frutiger-js`; the cursor’s spring-trailing movement is adapted to an idle-sleeping loop with bubble repulsion
- Page transitions: [shuding / next-view-transitions](https://github.com/shuding/next-view-transitions), MIT
- DynaPuff and Nunito: [Fontsource](https://github.com/fontsource/fontsource), SIL Open Font License; license files are distributed alongside the self-hosted fonts
- The glass-flower/lens emblem is the original generated BLURT artwork retained from its earlier identity; no new generated graphics were used for this revision

## Sound

The four included premade recordings come from [pingthings / Serene Tones](https://github.com/JustPinero/pingthings/tree/main/packs/serene-tones), a pack marked `tone: professional`

Original audio: [100 CC0 SFX by rubberduck](https://opengameart.org/content/100-cc0-sfx), CC0; no pingthings GPL application code is included

Original pack metadata is preserved in `public/sounds/professional/SOURCE.json`; playback uses [Howler](https://github.com/goldfire/howler.js), MIT, at deliberately quiet levels

## Picture library

Each new picture has its own Wikimedia Commons creator, license URL and source-file page in `content/sources.json`; the source files retain their original CC BY, CC BY-SA, CC0 or public-domain terms

BLURT crops or letterboxes, resizes and pixelates individual images; these derivatives retain the source image’s applicable license, with individual public attribution at `/credits/photos` and after a reveal

The original ten launch photos use the [Unsplash License](https://unsplash.com/license); their identifiers remain in `content/puzzles.json` for historical results

Subject discovery used factual names from [Darius Kazemi’s Corpora](https://github.com/dariusk/corpora), CC0, and [OpenMoji](https://github.com/hfg-gmuend/openmoji), CC BY-SA 4.0; no OpenMoji graphics are included, and the discovery data license is preserved in `vendor/openmoji/LICENSE.txt`

## Pacific background and Comfortaa

The photographic Pacific-cove background is adapted by saturation and brightness adjustment from Unsplash photo `photo-1510414842594-a61c69b5ae57`, downloaded from https://images.unsplash.com/photo-1510414842594-a61c69b5ae57 under the [Unsplash License](https://unsplash.com/license). It is a decorative world asset, separate from the private game library.

Comfortaa by Johan Aakerlund is self-hosted from Fontsource under the SIL Open Font License 1.1, included at public/fonts/comfortaa-LICENSE.txt. Source: https://github.com/fontsource/fontsource/tree/main/font-packages/variable/comfortaa
