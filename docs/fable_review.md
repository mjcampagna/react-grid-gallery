# Code Review: `src/`

Reviewed 2026-06-12. No changes made — findings only.

Two passes: findings 1–10 from the first pass; findings 11–19 and the verification notes from a second, deeper pass the same day.

---

## Bugs

### 1. Virtual spacer heights are off by `gap` when non-zero (`useGridGallery.ts:232-233`)

The flex container applies CSS `gap` between **all** adjacent children, including between the top spacer and the first visible row, and between the last visible row and the bottom spacer. This means each present spacer introduces one extra gap that doesn't exist in the non-virtualized layout.

**Current:**
```ts
const topSpacerHeight = firstIndex * rowStride
const bottomSpacerHeight = (totalRows - 1 - lastIndex) * rowStride
```

**Correct (when the spacer is non-zero):**
```ts
// The gap between topSpacer and the first visible row is added by CSS —
// subtract one gap from each non-zero spacer.
topSpacerHeight = firstIndex * rowStride - gap        // when firstIndex > 0
bottomSpacerHeight = hiddenBelow * rowStride - gap    // when hiddenBelow > 0
```

Concretely: with 10 rows, `cellHeight=100`, `gap=4`, showing rows 5–6, the current code produces a total scroll height of **1052px** instead of the correct **1036px** — off by `2 * gap`. The visual effect is extra blank space at the bottom of a scrolled gallery.

### 2. `padding` not accounted for in virtual row index calculation (`useGridGallery.ts:220-226`)

When `padding > 0` is set, the gallery container has CSS padding that offsets the first row. `virtualRange.top` is measured from the container's top edge (before padding), but the row index arithmetic treats row 0 as starting at offset 0:

```ts
const firstIndex = Math.floor(visibleTop / rowStride)
```

The first row actually starts at `padding` pixels into the container. The correct calculation:

```ts
const firstIndex = Math.floor(Math.max(0, visibleTop - padding) / rowStride)
```

For small padding values (less than `cellHeight`) this typically means one row too few at the top, but the effect compounds with small `aspectRatio` (tall cells).

---

## Type / API Issues

### 3. Non-null assertion `controlledFocusedIndex!` (`useGridGallery.ts:433`)

```ts
const effectiveFocusedIndex = isControlled ? controlledFocusedIndex! : focusedIndex
```

The `!` non-null assertion is against the workspace convention (type casting not allowed). The logic already proves it's defined (`isControlled = controlledFocusedIndex !== undefined`), so the clean fix is `controlledFocusedIndex ?? focusedIndex`.

### 4. `GridLayoutRow.width` actually stores `cellWidth`, not row width (`types.ts:49-53`)

The field name `width` on `GridLayoutRow<T>` stores the individual cell width (same as `cellWidth` passed into `computeGridLayout`). A row's actual rendered width would be `width * columns + gap * (columns - 1)`. The naming is misleading for consumers of the public `computeGridLayout` API.

### 5. `GridItemRenderHandlers` has three redundant paths to the same data (`types.ts:40-43`)

`handlers.onLoad`, `handlers.imageProps.onLoad`, and `handlers.getImageProps().onLoad` all resolve to the same function. The type extends `GridItemImageProps`, contains an `imageProps: GridItemImageProps` field, and adds `getImageProps: () => GridItemImageProps`. This API surface will need to be maintained indefinitely.

---

## Performance / Code Quality

### 6. `itemKeys` computed twice (`useGridGallery.ts:147` and `GridGallery.tsx:124`)

Both `useGridGallery` and `GridGallery` independently compute `new Set(items.map(item => item.key))` via `useMemo`. When `GridGallery` is used, this runs twice per render on the same `items` array. `useGridGallery` could return `itemKeys` so `GridGallery` can reuse it.

### 7. `CellProps<T>` and `MemoCellProps` are near-duplicate types (`GridGallery.tsx:25-47`)

