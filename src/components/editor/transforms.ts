'use client';

import { insertCodeBlock } from '@platejs/code-block';
import { KEYS, PathApi } from 'platejs';
import type { PlateEditor } from 'platejs/react';

const insertList = (editor: PlateEditor, type: string) => {
  editor.tf.insertNodes(
    editor.api.create.block({
      indent: 1,
      listStyleType: type,
    }),
    { select: true }
  );
};

const insertBlockMap: Record<
  string,
  (editor: PlateEditor, type: string) => void
> = {
  [KEYS.ul]: insertList,
  [KEYS.ol]: insertList,
  [KEYS.listTodo]: insertList,
  [KEYS.codeBlock]: (editor) => insertCodeBlock(editor, { select: true }),
};

export const insertBlock = (
  editor: PlateEditor,
  type: string,
  options: { upsert?: boolean } = {}
) => {
  const { upsert = false } = options;

  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();

    if (!block) return;

    const [currentNode, path] = block;
    const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
    const currentBlockType = currentNode.type as string;

    const isSameBlockType = type === currentBlockType;

    if (upsert && isCurrentBlockEmpty && isSameBlockType) {
      return;
    }

    if (type in insertBlockMap) {
      insertBlockMap[type](editor, type);
    } else {
      editor.tf.insertNodes(editor.api.create.block({ type }), {
        at: PathApi.next(path),
        select: true,
      });
    }

    if (!isSameBlockType) {
      editor.tf.removeNodes({ previousEmptyBlock: true });
    }
  });
};
