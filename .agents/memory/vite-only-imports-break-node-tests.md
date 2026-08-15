---
name: Vite-only imports break node tests transitively
description: Top-level `?url` imports and browser-only libs (pdfjs-dist) crash tsx --test for ANY test that transitively imports the file
---
The rule: a client module must not have top-level Vite-specific imports (`...?url`) or browser-only library imports (pdfjs-dist needs DOMMatrix) — any `tsx --test` file that *transitively* imports it fails at load ("does not provide an export named 'default'" / "DOMMatrix is not defined"), even if the test never touches that code.

**Why:** PressTemplateLiveTest.tsx's static `import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` + `import * as pdfjs from 'pdfjs-dist'` broke pressScopedPersonDetail.test.ts (which only imports a sibling via the barrel of shared exports) — one whole test file red in CI.

**How to apply:** keep only `import type * as pdfjs from 'pdfjs-dist'` at module scope; wrap the real module + worker `?url` in a memoized `async loadPdfjs()` using dynamic `import()` and set `GlobalWorkerOptions.workerSrc` there. Vite code-splits it; node tests never evaluate it. Pattern lives in PressTemplateLiveTest.tsx.
