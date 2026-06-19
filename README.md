# @slithy/react-grid-gallery

React photo gallery with a fixed-column grid layout. Cells have a uniform size determined by column count and aspect ratio. Supports responsive column counts, configurable gaps and aspect ratios, and opt-in virtualization to keep the DOM small regardless of collection size.

## Features

- **Uniform cell size** — all cells share the same width and height, computed from column count and aspect ratio
- **Responsive** — `columns`, `gap`, and `aspectRatio` accept `(containerWidth: number) => number` callbacks, re-evaluated on every container resize
- **Virtualization** — opt-in `virtualize` prop renders only rows near the viewport via spacer divs; no overhead when disabled
- **`loaded` state** — track browser image load state per item for fade-in effects
- **Keyboard navigation** — opt-in `navigable` prop; full arrow key and Home/End navigation with ARIA grid semantics
- **Controlled focus** — `focusedIndex` prop lets external state own the roving tabindex seat
- **Render metrics** — opt-in `onRenderMetricsChange` callback reports mounted vs. total row counts on each render cycle
- **Three-layer API** — use the full component, the hook, or the pure layout function depending on how much control you need
- ESM only · zero runtime dependencies · `sideEffects: false`

---

## Installation

```bash
pnpm add @slithy/react-grid-gallery
```

**Peer dependencies:** `react@^17 || ^18 || ^19`

---

## `<GridGallery>`

The main component. Accepts a list of items and a `renderItem` function; handles all layout internally. Each item is rendered inside a sized wrapper div — `renderItem` only needs to fill it.

```tsx
import { GridGallery } from '@slithy/react-grid-gallery'

<GridGallery
  items={photos}
  columns={4}
  gap={4}
  aspectRatio={1}
  renderItem={(item, { loaded }, handlers) => (
    <img
      src={item.src}
      alt={item.alt}
      {...handlers.imageProps}
      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }}
    />
  )}
/>
```

`columns`, `gap`, and `aspectRatio` also accept a callback for responsive layouts — the callback receives the current container width and is re-evaluated whenever the container resizes:

```tsx
<GridGallery
  items={photos}
  columns={w => w < 600 ? 2 : w < 1100 ? 3 : 4}
  gap={w => w < 600 ? 2 : 4}
  aspectRatio={w => w < 600 ? 1 : 4 / 5}
  renderItem={...}
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `GalleryItem<T>[]` | — | Items to display. Each must have a `key`. |
| `renderItem` | `(item, layout, handlers) => ReactNode` | — | Render function called for each item. The item is already wrapped in a sized div — fill it with your content. |
| `columns` | `number \| (containerWidth: number) => number` | — | Number of columns |
| `gap` | `number \| (containerWidth: number) => number` | `0` | Gap between cells in pixels |
| `aspectRatio` | `number \| (containerWidth: number) => number` | `1` | Cell aspect ratio as width/height — `1` is square, `4/5` is portrait, `16/9` is landscape |
| `padding` | `number` | `0` | Uniform padding inside the grid container in pixels |
| `virtualize` | `boolean` | `false` | Only render rows near the viewport; spacer divs maintain full scroll height. Opt-in — no overhead when disabled. |
| `overscan` | `number` | `cellHeight * 4` | Extra pixels to render beyond the viewport edge in each direction |
| `scrollContainerRef` | `ScrollContainerRef` | — | Required when the gallery is inside a scrollable div. The scroll listener attaches to this element instead of `window`. |
| `navigable` | `boolean` | `false` | Enable keyboard navigation and ARIA grid semantics |
| `focusedIndex` | `number` | — | Controlled focused index. When provided, suppresses internal focus state — the prop owns the roving tabindex seat. |
| `onFocusedIndexChange` | `(index: number) => void` | — | Fired when navigation would change the focused index. Only needed when using `focusedIndex` and want to sync external state. |
| `onActivate` | `(index: number, shiftKey: boolean) => void` | — | Fired when Space or Enter is pressed on a focused cell |
| `onRenderMetricsChange` | `(metrics: GridRenderMetrics) => void` | — | Fired whenever the rendered row window changes. Should be stable (e.g. `useCallback`). See `GridRenderMetrics`. |

**`renderItem` arguments:**

| Argument | Type | Description |
|---|---|---|
| `item` | `GalleryItem<T>` | The original item |
| `layout.loaded` | `boolean` | Whether the browser has settled this image — set on both load **and** error, so a broken image still becomes visible rather than staying hidden behind a fade-in |
| `layout.focused` | `boolean` | Whether this cell is currently focused. Always `false` when `navigable` is not set. |
| `handlers.imageProps` | `{ onLoad, onError }` | Stable image props object for the current item. Spread onto your `<img>`: `{...handlers.imageProps}`. |

---

## Virtualization

Enable `virtualize` to keep the DOM and render work small for large collections. Only rows within the viewport (plus `overscan`) are materialized; spacer divs above and below maintain the full scroll height.

```tsx
<GridGallery
  items={photos}
  columns={4}
  virtualize
  renderItem={...}
