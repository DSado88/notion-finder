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
  BlockquotePlugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react';
import { ListPlugin } from '@platejs/list/react';
import { IndentPlugin } from '@platejs/indent/react';
import { CodeBlockPlugin } from '@platejs/code-block/react';
import { LinkPlugin } from '@platejs/link/react';
import { MarkdownPlugin, deserializeMd, serializeMd } from '@platejs/markdown';
import { SlashPlugin, SlashInputPlugin } from '@platejs/slash-command/react';
import { KEYS } from 'platejs';
import { SlashInputElement } from './slash-node';

function HrElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      <hr contentEditable={false} className="my-4 border-t" style={{ borderColor: 'var(--border)' }} />
      {props.children}
    </PlateElement>
  );
}

interface PlateEditorProps {
  itemId: string;
  initialMarkdown: string;
  readOnly: boolean;
  onSave?: (markdown: string) => Promise<void>;
}

const PLUGINS = [
  ParagraphPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
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
  MarkdownPlugin,
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const editor = usePlateEditor({
    plugins: PLUGINS,
    value: initialMarkdown
      ? (e) => deserializeMd(e, initialMarkdown)
      : undefined,
  });

  const handleChange = useCallback(() => {
    if (readOnly || !onSave) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const markdown = serializeMd(editor);
        await onSave(markdown);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 1500);
  }, [readOnly, onSave, editor]);

  return (
    <div className="relative">
      {!readOnly && saveStatus !== 'idle' && (
        <div className="absolute right-0 top-0 text-[11px]" style={{ color: 'var(--muted)' }}>
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
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
