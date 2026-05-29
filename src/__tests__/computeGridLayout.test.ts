import { computeGridLayout } from '../computeGridLayout'
import type { GalleryItem } from '../types'

function item(key: string): GalleryItem<{ key: string }> {
  return { key }
}

describe('computeGridLayout', () => {
  describe('empty / invalid inputs', () => {
    it('returns [] for empty items', () => {
      expect(computeGridLayout([], 4, 100, 100)).toEqual([])
    })

    it('returns [] when columns is 0', () => {
      expect(computeGridLayout([item('a')], 0, 100, 100)).toEqual([])
    })

    it('returns [] when cellWidth is 0', () => {
      expect(computeGridLayout([item('a')], 4, 0, 100)).toEqual([])
    })
  })

  describe('row chunking', () => {
    it('puts all items in one row when count equals column count', () => {
      const rows = computeGridLayout([item('a'), item('b'), item('c')], 3, 100, 80)
      expect(rows).toHaveLength(1)
      expect(rows[0].items.map(i => i.key)).toEqual(['a', 'b', 'c'])
    })

    it('chunks items into full rows plus a partial last row', () => {
      const items = ['a', 'b', 'c', 'd', 'e'].map(item)
      const rows = computeGridLayout(items, 3, 100, 80)
      expect(rows).toHaveLength(2)
      expect(rows[0].items.map(i => i.key)).toEqual(['a', 'b', 'c'])
      expect(rows[1].items.map(i => i.key)).toEqual(['d', 'e'])
    })

    it('produces one row per item when columns is 1', () => {
      const items = ['a', 'b', 'c'].map(item)
      const rows = computeGridLayout(items, 1, 100, 80)
      expect(rows).toHaveLength(3)
      rows.forEach((row, i) => {
        expect(row.items).toHaveLength(1)
        expect(row.items[0].key).toBe(['a', 'b', 'c'][i])
      })
    })

    it('puts all items in one row when columns exceeds item count', () => {
      const items = ['a', 'b'].map(item)
      const rows = computeGridLayout(items, 10, 100, 80)
      expect(rows).toHaveLength(1)
      expect(rows[0].items).toHaveLength(2)
    })
  })

  describe('cell dimensions', () => {
    it('attaches the given cellWidth and cellHeight to every row', () => {
      const items = ['a', 'b', 'c', 'd'].map(item)
      const rows = computeGridLayout(items, 2, 150, 120)
      for (const row of rows) {
        expect(row.width).toBe(150)
        expect(row.height).toBe(120)
      }
    })
  })

  describe('item identity', () => {
    it('preserves original item objects', () => {
      const originals = [{ key: 'a', extra: 42 }, { key: 'b', extra: 99 }]
      const rows = computeGridLayout(originals, 2, 100, 100)
      expect(rows[0].items[0]).toBe(originals[0])
      expect(rows[0].items[1]).toBe(originals[1])
    })
  })
})
