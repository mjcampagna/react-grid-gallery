# @slithy/react-grid-gallery

React photo gallery with a fixed-column grid layout. Cells have a uniform size determined by column count and aspect ratio. Supports responsive column counts, configurable gaps and aspect ratios, and opt-in virtualization to keep the DOM small regardless of collection size.

## Features

- **Uniform cell size** — all cells share the same width and height, computed from column count and aspect ratio
- **Responsive** — `columns`, `gap`, and `aspectRatio` accept `(containerWidth: number) => number` callbacks, re-evaluated on every container resize
- **Virtualization** — opt-in `virtualize` prop renders only rows near the viewport via spacer divs; no overhead when disabled
- **`loaded` state** — track browser image load state per item for fade-in effects
- **Keyboard navigation** — opt-in `navigable` prop; full arrow key and Home/End navigation with ARIA grid semantics
- **Controlled focus** — `focusedIndex` prop lets external state own the roving tabindex seat
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
      onLoad={handlers.onLoad}
      onError={handlers.onError}
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

**`renderItem` arguments:**

| Argument | Type | Description |
|---|---|---|
| `item` | `GalleryItem<T>` | The original item |
| `layout.loaded` | `boolean` | Whether the browser has confirmed this image loaded via `handlers.onLoad` |
| `layout.focused` | `boolean` | Whether this cell is currently focused. Always `false` when `navigable` is not set. |
| `handlers.onLoad` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onLoad={...}>` to mark the item loaded |
| `handlers.onError` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onError={...}>` for error handling |

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
      {...handlers}
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

## `useGridGallery`

The hook underlying `<GridGallery>`. Use this directly for custom rendering or when you need lower-level control.

```ts
import { useGridGallery } from '@slithy/react-grid-gallery'

const { containerRef, rows, totalRows, cellWidth, cellHeight, gap, columns, onLoad, onError, virtualWindow } =
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
| `onLoad` | `(key: string \| number) => void` | Call when an image loads to mark it loaded |
| `onError` | `(key: string \| number) => void` | Call when an image fails to load |
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

**Returns:** `GridLayoutRow<T>[]` — each row has `items: GalleryItem<T>[]`, `width: number`, and `height: number`.
