import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode, createElement, memo, useRef } from 'react'

import { GridGallery } from '../GridGallery'
import { useGridGallery } from '../useGridGallery'
import type { GalleryItem, GridOptions } from '../types'

// ─── ResizeObserver mock ──────────────────────────────────────────────────────
//
// The hook attaches ResizeObserver inside useEffect. These tests need to trigger
// both generic width updates and target-specific resize invalidation, so the mock
// tracks observed elements and lets us fire callbacks manually.

type ResizeObserverRecord = {
  callback: ResizeObserverCallback
  instance: ResizeObserver
  observed: Set<Element>
}

let fireResize: (width: number) => void = () => {}
let fireElementResize: (element: Element, size?: { width?: number; height?: number }) => void = () => {}

beforeEach(() => {
  const resizeObserverRecords: ResizeObserverRecord[] = []

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    private readonly observed = new Set<Element>()

    constructor(cb: ResizeObserverCallback) {
      resizeObserverRecords.push({
        callback: cb,
        instance: this as unknown as ResizeObserver,
        observed: this.observed,
      })
    }
    observe(element: Element) {
      this.observed.add(element)
    }
    disconnect() {}
  })

  fireResize = (width: number) =>
    act(() => {
      resizeObserverRecords.forEach(record => {
        record.callback(
          [{ contentRect: { width } } as ResizeObserverEntry],
          record.instance,
        )
      })
    })

  fireElementResize = (element: Element, size = {}) =>
    act(() => {
      resizeObserverRecords
        .filter(record => record.observed.has(element))
        .forEach(record => {
          record.callback(
            [{
              contentRect: {
                height: size.height ?? 0,
                width: size.width ?? 0,
              },
              target: element,
            } as ResizeObserverEntry],
            record.instance,
          )
        })
    })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function item(key: string): GalleryItem<{ key: string }> {
  return { key }
}

// 9 items, 3 columns, 300px wide → 100px cells (no gap)
const ITEMS = ['0','1','2','3','4','5','6','7','8'].map(item)
const OPTIONS: GridOptions = { columns: 3 }
const WIDTH = 300

const MANY_ITEMS = Array.from({ length: 100 }, (_, i) => item(String(i)))
type HookState = ReturnType<typeof useGridGallery<{ key: string }>>

function defineReadonlyNumber(el: HTMLElement, key: 'clientHeight', value: number): void {
  Object.defineProperty(el, key, { configurable: true, value })
}

function setVirtualRects(
  scrollEl: HTMLElement,
  gridEl: HTMLElement,
  {
    gridHeight = 2000,
    gridTop = () => -scrollEl.scrollTop,
    scrollHeight = 2000,
    scrollTop = 0,
    scrollViewportHeight = 200,
    scrollViewportTop = 0,
  }: {
    gridHeight?: number
    gridTop?: () => number
    scrollHeight?: number
    scrollTop?: number
    scrollViewportHeight?: number
    scrollViewportTop?: number
  } = {},
): void {
  Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: scrollHeight })
  let currentScrollTop = scrollTop
  Object.defineProperty(scrollEl, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: value => { currentScrollTop = value },
  })

  scrollEl.getBoundingClientRect = () => ({
    bottom: scrollViewportTop + scrollViewportHeight,
    height: scrollViewportHeight,
    left: 0,
    right: 500,
    top: scrollViewportTop,
    width: 500,
    x: 0,
    y: scrollViewportTop,
    toJSON: () => ({}),
  })
  gridEl.getBoundingClientRect = () => ({
    bottom: gridTop() + gridHeight,
    height: gridHeight,
    left: 0,
    right: 500,
    top: gridTop(),
    width: 500,
    x: 0,
    y: gridTop(),
    toJSON: () => ({}),
  })
}

