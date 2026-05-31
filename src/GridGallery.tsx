import type { ReactEventHandler, ReactNode } from 'react'

import { useGridGallery } from './useGridGallery'
import type { GalleryItem, GridOptions, ScrollContainerRef } from './types'

type Props<T> = {
  items: GalleryItem<T>[]
  renderItem: (
    item: GalleryItem<T>,
    layout: { loaded: boolean; focused: boolean },
    handlers: { onLoad: ReactEventHandler<HTMLImageElement>; onError: ReactEventHandler<HTMLImageElement> },
  ) => ReactNode
  scrollContainerRef?: ScrollContainerRef
} & GridOptions

export function GridGallery<T>({ items, renderItem, scrollContainerRef, ...options }: Props<T>): ReactNode {
  const { containerRef, rows, totalRows, cellHeight, gap, columns, onLoad, onError, virtualWindow, focusedIndex, handleItemFocus, handleItemKeyDown } = useGridGallery(
    items,
    options,
    scrollContainerRef,
  )

  const padding = options.padding ?? 0
  const navigable = options.navigable === true

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px`, padding: padding > 0 ? `${padding}px` : undefined }}
      {...(navigable ? { role: 'grid', 'aria-rowcount': totalRows, 'aria-colcount': columns } : {})}
    >
      {virtualWindow && virtualWindow.topSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.topSpacerHeight, contain: 'layout' }} />
      )}
      {rows.map(row => {
        return (
          <div
            key={row.rowIndex}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap}px`, contain: 'layout' }}
            {...(navigable ? { role: 'row', 'aria-rowindex': row.rowIndex + 1 } : {})}
          >
            {row.items.map(({ item, itemIndex, colIndex, loaded }) => {
              const focused = navigable && focusedIndex === itemIndex
              return (
                <div
                  key={item.key}
                  style={{ height: `${cellHeight}px` }}
                  {...(navigable ? {
                    role: 'gridcell',
                    'aria-colindex': colIndex + 1,
                    tabIndex: focused ? 0 : -1,
                    'data-grid-index': itemIndex,
                    onKeyDown: (e) => handleItemKeyDown(itemIndex, e),
                    onFocus: () => handleItemFocus(itemIndex),
                  } : {})}
                >
                  {renderItem(
                    item,
                    { loaded, focused },
                    {
                      onLoad: () => onLoad(item.key),
                      onError: () => onError(item.key),
                    },
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {virtualWindow && virtualWindow.bottomSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.bottomSpacerHeight, contain: 'layout' }} />
      )}
    </div>
  )
}
