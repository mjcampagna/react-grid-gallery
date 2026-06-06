import { act, render, renderHook, screen } from '@testing-library/react'
import { createElement, useRef } from 'react'

import { GridGallery } from '../GridGallery'
import { useGridGallery } from '../useGridGallery'
import type { GalleryItem, GridOptions } from '../types'

// ─── ResizeObserver mock ──────────────────────────────────────────────────────
//
// The hook attaches ResizeObserver inside a useEffect, gated on containerRef
// having a DOM element. In renderHook there's no real DOM so observe() is never
// called — we capture the callback in the constructor so tests can fire resize
// events directly.

let fireResize: (width: number) => void = () => {}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: ResizeObserverCallback) {
      fireResize = (width: number) =>
        act(() => { cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver) })
    }
    observe() {}
    disconnect() {}
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

function setVirtualRects(scrollEl: HTMLElement, gridEl: HTMLElement): void {
  scrollEl.getBoundingClientRect = () => ({
    bottom: 200,
    height: 200,
    left: 0,
    right: 500,
    top: 0,
    width: 500,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  gridEl.getBoundingClientRect = () => ({
    bottom: 2000,
    height: 2000,
    left: 0,
    right: 500,
    top: -scrollEl.scrollTop,
    width: 500,
    x: 0,
    y: -scrollEl.scrollTop,
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
})