function VirtualHookHarness({
  onValue,
  options = { columns: 5, virtualize: true, overscan: 0 },
}: {
  onValue: (value: HookState) => void
  options?: GridOptions
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const value = useGridGallery(MANY_ITEMS, options, scrollRef)
  onValue(value)
  return createElement(
    'div',
    { 'data-testid': 'scroll', ref: scrollRef },
    createElement('div', { 'data-testid': 'grid', ref: value.containerRef }),
  )
}

function VirtualGalleryHarness() {
  const scrollRef = useRef<HTMLDivElement>(null)
  return createElement(
    'div',
    { 'data-testid': 'scroll', ref: scrollRef },
    createElement(GridGallery, {
      items: MANY_ITEMS,
      columns: 5,
      virtualize: true,
      overscan: 0,
      scrollContainerRef: scrollRef,
      navigable: true,
      renderItem: galleryItem => createElement('span', null, galleryItem.key),
    }),
  )
}

function getLatest(latest: HookState | null): HookState {
  if (latest === null) throw new Error('hook did not render')
  return latest
}

function buildRenderCounts(keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.map(key => [key, 0]))
}

// ─── Layout ───────────────────────────────────────────────────────────────────

describe('layout', () => {
  it('returns empty rows before a resize fires', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, OPTIONS))
    expect(result.current.rows).toHaveLength(0)
    expect(result.current.cellWidth).toBe(0)
  })

  it('computes cellWidth and rows after a resize', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, OPTIONS))
    fireResize(WIDTH)
    expect(result.current.cellWidth).toBe(100)
    expect(result.current.rows).toHaveLength(3)
    expect(result.current.totalRows).toBe(3)
    expect(result.current.columns).toBe(3)
  })

  it('respects gap when computing cellWidth', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { columns: 3, gap: 10 }))
    // (300 - 10*2) / 3 = 280/3 = floor(93.3) = 93
    fireResize(WIDTH)
    expect(result.current.cellWidth).toBe(93)
    expect(result.current.gap).toBe(10)
  })

  it('resolves a responsive columns callback', () => {
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { columns: w => (w < 400 ? 2 : 4) })
    )
    fireResize(300)
    expect(result.current.columns).toBe(2)
    fireResize(500)
    expect(result.current.columns).toBe(4)
  })

  it('returns indexed rows and items', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, OPTIONS))
    fireResize(WIDTH)

    expect(result.current.rows[1]).toMatchObject({
      rowIndex: 1,
      startIndex: 3,
      height: 100,
    })
    expect(result.current.rows[1].items[2]).toMatchObject({
      itemIndex: 5,
      colIndex: 2,
      width: 100,
      height: 100,
    })
  })

  it('materializes only visible rows when virtualized', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, { onValue: value => { latest = value } }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const state = getLatest(latest)
    expect(state.totalRows).toBe(20)
    expect(state.rows).toHaveLength(2)
    expect(state.rows.map(row => row.rowIndex)).toEqual([0, 1])
    expect(state.rows[1].items.map(entry => entry.itemIndex)).toEqual([5, 6, 7, 8, 9])
  })

  it('updates visible rows when scrolling deeper into the virtual window', () => {
    let latest: HookState | null = null

    render(createElement(VirtualHookHarness, { onValue: value => { latest = value } }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    scrollEl.scrollTop = 500
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const state = getLatest(latest)
    expect(state.rows).toHaveLength(2)
    expect(state.rows.map(row => row.rowIndex)).toEqual([5, 6])
    expect(state.rows[0].items.map(entry => entry.itemIndex)).toEqual([25, 26, 27, 28, 29])
  })

  it('keeps virtualized rows limited after offscreen loads', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, { onValue: value => { latest = value } }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })
    act(() => { getLatest(latest).onLoad('99') })

    const state = getLatest(latest)
    expect(state.rows).toHaveLength(2)
    expect(state.rows.flatMap(row => row.items.map(entry => entry.item.key))).not.toContain('99')
  })

  it('recomputes the virtual window when the scroll viewport resizes', () => {
    let latest: HookState | null = null

    render(createElement(VirtualHookHarness, { onValue: value => { latest = value } }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl, {
      scrollViewportHeight: 200,
    })

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(getLatest(latest).rows).toHaveLength(2)

    defineReadonlyNumber(scrollEl, 'clientHeight', 300)
    setVirtualRects(scrollEl, gridEl, {
      scrollViewportHeight: 300,
    })
    fireElementResize(scrollEl, { height: 300, width: 500 })

    const state = getLatest(latest)
    expect(state.rows).toHaveLength(3)
    expect(state.rows.map(row => row.rowIndex)).toEqual([0, 1, 2])
  })

  it('recomputes the virtual window when the gallery offset shifts after layout changes', () => {
    let latest: HookState | null = null
    let currentGridTop = 0

    render(createElement(VirtualHookHarness, { onValue: value => { latest = value } }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl, {
      gridTop: () => currentGridTop,
    })

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(getLatest(latest).rows.map(row => row.rowIndex)).toEqual([0, 1])

    currentGridTop = -500
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const state = getLatest(latest)
    expect(state.rows).toHaveLength(2)
    expect(state.rows.map(row => row.rowIndex)).toEqual([5, 6])
    expect(state.rows[0].items.map(entry => entry.itemIndex)).toEqual([25, 26, 27, 28, 29])
  })

  it('keeps rendering one row when cells are taller than the viewport', () => {
    let latest: HookState | null = null

    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 1, virtualize: true, overscan: 0, aspectRatio: 0.5 },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl, {
      gridHeight: 80000,
      scrollViewportHeight: 200,
    })

    fireResize(400)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const state = getLatest(latest)
    expect(state.cellHeight).toBe(800)
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]?.rowIndex).toBe(0)
    expect(state.rows[0]?.items.map(entry => entry.itemIndex)).toEqual([0])
  })

  it('returns stable image props for unaffected items across load updates', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, OPTIONS))
    fireResize(WIDTH)

    const before = result.current.getItemImageProps('0')

    act(() => { result.current.onLoad('1') })

    expect(result.current.getItemImageProps('0')).toBe(before)
    expect(result.current.getItemImageProps('0').onLoad).toBe(before.onLoad)
    expect(result.current.getItemImageProps('0').onError).toBe(before.onError)
  })

  it('prunes stale loaded state and preserves handler identity for unaffected keys', () => {
    const firstItems = ['0', '1', '2'].map(item)
    const secondItems = ['1', '3'].map(item)
    const thirdItems = ['0', '1'].map(item)
    const { result, rerender } = renderHook(
      ({ items }) => useGridGallery(items, OPTIONS),
      { initialProps: { items: firstItems } },
    )

    fireResize(WIDTH)

    const initialHandlersForOne = result.current.getItemImageProps('1')

    act(() => { result.current.onLoad('0') })
    expect(result.current.rows[0]?.items[0]?.loaded).toBe(true)

    rerender({ items: secondItems })

    expect(result.current.getItemImageProps('1')).toBe(initialHandlersForOne)
    expect(result.current.rows[0]?.items[0]?.item.key).toBe('1')
    expect(result.current.rows[0]?.items[0]?.loaded).toBe(false)
    expect(result.current.rows[0]?.items[1]?.item.key).toBe('3')

    rerender({ items: thirdItems })

    expect(result.current.rows[0]?.items[0]?.item.key).toBe('0')
    expect(result.current.rows[0]?.items[0]?.loaded).toBe(false)
    expect(result.current.getItemImageProps('1')).toBe(initialHandlersForOne)
  })

  it('reuses committed row identities under StrictMode load updates', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, OPTIONS), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    })

    fireResize(WIDTH)

    const firstRowBefore = result.current.rows[0]
    const secondRowBefore = result.current.rows[1]

    act(() => { result.current.onLoad('0') })

    expect(result.current.rows[0]).not.toBe(firstRowBefore)
    expect(result.current.rows[1]).toBe(secondRowBefore)

    const firstRowAfterLoad = result.current.rows[0]
    const secondRowAfterLoad = result.current.rows[1]

    act(() => { result.current.onLoad('0') })

    expect(result.current.rows[0]).toBe(firstRowAfterLoad)
    expect(result.current.rows[1]).toBe(secondRowAfterLoad)
  })

  it('reports mounted render metrics for virtualized rows', () => {
    const onRenderMetricsChange = vi.fn()

    render(createElement(VirtualHookHarness, {
      onValue: () => {},
      options: { columns: 5, virtualize: true, overscan: 0, onRenderMetricsChange },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(onRenderMetricsChange).toHaveBeenLastCalledWith({
      virtualized: true,
      mountedItemCount: 10,
      mountedRowCount: 2,
      totalItemCount: 100,
      totalRowCount: 20,
      firstMountedRowIndex: 0,
      lastMountedRowIndex: 1,
    })
  })

  it('does not report render metrics for load-only updates', () => {
    const onRenderMetricsChange = vi.fn()
    let latest: HookState | null = null

    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 5, virtualize: true, overscan: 0, onRenderMetricsChange },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    onRenderMetricsChange.mockClear()
    act(() => { getLatest(latest).onLoad('0') })
    act(() => { getLatest(latest).onLoad('99') })

    expect(onRenderMetricsChange).not.toHaveBeenCalled()
  })
})