The only difference is `entry: GridRow<T>['items'][number]` vs `entry: GridRow<unknown>['items'][number]`. The intermediate `GridGalleryCell<T>` wrapper exists solely to bridge generic→unknown erasure for `memo`. This creates two near-identical type definitions and a pass-through component that adds no logic.

### 8. `useVirtualWindow`: window resize fires `publishRange` synchronously, scroll fires via RAF (`useVirtualWindow.ts:64-66`)

```ts
target.addEventListener('scroll', scheduleUpdate, { passive: true })  // RAF-debounced
if (target === window) {
  window.addEventListener('resize', publishRange, { passive: true })  // direct, no debounce
}
```

Rapid window resize events will trigger multiple synchronous state updates before a paint, while scroll events are coalesced via `requestAnimationFrame`. Both should go through `scheduleUpdate` for consistency.

### 9. `scrollContainerRef` object identity instability (`useVirtualWindow.ts:79`)

`scrollContainerRef` is in the `useEffect` dependency array. If the caller passes a `RefObject` (stable) this is fine, but if they pass a raw `HTMLElement | null` value that's re-created each render, the effect will tear down and re-attach its scroll/resize listeners on every render. This is undocumented.

### 10. `navigateTo` calls `querySelector` even when `navigable` is false (`useGridGallery.ts:374`)

`data-grid-index` attributes are only rendered when `navigable === true` (`GridGallery.tsx:66-69`). When `navigable` is false, the `querySelector` will always fail and fall back to the scroll + `pendingFocusRef` path unnecessarily. Guards at the start of `navigateTo` and `handleItemKeyDown` would prevent this.

---

## Second Pass — Verification Notes

All ten first-pass findings were confirmed. Two refinements:

- **Finding 1 is worse than stated.** Besides inflating scroll height, the extra CSS gap after the top spacer shifts every visible row down by `gap` pixels relative to where the index arithmetic assumes it is, so the virtual window itself is misaligned by one gap once scrolled. Fix together with the spacer math.
- **Finding 10 is mostly unreachable through `GridGallery`**, since `onKeyDown` is only attached when `navigable` is true (`GridGallery.tsx:62-69`). It only matters for direct `useGridGallery` consumers who call `handleItemKeyDown` themselves. Lower priority than first stated.

---

## Second Pass — Bugs / Correctness

### 11. `overscan` and `padding` skip the sanitization every other option gets (`useGridGallery.ts:220`, `useGridGallery.ts:141`)

`columns`, `gap`, and `aspectRatio` are run through `finitePositive`/`finiteNonNegative`, but `overscan ?? cellHeight * 4` and `padding = 0` are used raw. A `NaN` overscan propagates: `firstIndex` becomes `NaN`, the row loop never executes, and the gallery renders completely blank. A `NaN` or negative `padding` corrupts `scrollToRow` positions. The adversarial test suite covers the other three options but not these two.

### 12. The roving tabindex can have zero tab stops (`GridGallery.tsx:65`, `useGridGallery.ts:127`)

Only the cell where `focusedIndex === itemIndex` gets `tabIndex={0}`; all others get `-1`. Two ways the tab-stop cell can fail to exist:

- **Virtualized:** `focusedIndex` defaults to 0, so once the user scrolls past row 0, the focused cell unmounts and no mounted cell is tabbable — the grid becomes unreachable by keyboard.
- **Items shrink:** `focusedIndex` is never clamped when `items.length` decreases, so it can point past the end of the list permanently.

Fix: clamp the effective focused index to `items.length - 1`, and when virtualized, fall back to making the first *mounted* cell tabbable if the focused one isn't mounted.

### 13. Virtualized galleries paint empty on the first frame and render nothing under SSR (`useVirtualWindow.ts:28`, `useGridGallery.ts:240`)

