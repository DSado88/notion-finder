'use client';

import {
  useVirtualFloating,
  getDOMSelectionBoundingClientRect,
  FloatingPortal,
  offset,
  flip,
  shift,
} from '@platejs/floating';
import { useEditorRef, useEditorSelector } from 'platejs/react';
import { KEYS } from 'platejs';
import {
  insertTableRow,
  insertTableColumn,
  deleteRow,
  deleteColumn,
  deleteTable,
} from '@platejs/table';
import {
  BetweenVerticalStart,
  BetweenVerticalEnd,
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  Rows2,
  Columns2,
  Trash2,
} from 'lucide-react';

function ToolbarButton({
  icon,
  tooltip,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent"
      style={{ color: destructive ? '#eb5757' : 'var(--foreground)' }}
      data-plate-prevent-deselect
    >
      {icon}
    </button>
  );
}

export function TableFloatingToolbar() {
  const editor = useEditorRef();

  const isInTable = useEditorSelector(
    (editor) => editor.api.some({ match: { type: KEYS.table } }),
    []
  );

  const { style, refs } = useVirtualFloating({
    open: isInTable,
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    getBoundingClientRect: getDOMSelectionBoundingClientRect,
  });

  if (!isInTable) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        className="floating-toolbar flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-lg"
        style={{
          ...style,
          zIndex: 50,
          background: 'var(--popover)',
          borderColor: 'var(--border)',
        }}
        contentEditable={false}
      >
        <ToolbarButton
          icon={<BetweenVerticalStart className="h-3.5 w-3.5" />}
          tooltip="Insert row above"
          onClick={() => insertTableRow(editor, { before: true })}
        />
        <ToolbarButton
          icon={<BetweenVerticalEnd className="h-3.5 w-3.5" />}
          tooltip="Insert row below"
          onClick={() => insertTableRow(editor)}
        />
        <div className="mx-0.5 h-4 w-px" style={{ background: 'var(--border)' }} />
        <ToolbarButton
          icon={<BetweenHorizontalStart className="h-3.5 w-3.5" />}
          tooltip="Insert column left"
          onClick={() => insertTableColumn(editor, { before: true })}
        />
        <ToolbarButton
          icon={<BetweenHorizontalEnd className="h-3.5 w-3.5" />}
          tooltip="Insert column right"
          onClick={() => insertTableColumn(editor)}
        />
        <div className="mx-0.5 h-4 w-px" style={{ background: 'var(--border)' }} />
        <ToolbarButton
          icon={<Rows2 className="h-3.5 w-3.5" />}
          tooltip="Delete row"
          onClick={() => deleteRow(editor)}
        />
        <ToolbarButton
          icon={<Columns2 className="h-3.5 w-3.5" />}
          tooltip="Delete column"
          onClick={() => deleteColumn(editor)}
        />
        <div className="mx-0.5 h-4 w-px" style={{ background: 'var(--border)' }} />
        <ToolbarButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          tooltip="Delete table"
          onClick={() => deleteTable(editor)}
          destructive
        />
      </div>
    </FloatingPortal>
  );
}