// ─── Virtualization geometry ─────────────────────────────────────────────────

describe('virtualization geometry', () => {
  it('subtracts the flex gap from spacers so total scroll height matches the unvirtualized layout', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 5, gap: 4, virtualize: true, overscan: 0 },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl, { scrollTop: 500 })

    // (520 - 4*4) / 5 → 100px cells, 104px row stride, 20 rows
    fireResize(520)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const state = getLatest(latest)
    const vw = state.virtualWindow
    if (vw === null) throw new Error('virtual window not computed')

    expect(state.rows.map(row => row.rowIndex)).toEqual([4, 5, 6])
    expect(vw.topSpacerHeight).toBe(412) // 4 rows * 104 - one gap absorbed by CSS
    expect(vw.bottomSpacerHeight).toBe(1348) // 13 rows * 104 - one gap absorbed by CSS

    // spacer + gap + visible rows with gaps + gap + spacer === unvirtualized height
    const visibleHeight = state.rows.length * state.cellHeight + (state.rows.length - 1) * state.gap
    const totalHeight = vw.topSpacerHeight + state.gap + visibleHeight + state.gap + vw.bottomSpacerHeight
    expect(totalHeight).toBe(state.totalRows * state.cellHeight + (state.totalRows - 1) * state.gap)
  })

  it('offsets virtual row indices by the container padding', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 5, padding: 50, virtualize: true, overscan: 0 },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl, { scrollTop: 120 })

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    // viewport covers 120–320; rows sit at padding + i*100, so rows 0–2 overlap.
    // Without the padding offset this would skip row 0 while it is still visible.
    expect(getLatest(latest).rows.map(row => row.rowIndex)).toEqual([0, 1, 2])
  })

  it('falls back to the default overscan when overscan is not finite', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 5, virtualize: true, overscan: Number.NaN },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    // default overscan = cellHeight * 4 = 400px → viewport 0–200 extends to rows 0–5
    expect(getLatest(latest).rows.map(row => row.rowIndex)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('does not rerender when a scroll event leaves the visible range unchanged', () => {
    let latest: HookState | null = null
    let renderCount = 0
    render(createElement(VirtualHookHarness, {
      onValue: value => {
        latest = value
        renderCount += 1
      },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(getLatest(latest).rows).toHaveLength(2)
    const renderCountBefore = renderCount

    // same scroll position → same range → no state update, no rerender
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(renderCount).toBe(renderCountBefore)
  })

  it('attaches to a scroll container whose ref is populated after mount', () => {
    const lateRef: { current: HTMLElement | null } = { current: null }
    let latest: HookState | null = null

    function LateRefHarness() {
      const value = useGridGallery(MANY_ITEMS, { columns: 5, virtualize: true, overscan: 0 }, lateRef)
      latest = value
      return createElement(
        'div',
        { 'data-testid': 'scroll' },
        createElement('div', { 'data-testid': 'grid', ref: value.containerRef }),
      )
    }

    const { rerender } = render(createElement(LateRefHarness))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl, { scrollTop: 500 })

    // the ref only points at the scroll container after the gallery mounted
    lateRef.current = scrollEl
    rerender(createElement(LateRefHarness))

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const state = getLatest(latest)
    expect(state.rows.map(row => row.rowIndex)).toEqual([5, 6])
  })

  it('treats non-finite padding as zero instead of blanking the gallery', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 5, padding: Number.NaN, virtualize: true, overscan: 0 },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(getLatest(latest).rows.map(row => row.rowIndex)).toEqual([0, 1])
  })
})

