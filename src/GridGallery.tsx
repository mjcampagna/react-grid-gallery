import { memo, useCallback, useEffect, useRef, type ReactNode } from 'react'

import { useGridGallery } from './useGridGallery'
import type {
  GalleryItem,
  GridItemLayout,
  GridItemRenderHandlers,
  GridOptions,
  GridRow,
  ScrollContainerRef,
} from './types'

type RenderItem<T> = (
  item: GalleryItem<T>,
  layout: GridItemLayout,
  handlers: GridItemRenderHandlers,
) => ReactNode

type Props<T> = {
  items: GalleryItem<T>[]
  renderItem: RenderItem<T>
  scrollContainerRef?: ScrollContainerRef
} & GridOptions

type CellProps = {
  cellHeight: number
  entry: GridRow<unknown>['items'][number]
  focused: boolean
  handlers: GridItemRenderHandlers
  navigable: boolean
  onItemFocus: (index: number) => void
  onItemKeyDown: (itemIndex: number, e: React.KeyboardEvent) => void
  renderContent: () => ReactNode
  renderItem: unknown
}

function GridGalleryCellInner({
  cellHeight,
  entry,
  focused,
  navigable,
  onItemFocus,
  onItemKeyDown,
  renderContent,
}: CellProps): ReactNode {
  return (
    <div
      style={{ height: `${cellHeight}px` }}
      {...(navigable ? {
        role: 'gridcell',
        'aria-colindex': entry.colIndex + 1,
        tabIndex: focused ? 0 : -1,
        'data-grid-index': entry.itemIndex,
        onKeyDown: (e: React.KeyboardEvent) => onItemKeyDown(entry.itemIndex, e),
        onFocus: () => onItemFocus(entry.itemIndex),
      } : {})}
    >
      {renderContent()}
    </div>
  )
}

function areCellPropsEqual(prev: CellProps, next: CellProps): boolean {
  return prev.cellHeight === next.cellHeight &&
    prev.entry === next.entry &&
    prev.focused === next.focused &&
    prev.handlers === next.handlers &&
    prev.navigable === next.navigable &&
    prev.onItemFocus === next.onItemFocus &&
    prev.onItemKeyDown === next.onItemKeyDown &&
    prev.renderItem === next.renderItem
}

const MemoGridGalleryCell = memo(
  GridGalleryCellInner,
  areCellPropsEqual,
)

export function GridGallery<T>({ items, renderItem, scrollContainerRef, ...options }: Props<T>): ReactNode {
  const {
    containerRef,
    rows,
    totalRows,
    cellHeight,
    gap,
    columns,
    itemKeys,
    getItemImageProps,
    virtualWindow,
    focusedIndex,
    handleItemFocus,
    handleItemKeyDown,
  } = useGridGallery(items, options, scrollContainerRef)

  const renderHandlersCacheRef = useRef(new Map<string | number, GridItemRenderHandlers>())

  useEffect(() => {
    for (const key of renderHandlersCacheRef.current.keys()) {
      if (!itemKeys.has(key)) {
        renderHandlersCacheRef.current.delete(key)
      }
    }
  }, [itemKeys])

  const getItemRenderHandlers = useCallback((key: string | number): GridItemRenderHandlers => {
    const cached = renderHandlersCacheRef.current.get(key)
    if (cached) return cached

    const imageProps = getItemImageProps(key)
    const nextHandlers = {
      ...imageProps,
      imageProps,
      getImageProps: () => imageProps,
    }
    renderHandlersCacheRef.current.set(key, nextHandlers)
    return nextHandlers
  }, [getItemImageProps])

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
      {rows.map(row => (
        <div
          key={row.rowIndex}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap}px`, contain: 'layout' }}
          {...(navigable ? { role: 'row', 'aria-rowindex': row.rowIndex + 1 } : {})}
        >
          {row.items.map(entry => (
            <MemoGridGalleryCell
              key={entry.item.key}
              cellHeight={cellHeight}
              entry={entry}
              focused={navigable && focusedIndex === entry.itemIndex}
              handlers={getItemRenderHandlers(entry.item.key)}
              navigable={navigable}
              onItemFocus={handleItemFocus}
              onItemKeyDown={handleItemKeyDown}
              renderContent={() => renderItem(
                entry.item,
                { loaded: entry.loaded, focused: navigable && focusedIndex === entry.itemIndex },
                getItemRenderHandlers(entry.item.key),
              )}
              renderItem={renderItem}
            />
          ))}
        </div>
      ))}
      {virtualWindow && virtualWindow.bottomSpacerHeight > 0 && (
        <div style={{ height: virtualWindow.bottomSpacerHeight, contain: 'layout' }} />
      )}
    </div>
  )
}
