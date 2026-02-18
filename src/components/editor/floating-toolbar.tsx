'use client';

import {
  useFloatingToolbarState,
  useFloatingToolbar,
  getDOMSelectionBoundingClientRect,
  FloatingPortal,
  offset,
  flip,
  shift,
} from '@platejs/floating';
import { useEditorId, useEventEditorValue } from 'platejs/react';
import { useMarkToolbarButtonState, useMarkToolbarButton } from 'platejs/react';

function MarkButton({ nodeType, label }: { nodeType: string; label: string }) {
  const state = useMarkToolbarButtonState({ nodeType });
  const { props } = useMarkToolbarButton(state);
  const { pressed, ...buttonProps } = props;
  return (
    <button
      type="button"
      {...buttonProps}
      data-pressed={pressed || undefined}
      aria-pressed={pressed}
      className="px-2 py-1 text-xs rounded transition-colors"
      style={{
        fontWeight: nodeType === 'bold' ? 700 : undefined,
        fontStyle: nodeType === 'italic' ? 'italic' : undefined,
        fontFamily: nodeType === 'code' ? 'var(--font-mono)' : undefined,
        background: pressed ? 'var(--accent)' : 'transparent',
        color: pressed ? 'var(--accent-foreground)' : 'var(--foreground)',
      }}
    >
      {label}
    </button>
  );
}

export function FloatingToolbar() {
  const editorId = useEditorId();
  const focusedEditorId = useEventEditorValue('focus');

  const state = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    floatingOptions: {
      placement: 'top',
      middleware: [offset(8), flip(), shift({ padding: 8 })],
      getBoundingClientRect: getDOMSelectionBoundingClientRect,
    },
  });

  const { hidden, props, ref } = useFloatingToolbar(state);

  if (hidden) return null;

  return (
    <FloatingPortal>
      <div
        ref={ref}
        {...props}
        className="floating-toolbar flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-lg"
        style={{
          ...props.style,
          zIndex: 50,
          background: 'var(--popover)',
          borderColor: 'var(--border)',
        }}
      >
        <MarkButton nodeType="bold" label="B" />
        <MarkButton nodeType="italic" label="I" />
        <MarkButton nodeType="strikethrough" label="S" />
        <MarkButton nodeType="code" label="</>" />
      </div>
    </FloatingPortal>
  );
}