// ─── Component Rendering ─────────────────────────────────────────────────────

describe('GridGallery', () => {
  it('uses totalRows for aria-rowcount when virtualized', () => {
    render(createElement(VirtualGalleryHarness))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByRole('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(gridEl).toHaveAttribute('aria-rowcount', '20')
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })

  it('rerenders only the loaded item in a non-virtualized gallery', () => {
    const renderCounts = buildRenderCounts(ITEMS.map(entry => entry.key))

    render(createElement(GridGallery, {
      items: ITEMS,
      columns: 3,
      renderItem: (galleryItem, _layout, handlers) => {
        renderCounts[galleryItem.key] += 1
        return createElement('img', {
          'data-testid': `img-${galleryItem.key}`,
          ...handlers.imageProps,
        })
      },
    }))

    fireResize(WIDTH)

    expect(renderCounts['0']).toBe(1)
    expect(renderCounts['1']).toBe(1)
    expect(renderCounts['8']).toBe(1)

    fireEvent.load(screen.getByTestId('img-0'))

    expect(renderCounts['0']).toBe(2)
    expect(renderCounts['1']).toBe(1)
    expect(renderCounts['8']).toBe(1)
  })

  it('rerenders only the loaded mounted item when virtualized', () => {
    const renderCounts = buildRenderCounts(MANY_ITEMS.map(entry => entry.key))
    const scrollRef = { current: null as HTMLDivElement | null }

    render(createElement(
      'div',
      { 'data-testid': 'scroll', ref: (node: HTMLDivElement | null) => { scrollRef.current = node } },
      createElement(GridGallery, {
        items: MANY_ITEMS,
        columns: 5,
        virtualize: true,
        overscan: 0,
        scrollContainerRef: scrollRef,
        renderItem: (galleryItem, _layout, handlers) => {
          renderCounts[galleryItem.key] += 1
          return createElement('img', {
            'data-testid': `img-${galleryItem.key}`,
            ...handlers.imageProps,
          })
        },
      }),
    ))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = scrollEl.querySelector('div')
    if (!(gridEl instanceof HTMLElement)) throw new Error('grid not found')

    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    expect(renderCounts['0']).toBe(1)
    expect(renderCounts['9']).toBe(1)
    expect(renderCounts['10']).toBe(0)

    fireEvent.load(screen.getByTestId('img-0'))

    expect(renderCounts['0']).toBe(2)
    expect(renderCounts['1']).toBe(1)
    expect(renderCounts['9']).toBe(1)
    expect(renderCounts['10']).toBe(0)
  })

  it('supports memoized item content with stable image props', () => {
    const renderCounts = buildRenderCounts(ITEMS.map(entry => entry.key))

    const MemoPhoto = memo(function MemoPhoto({
      itemKey,
      loaded,
      imageProps,
    }: {
      itemKey: string | number
      loaded: boolean
      imageProps: { onLoad: React.ReactEventHandler<HTMLImageElement>; onError: React.ReactEventHandler<HTMLImageElement> }
    }) {
      renderCounts[String(itemKey)] += 1
      return createElement('img', {
        'data-testid': `memo-img-${itemKey}`,
        'data-loaded': String(loaded),
        ...imageProps,
      })
    })

    render(createElement(GridGallery, {
      items: ITEMS,
      columns: 3,
      renderItem: (galleryItem, layout, handlers) =>
        createElement(MemoPhoto, {
          itemKey: galleryItem.key,
          loaded: layout.loaded,
          imageProps: handlers.getImageProps(),
        }),
    }))

    fireResize(WIDTH)

    expect(renderCounts['0']).toBe(1)
    expect(renderCounts['1']).toBe(1)

    fireEvent.load(screen.getByTestId('memo-img-0'))

    expect(renderCounts['0']).toBe(2)
    expect(renderCounts['1']).toBe(1)
  })

  it('keeps a tab stop on the first mounted cell when the focused cell is scrolled out', () => {
    render(createElement(VirtualGalleryHarness))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByRole('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 200)
    setVirtualRects(scrollEl, gridEl)

    fireResize(500)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    // Focused index defaults to 0; scroll until row 0 unmounts.
    scrollEl.scrollTop = 500
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })

    const cells = screen.getAllByRole('gridcell')
    const tabbable = cells.filter(cell => cell.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
    // First mounted item (row 5, columns 5) is index 25.
    expect(tabbable[0]).toHaveAttribute('data-grid-index', '25')
  })
})

// ─── Keyboard navigation ──────────────────────────────────────────────────────

function key(k: string, extra: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent {
  return { key: k, preventDefault: vi.fn(), metaKey: false, ctrlKey: false, shiftKey: false, ...extra } as unknown as React.KeyboardEvent
}

describe('handleItemKeyDown', () => {
  it('ArrowRight moves focus forward by 1', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(2, key('ArrowRight')) })
    expect(result.current.focusedIndex).toBe(3)
  })

  it('ArrowLeft moves focus back by 1', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(4, key('ArrowLeft')) })
    expect(result.current.focusedIndex).toBe(3)
  })

  it('ArrowDown moves focus forward by one row', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(1, key('ArrowDown')) })
    expect(result.current.focusedIndex).toBe(4)
  })

  it('ArrowUp moves focus back by one row', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(4, key('ArrowUp')) })
    expect(result.current.focusedIndex).toBe(1)
  })

  it('ArrowRight wraps from last item of a row to first of next', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    // item 2 is last in row 0; next is item 3 (first of row 1)
    act(() => { result.current.handleItemKeyDown(2, key('ArrowRight')) })
    expect(result.current.focusedIndex).toBe(3)
  })

  it('ArrowLeft wraps from first item of a row to last of previous', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    // item 3 is first of row 1; previous is item 2 (last of row 0)
    act(() => { result.current.handleItemKeyDown(3, key('ArrowLeft')) })
    expect(result.current.focusedIndex).toBe(2)
  })

  it('ArrowRight clamps at the last item', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(8, key('ArrowRight')) })
    expect(result.current.focusedIndex).toBe(8)
  })

  it('ArrowUp clamps at first item', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(1, key('ArrowUp')) })
    expect(result.current.focusedIndex).toBe(0)
  })

  it('Home moves to first item in the current row', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(4, key('Home')) })
    expect(result.current.focusedIndex).toBe(3)
  })

  it('End moves to last item in the current row', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(4, key('End')) })
    expect(result.current.focusedIndex).toBe(5)
  })

  it('Ctrl+Home moves to first item in the grid', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(7, key('Home', { ctrlKey: true })) })
    expect(result.current.focusedIndex).toBe(0)
  })

  it('Ctrl+End moves to last item in the grid', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(1, key('End', { ctrlKey: true })) })
    expect(result.current.focusedIndex).toBe(8)
  })

  it('does not navigate when Meta key is held on arrow keys', () => {
    const { result } = renderHook(() => useGridGallery(ITEMS, { ...OPTIONS, navigable: true }))
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(4, key('ArrowRight', { metaKey: true })) })
    expect(result.current.focusedIndex).toBe(0) // unchanged from initial
  })

  it('fires onActivate with shiftKey on Space', () => {
    const onActivate = vi.fn()
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true, onActivate })
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(3, key(' ', { shiftKey: true })) })
    expect(onActivate).toHaveBeenCalledWith(3, true)
  })

  it('fires onActivate with shiftKey on Enter', () => {
    const onActivate = vi.fn()
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true, onActivate })
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(5, key('Enter', { shiftKey: false })) })
    expect(onActivate).toHaveBeenCalledWith(5, false)
  })

  it('is a no-op when navigable is not enabled', () => {
    const onActivate = vi.fn()
    const onFocusedIndexChange = vi.fn()
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, onActivate, onFocusedIndexChange })
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(2, key('ArrowRight')) })
    act(() => { result.current.handleItemKeyDown(2, key('Enter')) })

    expect(result.current.focusedIndex).toBe(0)
    expect(onFocusedIndexChange).not.toHaveBeenCalled()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('scrolls offscreen virtual rows into the padded viewport', () => {
    let latest: HookState | null = null
    render(createElement(VirtualHookHarness, {
      onValue: value => { latest = value },
      options: { columns: 5, gap: 4, padding: 4, virtualize: true, overscan: 0, navigable: true },
    }))

    const scrollEl = screen.getByTestId('scroll')
    const gridEl = screen.getByTestId('grid')
    defineReadonlyNumber(scrollEl, 'clientHeight', 108)
    setVirtualRects(scrollEl, gridEl)

    fireResize(520)
    act(() => { scrollEl.dispatchEvent(new Event('scroll')) })
    act(() => { getLatest(latest).handleItemKeyDown(0, key('End', { ctrlKey: true })) })

    expect(scrollEl.scrollTop).toBe(1976)
  })
})