`range` starts `null` and is first populated by `publishRange()` inside a post-paint `useEffect`, and `baseRows` returns `[]` while `virtualize && virtualWindow === null`. So there is always one committed frame with zero rows (a flash on mount and a guaranteed re-layout), and server-rendered output contains no items at all. Options: run the initial publish in `useLayoutEffect`, or render an unvirtualized first window (e.g. rows 0..N) until the first measurement arrives.

---

## Second Pass — Performance

### 14. Every scroll/resize event produces a new `range` object even when values are unchanged (`useVirtualWindow.ts:43-49`)

`setRange({ top, bottom })` always allocates, so ResizeObserver jitter or same-position scroll events rerender the whole hook tree. Cheap fix:

```ts
setRange(prev => prev && prev.top === top && prev.bottom === bottom ? prev : { top, bottom })
```

This matters because `virtualRange` is a dependency of the `virtualWindow` memo and everything downstream.

### 15. Row reuse is aligned by array offset, not `rowIndex` (`useGridGallery.ts:289-291`)

The `rows` memo compares `baseRows[i]` against `previousRows[i]`. When the virtual window shifts by one row, every position's `rowIndex` changes, so `rowsMatch` fails for all of them and every visible row and item object is rebuilt — which defeats `MemoGridGalleryCell` (its `entry` prop changes identity) and rerenders every mounted cell on each scroll step. Indexing `previousRows` by `rowIndex` instead would preserve the overlapping rows, which is most of the window.

### 16. The scroll element is resolved once and never re-resolved (`useVirtualWindow.ts:62`, `useVirtualWindow.ts:79`)

The effect reads `resolveScrollEl(scrollContainerRef)` at mount; deps are `[enabled, containerRef, scrollContainerRef]`, which for a `RefObject` never change. If `.current` is still `null` when the effect runs (gallery mounts before the scroll container, or the container is conditionally rendered), the listener silently attaches to `window` and stays there. Same if the scroll container element is remounted. This is the sharper version of finding 9 — not just identity instability, but a stale-element trap with a stable ref.

---

## Second Pass — API / Edge Cases

### 17. Broken images never resolve (`useGridGallery.ts:186`)

`onError` is a deliberate no-op for layout (documented), but the consumer-facing consequence is that an item whose image fails stays `loaded: false` forever — with the typical fade-in-on-loaded pattern, that's a permanently invisible cell with no way to detect it through this API. Consider either treating error as terminal-loaded or exposing an `error` flag alongside `loaded` in `GridItemLayout`.

### 18. Reported `width` vs rendered width drift (`useGridGallery.ts:209`, `GridGallery.tsx:163`)

Cells are laid out with `repeat(columns, 1fr)`, so the real track width is `(containerWidth - gaps) / columns` (fractional), while the API reports the floored integer. Sub-pixel only, but consumers using `width` for `sizes`/`srcset` math should know it's approximate, and `cellHeight` is derived from the floored width so the rendered aspect ratio is very slightly off the requested one.

---

## Second Pass — Tests

### 19. Coverage gaps line up with the two confirmed bugs

No test exercises `virtualize` together with a non-zero `gap` (would catch finding 1) or with `padding` (would catch finding 2 — the one existing padding test uses keyboard scroll, not the window calculation). Adding a scroll-height invariant test (`topSpacer + rows + bottomSpacer + gaps === non-virtualized height`) would lock both down.

---

