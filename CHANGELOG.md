# Changelog

## 2026-06-08

### Added

- `onRenderMetricsChange?: (metrics: GridRenderMetrics) => void` — optional callback fired whenever the rendered row window changes. Reports `virtualized`, `mountedItemCount`, `mountedRowCount`, `totalItemCount`, `totalRowCount`, `firstMountedRowIndex`, and `lastMountedRowIndex`. Useful for analytics, debugging, and scroll progress indicators. Should be stable (e.g. `useCallback`) to avoid spurious fires.
- `GridRenderMetrics` type is now exported from the package.

## 2026-05-30

### Breaking

- `useGridGallery().rows` now returns render rows when virtualization is enabled, rather than all layout rows.
- `GridRow<T>` now includes `rowIndex` and `startIndex`; row item entries now include `itemIndex` and `colIndex`.

### Added

- `useGridGallery()` now returns `totalRows` as the full grid row count, regardless of virtualization.

### Performance

- Virtualized grids now materialize only the visible/overscanned row window instead of computing every row and slicing afterward.
- Image load state updates now rebuild only render-window rows in virtualized mode.

## 2026-05-29

### Added

- `focusedIndex?: number` — controlled focused index prop. When provided, suppresses internal focus state; the prop owns the roving tabindex seat. Pair with `onFocusedIndexChange` if you need to react to keyboard navigation.
- `onFocusedIndexChange?: (index: number) => void` — optional callback fired when navigation would change the focused index

### Changed

- `onActivate` callback now receives `shiftKey: boolean` as a second argument: `(index: number, shiftKey: boolean) => void`
- Arrow key navigation is now skipped when the Meta key is held, allowing browser shortcuts (e.g. Cmd+Left/Right) to pass through

### Performance

- Row layout (`computeGridLayout`) is now memoized and skips entirely during scroll — O(n) work no longer runs on every animation frame

## 2026-05-25

### Added

- **Keyboard navigation** — opt in with `navigable: true` on `GridGallery` or `useGridGallery`
  - Arrow keys move focus through the grid; Up/Down move by row, Left/Right wrap across row boundaries
  - `Home` / `End` jump to the first/last item in the current row; `Ctrl+Home` / `Ctrl+End` jump to the first/last item in the grid
  - Space and Enter fire the new `onActivate` callback
  - Roving tabindex: only the focused cell is in the tab order
  - Works with virtualization — navigating to an off-screen item scrolls it into view before focusing
- `renderItem` layout argument now includes `focused: boolean` (always `false` when `navigable` is not set)
- ARIA grid semantics (`role="grid"`, `role="row"`, `role="gridcell"`, `aria-rowcount`, `aria-colcount`, `aria-rowindex`, `aria-colindex`) applied automatically when `navigable` is true

### Fixed

- Virtual window now recalculates when the scroll container element is resized (via `ResizeObserver`), not only on scroll
- Virtual window now recalculates on browser window resize when using window-level scrolling

### Changed

- Default `overscan` increased from `cellHeight * 2` to `cellHeight * 4` for smoother fast-scroll behavior

## 2026-05-22

### Added

- Initial implementation: `GridGallery` component, `useGridGallery` hook, `computeGridLayout` pure function
- `columns`, `gap`, and `aspectRatio` accept either a number or a responsive callback `(containerWidth: number) => number`
- `padding` option adds uniform inset inside the grid container
- Opt-in row virtualization via `virtualize: boolean` and `overscan`
- `scrollContainerRef` for galleries inside a scrollable div rather than the page
- `GridGallery` owns cell sizing — the wrapper div for each `renderItem` output is sized to `cellWidth × cellHeight` automatically; consumers do not need to apply dimensions themselves
- `onLoad` / `onError` handlers exposed from `useGridGallery`; `loaded: boolean` passed to `renderItem` for fade-in effects
