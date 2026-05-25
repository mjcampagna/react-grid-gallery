# Changelog

## 2026-05-25

### Added

- **Keyboard navigation** — opt in with `navigable: true` on `GridGallery` or `useGridGallery`
  - Arrow keys move focus through the grid; Up/Down move by row, Left/Right wrap across row boundaries
  - `Home` / `End` jump to the first/last item in the current row; `Ctrl+Home` / `Ctrl+End` jump to the first/last item in the grid
  - Space and Enter fire the new `onActivate: (index: number) => void` callback
  - Roving tabindex: only the focused cell is in the tab order
  - Works with virtualization — navigating to an off-screen item scrolls it into view before focusing
- `renderItem` layout argument now includes `focused: boolean` (always `false` when `navigable` is not set)
- ARIA grid semantics (`role="grid"`, `role="row"`, `role="gridcell"`, `aria-rowcount`, `aria-colcount`, `aria-rowindex`, `aria-colindex`) applied automatically when `navigable` is true

## 2026-05-22

### Added

- Initial implementation: `GridGallery` component, `useGridGallery` hook, `computeGridLayout` pure function
- `columns`, `gap`, and `aspectRatio` accept either a number or a responsive callback `(containerWidth: number) => number`
- `padding` option adds uniform inset inside the grid container
- Opt-in row virtualization via `virtualize: boolean` and `overscan` (defaults to two cell-heights)
- `scrollContainerRef` for galleries inside a scrollable div rather than the page
- `GridGallery` owns cell sizing — the wrapper div for each `renderItem` output is sized to `cellWidth × cellHeight` automatically; consumers do not need to apply dimensions themselves
- `onLoad` / `onError` handlers exposed from `useGridGallery`; `loaded: boolean` passed to `renderItem` for fade-in effects
