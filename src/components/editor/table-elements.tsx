'use client';

import { PlateElement } from 'platejs/react';
import type { PlateElementProps } from 'platejs/react';
import {
  TableProvider,
  useTableElement,
  useSelectedCells,
  useTableCellElement,
} from '@platejs/table/react';

// ---- TableElement ----

export function TableElement(props: PlateElementProps) {
  return (
    <TableProvider>
      <TableElementInner {...props} />
    </TableProvider>
  );
}

function TableElementInner(props: PlateElementProps) {
  const { isSelectingCell, marginLeft, props: tableProps } = useTableElement();
  useSelectedCells();

  return (
    <PlateElement
      {...props}
      {...tableProps}
      className="slate-table"
      style={{
        marginLeft: marginLeft ? `${marginLeft}px` : undefined,
        ...(isSelectingCell ? { userSelect: 'none' as const } : {}),
      }}
    >
      {props.children}
    </PlateElement>
  );
}

// ---- TableRowElement ----

export function TableRowElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="slate-tr">
      {props.children}
    </PlateElement>
  );
}

// ---- TableCellElement ----

export function TableCellElement(props: PlateElementProps) {
  const { selected, isSelectingCell } = useTableCellElement();
  const isHeader = props.element.type === 'th';

  return (
    <PlateElement
      {...props}
      className={isHeader ? 'slate-th' : 'slate-td'}
      style={{
        background: selected ? 'var(--accent)' : isHeader ? 'var(--accent)' : undefined,
        ...(isSelectingCell ? { userSelect: 'none' as const } : {}),
        position: 'relative' as const,
      }}
    >
      {props.children}
    </PlateElement>
  );
}
