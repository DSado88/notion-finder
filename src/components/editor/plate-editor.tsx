'use client';

import { useCallback, useRef, useState } from 'react';
import { Plate, PlateContent, PlateElement, usePlateEditor, useEditorRef, ParagraphPlugin, MemoizedChildren } from 'platejs/react';
import type { PlateElementProps } from 'platejs/react';
import type { RenderNodeWrapper } from 'platejs/react';
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
import { useLink } from '@platejs/link/react';
import { IndentPlugin } from '@platejs/indent/react';
import { CodeBlockPlugin } from '@platejs/code-block/react';
import { LinkPlugin } from '@platejs/link/react';
import { TablePlugin, TableRowPlugin, TableCellPlugin, TableCellHeaderPlugin } from '@platejs/table/react';
import { MarkdownPlugin, deserializeMd, serializeMd } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import { SlashPlugin, SlashInputPlugin } from '@platejs/slash-command/react';
import { KEYS, NodeIdPlugin } from 'platejs';
import { BlockSelectionPlugin, BlockSelectionAfterEditable } from '@platejs/selection/react';
import { DndPlugin, useDraggable, useDropLine } from '@platejs/dnd';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GripVertical, Plus } from 'lucide-react';
import { SlashInputElement } from './slash-node';
import { FloatingToolbar } from './floating-toolbar';
import { TableElement, TableRowElement, TableCellElement } from './table-elements';
import { TableFloatingToolbar } from './table-toolbar';

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

function LinkElement(props: PlateElementProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { props: linkProps } = useLink({ element: props.element as any });
  return (
    <PlateElement
      {...props}
      as="a"
      {...linkProps}
      className="text-blue-600 underline decoration-blue-600/30 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:decoration-blue-400"
    >
      {props.children}
    </PlateElement>
  );
}

const BlockDraggable: RenderNodeWrapper = ({ editor, element, path }) => {
  if (editor.dom.readOnly) return;
  if (path.length !== 1) return;

  return (props) => <Draggable {...props} />;
};

function Draggable({ element, children }: PlateElementProps) {
  const { isDragging, nodeRef, handleRef } = useDraggable({ element });
  const editor = useEditorRef();

  const handleAddBlock = () => {
    const index = editor.children.findIndex((child) => child.id === element.id);
    if (index === -1) return;
    editor.tf.insertNodes(
      { type: 'p', children: [{ text: '' }] },
      { at: [index + 1], select: true }
    );
  };

  return (
    <div className={`group relative ${isDragging ? 'opacity-50' : ''}`}>
      <div
        className="absolute top-0 z-50 flex h-full -translate-x-full cursor-text opacity-0 group-hover:opacity-100"
        contentEditable={false}
      >
        <div className="flex h-[1.5em] items-center">
          <button
            type="button"
            onClick={handleAddBlock}
            className="flex h-6 w-5 items-center justify-center rounded hover:bg-accent"
            data-plate-prevent-deselect
            title="Add block"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            ref={handleRef}
            type="button"
            className="flex h-6 w-5 cursor-grab items-center justify-center rounded hover:bg-accent"
            data-plate-prevent-deselect
            title="Drag to move"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div ref={nodeRef}>
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLineIndicator />
      </div>
    </div>
  );
}

function DropLineIndicator() {
  const { dropLine } = useDropLine();
  if (!dropLine) return null;
  return (
    <div
      className={`absolute inset-x-0 h-0.5 bg-blue-500/50 ${dropLine === 'top' ? '-top-px' : '-bottom-px'}`}
    />
  );
}

interface PlateEditorProps {
  itemId: string;
  initialMarkdown: string;
  readOnly: boolean;
  onSave?: (markdown: string) => Promise<void>;
}

const PLUGINS = [
  NodeIdPlugin,
  BlockSelectionPlugin,
  DndPlugin.configure({
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => (
        <DndProvider backend={HTML5Backend}>{children}</DndProvider>
      ),
    },
  }),
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
  LinkPlugin.withComponent(LinkElement),
  TablePlugin.withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellElement),
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
        {!readOnly && <FloatingToolbar />}
        {!readOnly && <TableFloatingToolbar />}
        <PlateContent
          className="prose prose-base dark:prose-invert max-w-none pl-8 leading-relaxed prose-headings:font-semibold prose-p:my-1 prose-li:my-0 outline-none"
          style={{ color: 'var(--foreground)', caretColor: 'var(--foreground)' }}
        />
        {!readOnly && <BlockSelectionAfterEditable />}
      </Plate>
    </div>
  );
}
