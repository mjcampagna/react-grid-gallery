# @slithy/react-grid-gallery

React photo gallery with a fixed-column grid layout. Cells have a uniform size determined by column count and aspect ratio. Supports responsive column counts, configurable gaps and aspect ratios, and opt-in virtualization to keep the DOM small regardless of collection size.

## Features

- **Uniform cell size** — all cells share the same width and height, computed from column count and aspect ratio
- **Responsive** — `columns`, `gap`, and `aspectRatio` accept `(containerWidth: number) => number` callbacks, re-evaluated on every container resize
- **Virtualization** — opt-in `virtualize` prop renders only rows near the viewport via spacer divs; no overhead when disabled
- **`loaded` state** — track browser image load state per item for fade-in effects
- **Three-layer API** — use the full component, the hook, or the pure layout function depending on how much control you need
- ESM only · zero runtime dependencies · `sideEffects: false`

---

## Installation

```bash
npm install @slithy/react-grid-gallery
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
| `virtualize` | `boolean` | `false` | Only render rows near the viewport; spacer divs maintain full scroll height. Opt-in — no overhead when disabled. |
| `overscan` | `number` | `cellHeight * 2` | Extra pixels to render beyond the viewport edge in each direction |
| `scrollContainerRef` | `ScrollContainerRef` | — | Required when the gallery is inside a scrollable div. The scroll listener attaches to this element instead of `window`. |

**`renderItem` arguments:**

| Argument | Type | Description |
|---|---|---|
| `item` | `GalleryItem<T>` | The original item |
| `layout.loaded` | `boolean` | Whether the browser has confirmed this image loaded via `handlers.onLoad` |
| `handlers.onLoad` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onLoad={...}>` to mark the item loaded |
| `handlers.onError` | `ReactEventHandler<HTMLImageElement>` | Pass to `<img onError={...}>` for error handling |

---

## Virtualization

Enable `virtualize` to keep the DOM small for large collections. Only rows within the viewport (plus `overscan`) are rendered; spacer divs above and below maintain the full scroll height.

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

const { containerRef, rows, cellWidth, cellHeight, gap, columns, onLoad, onError, virtualWindow } =
  useGridGallery(items, options, scrollContainerRef)
```

**Returns:**

| Property | Type | Description |
|---|---|---|
| `containerRef` | `RefObject<HTMLDivElement \| null>` | Attach to your container element to observe its width |
| `rows` | `GridRow<T>[]` | Computed layout rows, each with `height` and `items` |
| `cellWidth` | `number` | Resolved cell width in pixels |
| `cellHeight` | `number` | Resolved cell height in pixels |
| `gap` | `number` | Resolved gap in pixels |
| `columns` | `number` | Resolved column count |
| `onLoad` | `(key: string \| number) => void` | Call when an image loads to mark it loaded |
| `onError` | `(key: string \| number) => void` | Call when an image fails to load |
| `virtualWindow` | `{ firstIndex, lastIndex, topSpacerHeight, bottomSpacerHeight } \| null` | Set when `virtualize` is true |

---

## `computeGridLayout`

The pure layout function. Chunks items into rows with uniform cell dimensions. No React dependency.

```ts
import { computeGridLayout } from '@slithy/react-grid-gallery'

const rows = computeGridLayout(items, 4, 200, 250)
// 4 columns, 200px wide cells, 250px tall cells
```

**Returns:** `GridLayoutRow<T>[]` — each row has `items: GalleryItem<T>[]`, `width: number`, and `height: number`.
