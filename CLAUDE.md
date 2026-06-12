# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build       # tsup — bundles ESM + generates .d.ts declarations
pnpm dev         # tsup watch mode
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run (single pass)
pnpm test:watch  # vitest (watch mode)
pnpm clean       # rm -rf dist
```

To run a single test file: `npx vitest run src/__tests__/computeGridLayout.test.ts`

## Architecture

This is a publishable React library (`@slithy/react-grid-gallery`) providing a fixed-column photo gallery with uniform cell size and optional virtualization.

### Three-layer API

The library exposes three levels of abstraction, all exported from `src/index.ts`:

1. **`GridGallery`** ([src/GridGallery.tsx](src/GridGallery.tsx)) — Top-level component. Accepts `items`, a `renderItem` render prop, and `GridOptions`. Handles all rendering internally.

2. **`useGridGallery`** ([src/useGridGallery.ts](src/useGridGallery.ts)) — Hook for consumers who need direct access to layout state. Returns `containerRef`, `rows` (`GridRow<T>[]`), `cellWidth`, `cellHeight`, `gap`, `columns`, `onLoad`, `onError`, and `virtualWindow` (non-null when `virtualize` is enabled).

3. **`computeGridLayout`** ([src/computeGridLayout.ts](src/computeGridLayout.ts)) — Pure layout function, no React dependency. Chunks items into rows of N columns with uniform cell dimensions; returns `GridLayoutRow<T>[]`.

### Key design decisions

**Uniform cell size:** Unlike justified galleries, all cells share the same dimensions — `cellWidth = floor((containerWidth - gap * (columns - 1)) / columns)`, `cellHeight = round(cellWidth / aspectRatio)`. No aspect ratio cache or per-item measurement needed.

**Responsive options:** `columns` and `gap` accept `number | ((containerWidth: number) => number)`. The callback is resolved inside the hook using the width it already observes via ResizeObserver.

**Virtualization:** Opt-in via `virtualize` prop. Because all rows have uniform height, the visible range is computed in O(1) via direct arithmetic rather than scanning cumulative offsets. Implemented via `useVirtualWindow` ([src/useVirtualWindow.ts](src/useVirtualWindow.ts)) — passive scroll listener debounced with `requestAnimationFrame`.

**`loaded` state:** `onLoad(key)` marks an item as loaded (triggers rerender for fade-in effects). `onError(key)` treats a load failure as terminal and also marks the item loaded — so a broken image's cell still becomes visible (showing whatever the broken `<img>` renders) instead of staying hidden behind a fade-in forever. Cell size is fixed regardless of load outcome.

**`scrollContainerRef`:** When the gallery is inside a scrollable div, pass a ref to that element. The scroll listener attaches to it instead of `window`, and `clientHeight` is used instead of `window.innerHeight`.

### Types

All shared types live in [src/types.ts](src/types.ts): `GalleryItem<T>`, `GridOptions`, `GridLayoutRow<T>`, `GridRow<T>`, `ScrollContainerRef`.

`GridOptions` fields: `columns` (required), `gap`, `aspectRatio` (default `1`), `virtualize` (default `false`), `overscan` (default `cellHeight * 4`).

### Build output

ESM only (`dist/index.js` + `dist/index.d.ts`). `sideEffects: false`. Peer deps: React 17/18/19.

## Slithy monorepo relationship

This repo is the canonical source for `@slithy/react-grid-gallery`. The monorepo at `../slithy` syncs `src/` from here via:

```bash
pnpm --filter @slithy/react-grid-gallery sync   # rsync src/ into monorepo
pnpm --filter @slithy/react-grid-gallery build
```

After pushing changes here, run `sync` + `build` in slithy to update the published package. Publishing is handled through the slithy monorepo via Changesets.

## Code conventions

**Imports:** No file extensions on relative imports (`.js`, `.ts`) — `moduleResolution: Bundler` handles this.

TypeScript and React conventions are defined in `~/Code/CLAUDE.md` and apply here.