/>
```

**With a scrollable container:** if the gallery is inside a scrollable div rather than the page itself scrolling, pass a ref to that element via `scrollContainerRef`. Without it, the scroll listener attaches to `window` and never fires.

```tsx
const scrollRef = useRef<HTMLDivElement>(null)

<div ref={scrollRef} style={{ overflowY: 'auto', height: '100%' }}>
  <GridGallery
    items={photos}
    columns={4}
    virtualize
    scrollContainerRef={scrollRef}
    renderItem={...}
  />
</div>
```

---

## Consumer performance guide

The gallery can only skip work when the inputs it receives are stable. For large collections, keep the array passed to `items` stable across unrelated parent renders:

```tsx
const items = useMemo(
  () => photos.map(photo => ({ key: photo.id, ...photo })),
  [photos],
)

<GridGallery items={items} columns={4} virtualize renderItem={renderPhoto} />
```

The same applies to responsive option callbacks. Define them outside the component or memoize them with `useCallback` so the gallery is not handed new function identities on every render:

```tsx
const columns = useCallback((width: number) => (width < 700 ? 2 : 4), [])

<GridGallery items={items} columns={columns} virtualize renderItem={renderPhoto} />
```

When `virtualize` is enabled, `renderItem` is called for the currently rendered window as scrolling changes. If your item UI is expensive, render a memoized item component and pass the stable image props object through unchanged:

```tsx
type PhotoProps = {
  item: PhotoItem
  loaded: boolean
  imageProps: {
    onLoad: React.ReactEventHandler<HTMLImageElement>
    onError: React.ReactEventHandler<HTMLImageElement>
  }
}

const Photo = React.memo(
  ({ item, loaded, imageProps }: PhotoProps) => (
    <img
      src={item.src}
      alt={item.alt}
      loading="lazy"
      decoding="async"
      {...imageProps}
      style={{ opacity: loaded ? 1 : 0 }}
    />
  ),
  (prev, next) => prev.item === next.item && prev.loaded === next.loaded && prev.imageProps === next.imageProps,
)

const renderPhoto = useCallback(
  (item: PhotoItem, { loaded }, handlers) => (
    <Photo item={item} loaded={loaded} imageProps={handlers.imageProps} />
  ),
  [],
)
```

Prefer deriving gallery data from state during render (`useMemo`) over syncing a second item array in an effect. Use stable item keys that do not change when sorting or filtering. For image-heavy grids, pass `loading="lazy"` and `decoding="async"` to your `<img>` elements; virtualization limits mounted DOM, while browser image loading still determines when network and decode work begins.

If you consume `useGridGallery` directly, remember that `rows` means "render rows" when `virtualize` is enabled. Use `totalRows`, `row.rowIndex`, and item `itemIndex` / `colIndex` for ARIA metadata, scroll math, analytics, and any UI that needs full-grid indices.

For custom item rendering with your own memoized components, prefer `getItemImageProps(key)` over creating per-item `onLoad` / `onError` closures during render.

---

## Keyboard navigation

Enable with `navigable`. Arrow keys move focus through the grid; Space/Enter activate the focused item.

```tsx
<GridGallery
  items={photos}
  columns={4}
  navigable
  onActivate={(index, shiftKey) => openLightbox(index, shiftKey)}
  renderItem={(item, { loaded, focused }, handlers) => (
    <img
      src={item.src}
      style={{ outline: focused ? '2px solid blue' : 'none', opacity: loaded ? 1 : 0 }}
      {...handlers.imageProps}
    />
  )}
/>
```

**Key bindings:**

| Key | Action |
|---|---|
| Arrow keys | Move focus one cell in that direction; Left/Right wrap across row boundaries |
| `Home` / `End` | First / last item in the current row |
| `Ctrl+Home` / `Ctrl+End` | First / last item in the grid |
| `Space` / `Enter` | Fire `onActivate` |

When `navigable` is true, `role="grid"`, `role="row"`, and `role="gridcell"` are added to the container, row, and cell elements respectively, with `aria-rowcount`, `aria-colcount`, `aria-rowindex`, and `aria-colindex`.

**Controlled focus:** pass `focusedIndex` to drive the roving tabindex seat from external state. Internal focus state is suppressed — the prop owns the seat. Pair with `onFocusedIndexChange` if you need to react to keyboard navigation:

```tsx
const [activeIndex, setActiveIndex] = useState(0)

<GridGallery
  items={photos}
  columns={4}
  navigable
  focusedIndex={activeIndex}
  onFocusedIndexChange={setActiveIndex}
  renderItem={...}
