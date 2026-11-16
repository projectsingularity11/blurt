# Rendering performance — 16 November 2026

The previous production revision is `44c972e`. The design and game rules are preserved.

## Measured result

Three paired runs used production builds, one Chromium instance, a 1440 × 1000 viewport, a 2.5-second warmup and four-second samples. Each run measured idle animation and the same 110-point mouse path. No other builds or tests ran concurrently. Values below are the medians of the three runs; raw samples are in [docs/rendering-benchmark.json](docs/rendering-benchmark.json).

| Workload | Previous mean frame interval | Optimized mean frame interval | Reduction |
| --- | ---: | ---: | ---: |
| Idle animation | 30.53 ms | 17.09 ms | 44% |
| Pointer movement | 34.48 ms | 25.16 ms | 27% |

The idle p95 improved from 50 ms to 16.8 ms. Pointer p95 remained around 50 ms. This software-rendered cloud host showed substantial variance, including one cold pointer run with a multi-second stall; that sample is retained in the raw results. These measurements demonstrate an improvement, not a guaranteed frame rate on every device.

## Changes kept

- Three full-screen, animated diffuse gradients now share one native-resolution 2D surface, with gradients cached in an OffscreenCanvas worker
- Only the very slow lighting field is recomposited at 15 Hz: its worst-case color change between updates is below one 8-bit color-channel step; the foreground, pointer, planets and browser compositor remain uncapped
- The photograph, optical blur, sharp glass objects, typography, hover effects, animation paths, easing and durations are preserved
- Hidden tabs stop the worker; reduced-motion users retain the static CSS scene
- Worker errors, missing browser support and context loss restore the original CSS scene
- Card tilt properties are typed and do not inherit into SVG/text descendants; the initial values match the original hover fallbacks

A separate style-recalculation probe (300 updates, five samples) measured a median 233.4 ms before and 162.1 ms after registering the non-inherited tilt properties. This probe measures style work rather than end-user frame rate.

## Attempts rejected

| Attempt | Result | Decision |
| --- | --- | --- |
| Promote every decorative element | More layers and worse rendering time | Rejected |
| WebGL lighting shader | Worse on the software-rendered host | Rejected |
| Half-resolution light surface | Slower than the full-resolution surface | Rejected |
| Rebuild the whole photo/background in the worker | Color differences exceeded the visual tolerance | Rejected |
| Reorganize card skins or cache inset shadows | No reliable interaction improvement; extra complexity | Rejected |
| Replace card tilt updates with direct transforms | No reliable improvement | Rejected |
| Recompose the worker lighting every display frame | Idle improved, but pointer improvement missed the 20% budget | Replaced with perceptually bounded light-cache updates |

## Verification and regression guards

- 25 unit/database tests passed
- Lint, strict TypeScript and production build passed
- Seven screenshot comparisons cover both themes at 375, 768 and 1440 px and the worst interval between lighting updates
- Visual assertions compare the optimized worker to the original CSS at a fixed animation time: mean color-channel difference below 0.75/255 and fewer than 0.1% of channels outside a five-level rounding tolerance
- Browser checks cover responsive cache resizing, fallback, changing motion preferences and native page transitions
- The transition test now permits only the decorative 2D cache; it continues to reject unrelated canvases and the removed model/Draco assets

Reproduce the paired benchmark against two production builds:

```sh
BASELINE_URL=http://localhost:3032 BASE_URL=http://localhost:3034 PERF_ASSERT=1 node scripts/benchmark-rendering.mjs
```

`PERF_ASSERT=1` requires at least 20% lower median frame intervals in both workloads; three runs retain normal measurement variance rather than relying on a single favorable sample.

## Live production verification

Production deployment `dpl_9pfNEJwoqKQKnRBRN9QFkxs8bBbn` serves runtime commit `a800f88` at https://blurt-eight.vercel.app. All 22 distinct browser scenarios passed across the full production suite and the targeted rerun; the 25 unit/database tests also passed. Health and worker delivery return HTTP 200, and the deployment error/fatal log scan was empty.

The initial live suite exposed two older assertions that required a whole homepage to fit a 900px viewport. The previous immutable production release also scrolls: at 375px wide, both versions measured exactly 938px tall. The tests now verify footer reachability through natural vertical scrolling while retaining horizontal-overflow, help, navigation, picture and privacy assertions. No product layout was changed to satisfy the tests.

The pixel harness explicitly moves the pointer outside the viewport before freezing animations, eliminating inherited hover state between browser contexts. The seven visual comparisons then passed in the production rerun without relaxing either color tolerance. The final verification-only commit changes tests and this record; its runtime source is identical to the deployed commit.