// ─── Controlled focusedIndex ──────────────────────────────────────────────────

describe('controlled focusedIndex', () => {
  it('reflects the prop value as focusedIndex', () => {
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true, focusedIndex: 5 })
    )
    fireResize(WIDTH)
    expect(result.current.focusedIndex).toBe(5)
  })

  it('does not change internal state when navigation fires while controlled', () => {
    const onFocusedIndexChange = vi.fn()
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true, focusedIndex: 0, onFocusedIndexChange })
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(0, key('ArrowRight')) })

    // prop is still 0 (the hook doesn't own the state)
    expect(result.current.focusedIndex).toBe(0)
    // but the callback was fired so the owner can update
    expect(onFocusedIndexChange).toHaveBeenCalledWith(1)
  })

  it('fires onFocusedIndexChange when handleItemFocus is called while controlled', () => {
    const onFocusedIndexChange = vi.fn()
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true, focusedIndex: 0, onFocusedIndexChange })
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemFocus(3) })
    expect(onFocusedIndexChange).toHaveBeenCalledWith(3)
    expect(result.current.focusedIndex).toBe(0) // prop unchanged
  })

  it('tracks internal state when focusedIndex prop is absent', () => {
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true })
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemKeyDown(0, key('ArrowRight')) })
    expect(result.current.focusedIndex).toBe(1)

    act(() => { result.current.handleItemKeyDown(1, key('ArrowDown')) })
    expect(result.current.focusedIndex).toBe(4)
  })

  it('clamps an out-of-range controlled focusedIndex to the last item', () => {
    const { result } = renderHook(() =>
      useGridGallery(ITEMS, { ...OPTIONS, navigable: true, focusedIndex: 99 })
    )
    fireResize(WIDTH)
    expect(result.current.focusedIndex).toBe(ITEMS.length - 1)
  })
})

// ─── Focused index clamping ─────────────────────────────────────────────────────

describe('focused index clamping', () => {
  it('clamps the focused index when items shrink below the focused position', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useGridGallery(items, { ...OPTIONS, navigable: true }),
      { initialProps: { items: ITEMS } },
    )
    fireResize(WIDTH)

    act(() => { result.current.handleItemFocus(8) })
    expect(result.current.focusedIndex).toBe(8)

    rerender({ items: ITEMS.slice(0, 3) })
    expect(result.current.focusedIndex).toBe(2)
  })
})