/>
```

---

## `GalleryItem<T>`

Items passed to `GridGallery` must satisfy `GalleryItem<T>`:

```ts
type GalleryItem<T> = T & {
  key: string | number
}
```

---

## `GridRenderMetrics`

Passed to `onRenderMetricsChange` whenever the rendered row window changes.

```ts
type GridRenderMetrics = {
  virtualized: boolean
  mountedItemCount: number
  mountedRowCount: number
  totalItemCount: number
  totalRowCount: number
  firstMountedRowIndex: number | null
  lastMountedRowIndex: number | null
}
```

| Field | Description |
|---|---|
| `virtualized` | Whether `virtualize` is enabled |
| `mountedItemCount` | Number of items currently in the DOM |
| `mountedRowCount` | Number of rows currently in the DOM |
| `totalItemCount` | Total items across the full grid |
| `totalRowCount` | Total rows across the full grid |
| `firstMountedRowIndex` | Row index of the first mounted row (`null` if no rows) |
| `lastMountedRowIndex` | Row index of the last mounted row (`null` if no rows) |

When `virtualize` is disabled, `mountedItemCount === totalItemCount` and `mountedRowCount === totalRowCount`.

`onRenderMetricsChange` should be stable — wrap it in `useCallback` to avoid spurious fires when the parent re-renders.

---

## `useGridGallery`

The hook underlying `<GridGallery>`. Use this directly for custom rendering or when you need lower-level control.

```ts
import { useGridGallery } from '@slithy/react-grid-gallery'

const { containerRef, rows, totalRows, cellWidth, cellHeight, gap, columns, onLoad, onError, getItemImageProps, virtualWindow } =
  useGridGallery(items, options, scrollContainerRef)
```

**Returns:**

| Property | Type | Description |
|---|---|---|
| `containerRef` | `RefObject<HTMLDivElement \| null>` | Attach to your container element to observe its width |
| `rows` | `GridRow<T>[]` | Render rows. When `virtualize` is enabled, this contains only the visible/overscanned rows. |
| `totalRows` | `number` | Total number of rows in the full grid, regardless of virtualization. Use this for ARIA row counts and full-grid metadata. |
| `cellWidth` | `number` | Resolved cell width in pixels |
| `cellHeight` | `number` | Resolved cell height in pixels |
| `gap` | `number` | Resolved gap in pixels |
| `columns` | `number` | Resolved column count |
| `itemKeys` | `ReadonlySet<string \| number>` | Set of all item keys in the full collection. Useful for pruning per-item caches keyed on item key. |
| `onLoad` | `(key: string \| number) => void` | Call when an image loads to mark it loaded |
| `onError` | `(key: string \| number) => void` | Call when an image fails to load — marks the item loaded (terminal) so its cell still appears |
| `getItemImageProps` | `(key: string \| number) => { onLoad, onError }` | Returns a stable image props object for the given item key. |
| `virtualWindow` | `{ firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight } \| null` | Rendered row window and spacer heights when `virtualize` is true |
| `focusedIndex` | `number` | Currently focused item index. Reflects `options.focusedIndex` when controlled. |
| `handleItemFocus` | `(index: number) => void` | Pass to each cell's `onFocus` handler to sync focus state |
| `handleItemKeyDown` | `(itemIndex: number, e: React.KeyboardEvent) => void` | Pass to each cell's `onKeyDown` handler to enable keyboard navigation |

`GridRow<T>` includes `rowIndex`, `startIndex`, `height`, and `items`. Each item entry includes the original `item`, `itemIndex`, `colIndex`, `width`, `height`, and `loaded`.

---

## `computeGridLayout`

The pure layout function. Chunks items into rows with uniform cell dimensions. No React dependency.

```ts
import { computeGridLayout } from '@slithy/react-grid-gallery'

const rows = computeGridLayout(items, 4, 200, 250)
// 4 columns, 200px wide cells, 250px tall cells
```

**Returns:** `GridLayoutRow<T>[]` — each row has `items: GalleryItem<T>[]`, `cellWidth: number`, and `height: number`. `cellWidth` is the floored integer cell width; cells render as `1fr` tracks, so treat it as an approximation for `sizes`/`srcset`, not a pixel-exact width.

---

## Migration

### 1.0.0 (breaking)

This release revises the public API with no backward-compatibility shims.

**1. `GridItemRenderHandlers` collapsed to a single `imageProps` field.** The top-level handler spread and `getImageProps()` are removed; spread `imageProps` onto your `<img>`.

```tsx
// Before
renderItem={(item, layout, handlers) => <img {...handlers} />}
renderItem={(item, layout, handlers) => <img {...handlers.getImageProps()} />}

// After
renderItem={(item, layout, handlers) => <img {...handlers.imageProps} />}
```

**2. `GridLayoutRow.width` renamed to `cellWidth`.** Only affects direct `computeGridLayout` consumers.

```ts
// Before
rows.map(row => row.width)
// After
rows.map(row => row.cellWidth)
```

**3. `onError` now marks an item loaded (terminal) instead of being a no-op.** No code change required, but be aware: a failed image now flips `layout.loaded` to `true`, so a fade-in-on-`loaded` cell becomes visible (showing the broken `<img>`) rather than staying hidden. If you want to distinguish a broken image, branch inside your `renderItem` on your own error state.
