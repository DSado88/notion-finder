'use client';

import { useCallback, useRef, useState } from 'react';
import { Plate, PlateContent, PlateElement, usePlateEditor, ParagraphPlugin } from 'platejs/react';
import type { PlateElementProps } from 'platejs/react';
import {
  BoldPlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  BlockquotePlugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react';
import { ListPlugin, useTodoListElement, useTodoListElementState } from '@platejs/list/react';
import { IndentPlugin } from '@platejs/indent/react';
import { CodeBlockPlugin } from '@platejs/code-block/react';
import { LinkPlugin } from '@platejs/link/react';
import { TablePlugin } from '@platejs/table/react';
import { MarkdownPlugin, deserializeMd, serializeMd } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import { SlashPlugin, SlashInputPlugin } from '@platejs/slash-command/react';
import { KEYS } from 'platejs';
import { SlashInputElement } from './slash-node';

function HrElement(props: PlateElementProps) {
  return (
    <PlateElement {...props}>
      <div contentEditable={false}>
        <hr className="my-4 border-t" style={{ borderColor: 'var(--border)' }} />
      </div>
      {props.children}
    </PlateElement>
  );
}

function TodoListElement(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element });
  const { checkboxProps } = useTodoListElement(state);
  return (
    <PlateElement {...props}>
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          checked={checkboxProps.checked}
          onChange={(e) => checkboxProps.onCheckedChange(e.target.checked)}
          onMouseDown={checkboxProps.onMouseDown}
          className="mt-1 h-4 w-4 shrink-0"
          contentEditable={false}
        />
        <span className={checkboxProps.checked ? 'line-through opacity-60' : ''}>
          {props.children}
        </span>
      </div>
    </PlateElement>
  );
}

function ParagraphElement(props: PlateElementProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((props.element as any).listStyleType === 'todo') {
    return <TodoListElement {...props} />;
  }
  return <PlateElement {...props}>{props.children}</PlateElement>;
}

interface PlateEditorProps {
  itemId: string;
  initialMarkdown: string;
  readOnly: boolean;
  onSave?: (markdown: string) => Promise<void>;
}

const PLUGINS = [
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  BlockquotePlugin,
  HorizontalRulePlugin.withComponent(HrElement),
  BoldPlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  CodePlugin,
  IndentPlugin,
  ListPlugin,
  CodeBlockPlugin,
  LinkPlugin,
  TablePlugin,
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
    },
  }),
  SlashPlugin.configure({
    options: {
      trigger: '/',
      triggerPreviousCharPattern: /^\s?$/,
      triggerQuery: (editor) =>
        !editor.api.some({
          match: { type: editor.getType(KEYS.codeBlock) },
        }),
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
];

export function PlateEditor({
  itemId,
  initialMarkdown,
  readOnly,
  onSave,
}: PlateEditorProps) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isSavingRef = useRef(false);
  const changeCountRef = useRef(0);
  // Snapshot what Plate.js produces on initial deserialize so we can skip
  // no-op saves caused by markdown round-trip reformatting.
  const baselineRef = useRef<string | null>(null);

  const editor = usePlateEditor({
    plugins: PLUGINS,
    value: initialMarkdown
      ? (e) => deserializeMd(e, initialMarkdown)
      : undefined,
  });

  const handleChange = useCallback(() => {
    if (readOnly || !onSave) return;

    // Skip the very first onChange which fires on initial render
    changeCountRef.current += 1;
    if (changeCountRef.current <= 1) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // Don't overlap with an in-flight save
      if (isSavingRef.current) return;

      const markdown = serializeMd(editor);

      // Capture baseline on first real serialize so we can diff against it
      if (baselineRef.current === null) {
        baselineRef.current = markdown;
        return; // First serialize = round-trip reformat, not a real edit
      }

      // Skip if content hasn't actually changed
      if (markdown === baselineRef.current) return;

      isSavingRef.current = true;
      setSaveStatus('saving');
      try {
        await onSave(markdown);
        baselineRef.current = markdown;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } finally {
        isSavingRef.current = false;
      }
    }, 1500);
  }, [readOnly, onSave, editor]);

  return (
    <div className="relative">
      {!readOnly && saveStatus !== 'idle' && (
        <div className="absolute right-0 top-0 text-[11px]" style={{ color: 'var(--muted)' }}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
        </div>
      )}
      <Plate
        key={itemId}
        editor={editor}
        readOnly={readOnly}
        onChange={handleChange}
      >
        <PlateContent
          className="prose prose-base dark:prose-invert max-w-none leading-relaxed prose-headings:font-semibold prose-p:my-1 prose-li:my-0 outline-none"
          style={{ color: 'var(--foreground)' }}
        />
      </Plate>
    </div>
  );
}
