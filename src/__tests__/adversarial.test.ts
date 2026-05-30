import { act, renderHook } from '@testing-library/react'

import { computeGridLayout } from '../computeGridLayout'
import { useGridGallery } from '../useGridGallery'
import type { GalleryItem } from '../types'

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

function item(key: string): GalleryItem<{ key: string }> {
  return { key }
}

describe('computeGridLayout adversarial inputs', () => {
  it('returns [] for non-finite columns and dimensions', () => {
    expect(computeGridLayout([item('a')], Number.NaN, 100, 100)).toEqual([])
    expect(computeGridLayout([item('a')], 2, Number.POSITIVE_INFINITY, 100)).toEqual([])
    expect(computeGridLayout([item('a')], 2, 100, Number.NaN)).toEqual([])
  })

  it('floors fractional columns instead of producing partial-row artifacts', () => {
    const rows = computeGridLayout([item('a'), item('b'), item('c')], 2.8, 100, 100)
    expect(rows.map(row => row.items.map(i => i.key))).toEqual([['a', 'b'], ['c']])
  })

  it('treats sub-one fractional columns as one column', () => {
    const rows = computeGridLayout([item('a'), item('b')], 0.5, 100, 100)
    expect(rows.map(row => row.items.map(i => i.key))).toEqual([['a'], ['b']])
  })
})

describe('useGridGallery adversarial options', () => {
  it('falls back to one column when a responsive columns callback returns NaN', () => {
    const { result } = renderHook(() =>
      useGridGallery([item('a'), item('b')], { columns: () => Number.NaN }),
    )

    fireResize(300)

    expect(result.current.columns).toBe(1)
    expect(result.current.cellWidth).toBe(300)
    expect(result.current.rows).toHaveLength(2)
  })

  it('clamps invalid gaps to zero', () => {
    const { result } = renderHook(() =>
      useGridGallery([item('a'), item('b')], { columns: 2, gap: () => -20 }),
    )

    fireResize(200)

    expect(result.current.gap).toBe(0)
    expect(result.current.cellWidth).toBe(100)
  })

  it('returns an empty layout instead of negative cell sizes when gaps exceed available width', () => {
    const { result } = renderHook(() =>
      useGridGallery([item('a'), item('b')], { columns: 2, gap: 500 }),
    )

    fireResize(200)

    expect(result.current.cellWidth).toBe(0)
    expect(result.current.cellHeight).toBe(0)
    expect(result.current.rows).toEqual([])
  })

  it('falls back to square cells when aspectRatio is zero or non-finite', () => {
    const { result, rerender } = renderHook(
      ({ aspectRatio }) => useGridGallery([item('a')], { columns: 1, aspectRatio }),
      { initialProps: { aspectRatio: 0 } },
    )

    fireResize(120)
    expect(result.current.cellHeight).toBe(120)

    rerender({ aspectRatio: Number.POSITIVE_INFINITY })
    expect(result.current.cellHeight).toBe(120)
  })
})