## Priority Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | Bug | Spacer heights inflated by `gap`, causing incorrect scroll height and row misalignment in virtualized galleries |
| 2 | Bug | `padding` not subtracted before virtual row index calculation |
| 3 | ~~Type~~ | ~~`!` non-null assertion against workspace convention~~ ✓ |
| 4 | API | `GridLayoutRow.width` misleadingly named (stores `cellWidth`) |
| 5 | API | `GridItemRenderHandlers` exposes three redundant paths to the same props |
| 6 | ~~Perf~~ | ~~`itemKeys` computed independently in both `useGridGallery` and `GridGallery`~~ ✓ |
| 7 | ~~Quality~~ | ~~`CellProps<T>` / `MemoCellProps` near-duplicate types with pass-through wrapper~~ ✓ |
| 8 | Quality | Inconsistent debounce strategy for scroll vs. resize in `useVirtualWindow` |
| 9 | Quality | Undocumented `scrollContainerRef` identity instability (superseded by 16) |
| 10 | Quality | Unnecessary `querySelector` when `navigable` is false (hook consumers only) |
| 11 | Bug | `overscan`/`padding` unsanitized — `NaN` overscan blanks the gallery |
| 12 | Bug (a11y) | Roving tabindex can have zero tab stops (virtualized scroll, or shrinking items) |
| 13 | Bug | Virtualized first paint is empty; no SSR content |
| 14 | Perf | New `range` object allocated per scroll/resize event even when unchanged |
| 15 | Perf | Row reuse keyed by array offset defeats cell memoization on every scroll step |
| 16 | Bug | Scroll element resolved once at mount — stale-element trap when ref is late or remounts |
| 17 | API | Broken images stay `loaded: false` forever; no error state exposed |
| 18 | API | Reported integer `width` differs sub-pixel from rendered `1fr` track width |
| 19 | Tests | No coverage for `virtualize` + `gap` or `virtualize` + `padding` |

---

## Repair Plan

### Clusters (must be done together)

- **Cluster A — Virtualization geometry: 1, 2, 11, 19.** → **Fable.** All live in the same ~20 lines of the `virtualWindow` memo; one scroll-height invariant test proves all of it. Subtle off-by-one work where a wrong fix still passes existing tests.
- **Cluster B — `useVirtualWindow` rework: 8, 9, 13, 14, 16.** → **Fable.** All five live in one `useEffect`; 9 and 16 share a fix, 8 and 14 modify the same functions, 13 changes when the initial publish happens (design decision: seeded first window vs. `useLayoutEffect` publish — judgment work, not mechanical).
- **Cluster C — Focus & keyboard navigation: 10, 12.** → **Opus.** Both touch `navigateTo`/`handleItemFocus`/cell `tabIndex` logic. Roving-tabindex semantics under virtualization need care, but the design space is the well-trodden ARIA grid pattern.
- **Cluster D — Public API revision: 4, 5, 17, 18.** → **Opus.** Breaking or surface-area changes to exported types; ship as one coordinated semver bump through the slithy monorepo. API design judgment plus changelog discipline, not hard algorithms.

### Independent items

| Finding | Task | Model |
|---|---|---|
| ~~3~~ | ~~Replace `controlledFocusedIndex!` with `?? focusedIndex`~~ | ~~Sonnet~~ ✓ |
| ~~6~~ | ~~Return `itemKeys` from `useGridGallery`, reuse in `GridGallery`~~ | ~~Sonnet~~ ✓ |
| ~~7~~ | ~~Collapse `CellProps`/`MemoCellProps` duplication and the pass-through wrapper~~ | ~~Sonnet~~ ✓ |
| 15 | Re-key row reuse by `rowIndex` instead of array offset | Opus |
| — | Delete the empty `src/docs/` directory | anyone |

Finding 15 is independent in scope (the `rows` memo only) but subtle — it interacts with `previousRowsRef`, the StrictMode reuse tests, and the memo-cell identity guarantees, so it is Opus-grade rather than mechanical.

### Sequencing

1. Cluster A before Cluster B — A establishes the correct scroll-height baseline B's tests build on.
2. Cluster C, finding 15, and finding 3 all edit `useGridGallery.ts` — run sequentially with A, not in parallel worktrees. Findings 6 and 7 mostly touch `GridGallery.tsx` and are safe alongside.
3. Cluster D last — renames ripple through the files everything else edits; sync + publish through slithy in one version bump.

A practical batching: Sonnet knocks out 3/6/7 in one small PR first (low risk, shrinks the diff surface), Fable does Cluster A then Cluster B, Opus does Cluster C and finding 15, and Cluster D ships as its own reviewed breaking-change PR at the end.
