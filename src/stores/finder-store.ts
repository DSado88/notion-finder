'use client';

import { create } from 'zustand';
import type { FinderItem, SortField, SortDirection } from '@/types/finder';

interface FinderStore {
  // ---- Navigation State ----
  viewMode: 'miller' | 'list';
  /** Parent IDs for each visible column. 'workspace' = root. */
  columnPath: string[];
  /** columnIndex → selected item ID (navigation cursor) */
  selections: Record<number, string>;
  previewTargetId: string | null;

  // ---- Multi-Select State ----
  /** columnIndex → array of highlighted item IDs */
  multiSelections: Record<number, string[]>;
  /** columnIndex → anchor item ID for shift-range selection */
  selectionAnchor: Record<number, string>;

  // ---- Inline Editing ----
  editingItemId: string | null;

  // ---- Delete Confirmation ----
  pendingDelete: { items: FinderItem[]; parentId: string } | null;

  // ---- Sort (per-column, keyed by columnIndex) ----
  columnSort: Record<number, { field: SortField; direction: SortDirection }>;

  // ---- Column widths (per-column, keyed by columnIndex) ----
  columnWidths: Record<number, number>;

  // ---- Normalized Caches ----
  childrenByParentId: Record<string, FinderItem[]>;
  itemById: Record<string, FinderItem>;

  // ---- Actions ----
  selectItem: (columnIndex: number, itemId: string) => void;
  setChildren: (parentId: string, items: FinderItem[]) => void;
  invalidateCache: (parentIds: string[]) => void;
  /** Optimistically move an item between parents in the client cache */
  optimisticMove: (itemId: string, oldParentId: string, newParentId: string) => void;
  setViewMode: (mode: 'miller' | 'list') => void;
  setColumnSort: (columnIndex: number, field: SortField, direction: SortDirection) => void;
  setColumnWidth: (columnIndex: number, width: number) => void;
  breadcrumbClick: (segmentIndex: number) => void;
  /** Mark an item as having no children (removes chevron, prevents empty columns) */
  markNoChildren: (itemId: string) => void;

  // ---- Multi-Select Actions ----
  toggleMultiSelect: (columnIndex: number, itemId: string) => void;
  setMultiSelection: (columnIndex: number, itemIds: string[]) => void;
  clearMultiSelection: (columnIndex: number) => void;

  // ---- Editing Actions ----
  startEditing: (itemId: string) => void;
  stopEditing: () => void;

  // ---- Optimistic CRUD Actions ----
  optimisticCreate: (parentId: string, item: FinderItem) => void;
  optimisticRename: (itemId: string, newTitle: string) => void;
  optimisticDelete: (itemId: string, parentId: string) => { item: FinderItem; index: number } | null;
  optimisticBatchDelete: (itemIds: string[], parentId: string) => void;

  // ---- Delete Confirmation ----
  setPendingDelete: (payload: { items: FinderItem[]; parentId: string } | null) => void;
}

export const useFinderStore = create<FinderStore>((set) => ({
  viewMode: 'miller',
  columnPath: ['workspace'],
  selections: {},
  previewTargetId: null,
  multiSelections: {},
  selectionAnchor: {},
  editingItemId: null,
  pendingDelete: null,
  columnSort: {},
  columnWidths: {},
  childrenByParentId: {},
  itemById: {},

  selectItem: (columnIndex, itemId) =>
    set((state) => {
      const item = state.itemById[itemId];

      // Truncate columns beyond current + 1
      const newColumnPath = state.columnPath.slice(0, columnIndex + 1);

      // If item has children, open its column
      if (item?.hasChildren) {
        newColumnPath.push(itemId);
      }

      // Build new selections: keep up to columnIndex, clear deeper
      const newSelections: Record<number, string> = {};
      for (let i = 0; i <= columnIndex; i++) {
        if (i === columnIndex) {
          newSelections[i] = itemId;
        } else if (state.selections[i]) {
          newSelections[i] = state.selections[i];
        }
      }

      // Clear multi-selections and anchors for current column and deeper
      const newMultiSelections: Record<number, string[]> = {};
      const newSelectionAnchor: Record<number, string> = {};
      for (const [idx, ids] of Object.entries(state.multiSelections)) {
        if (Number(idx) < columnIndex) newMultiSelections[Number(idx)] = ids;
      }
      for (const [idx, id] of Object.entries(state.selectionAnchor)) {
        if (Number(idx) < columnIndex) newSelectionAnchor[Number(idx)] = id;
      }
      // Set anchor for current column
      newSelectionAnchor[columnIndex] = itemId;

      return {
        columnPath: newColumnPath,
        selections: newSelections,
        multiSelections: newMultiSelections,
        selectionAnchor: newSelectionAnchor,
        previewTargetId: itemId,
        // Clear any active inline edit when navigating
        editingItemId: null,
      };
    }),

  setChildren: (parentId, items) =>
    set((state) => {
      const newItemById = { ...state.itemById };
      for (const item of items) {
        newItemById[item.id] = item;
      }
      return {
        childrenByParentId: {
          ...state.childrenByParentId,
          [parentId]: items,
        },
        itemById: newItemById,
      };
    }),

  invalidateCache: (parentIds) =>
    set((state) => {
      const newCache = { ...state.childrenByParentId };
      for (const id of parentIds) {
        delete newCache[id];
      }
      return { childrenByParentId: newCache };
    }),

  optimisticMove: (itemId, oldParentId, newParentId) =>
    set((state) => {
      const item = state.itemById[itemId];
      if (!item) return state;

      const updatedItem = { ...item, parentId: newParentId === 'workspace' ? null : newParentId };
      const newItemById = { ...state.itemById, [itemId]: updatedItem };
      const newChildren = { ...state.childrenByParentId };

      // Remove from old parent
      const oldKey = oldParentId;
      if (newChildren[oldKey]) {
        newChildren[oldKey] = newChildren[oldKey].filter((c) => c.id !== itemId);
        // If last child removed, clear old parent's hasChildren
        if (oldKey !== 'workspace' && newChildren[oldKey].length === 0 && newItemById[oldKey]) {
          newItemById[oldKey] = { ...newItemById[oldKey], hasChildren: false };
          const gpKey = newItemById[oldKey].parentId ?? 'workspace';
          if (newChildren[gpKey]) {
            newChildren[gpKey] = newChildren[gpKey].map((s) =>
              s.id === oldKey ? newItemById[oldKey] : s,
            );
          }
        }
      }

      // Add to new parent (if that parent's children are cached)
      const newKey = newParentId;
      if (newChildren[newKey]) {
        newChildren[newKey] = [...newChildren[newKey], updatedItem];
      }

      // Mark new parent as having children so clicking it opens a column
      if (newParentId !== 'workspace') {
        const parent = newItemById[newParentId];
        if (parent && !parent.hasChildren) {
          const updatedParent = { ...parent, hasChildren: true };
          newItemById[newParentId] = updatedParent;
          // Also update in its own parent's children list so the chevron renders
          const parentKey = parent.parentId ?? 'workspace';
          if (newChildren[parentKey]) {
            newChildren[parentKey] = newChildren[parentKey].map((s) =>
              s.id === newParentId ? updatedParent : s,
            );
          }
        }
      }

      // If the moved item was selected or in the column path, clean up navigation
      let newColumnPath = state.columnPath;
      const colIndex = newColumnPath.indexOf(itemId);
      if (colIndex >= 0) {
        newColumnPath = newColumnPath.slice(0, colIndex);
      }

      // CR-6: If old parent became childless, collapse its empty column
      if (oldKey !== 'workspace' && newChildren[oldKey]?.length === 0) {
        const oldParentColIndex = newColumnPath.indexOf(oldKey);
        if (oldParentColIndex >= 0) {
          newColumnPath = newColumnPath.slice(0, oldParentColIndex);
        }
      }

      // Clear selection if the moved item was selected
      const newSelections = { ...state.selections };
      for (const [idx, selId] of Object.entries(newSelections)) {
        if (selId === itemId) {
          delete newSelections[Number(idx)];
        }
      }

      // Clear from multi-selections
      const newMultiSelections = { ...state.multiSelections };
      for (const [idx, ids] of Object.entries(newMultiSelections)) {
        const filtered = ids.filter((id) => id !== itemId);
        if (filtered.length > 0) {
          newMultiSelections[Number(idx)] = filtered;
        } else {
          delete newMultiSelections[Number(idx)];
        }
      }

      // CR-7: Clear stale selectionAnchor if moved item was the anchor
      const newSelectionAnchor = { ...state.selectionAnchor };
      for (const [idx, anchorId] of Object.entries(newSelectionAnchor)) {
        if (anchorId === itemId) delete newSelectionAnchor[Number(idx)];
      }

      return {
        itemById: newItemById,
        childrenByParentId: newChildren,
        columnPath: newColumnPath,
        selections: newSelections,
        multiSelections: newMultiSelections,
        selectionAnchor: newSelectionAnchor,
        previewTargetId: state.previewTargetId === itemId ? null : state.previewTargetId,
      };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setColumnSort: (columnIndex, field, direction) =>
    set((state) => ({
      columnSort: {
        ...state.columnSort,
        [columnIndex]: { field, direction },
      },
    })),

  setColumnWidth: (columnIndex, width) =>
    set((state) => ({
      columnWidths: { ...state.columnWidths, [columnIndex]: Math.max(140, Math.min(600, width)) },
    })),

  markNoChildren: (itemId) =>
    set((state) => {
      const item = state.itemById[itemId];
      if (!item) return state;

      // Update the item in itemById
      const updatedItem = { ...item, hasChildren: false };
      const newItemById = { ...state.itemById, [itemId]: updatedItem };

      // Also update in childrenByParentId so MillerItem re-renders without chevron
      const newChildrenByParentId = { ...state.childrenByParentId };
      const parentKey = item.parentId ?? 'workspace';
      const siblings = newChildrenByParentId[parentKey];
      if (siblings) {
        newChildrenByParentId[parentKey] = siblings.map((s) =>
          s.id === itemId ? updatedItem : s,
        );
      }

      // Remove the empty column if it's in the path
      let newColumnPath = state.columnPath;
      const colIndex = newColumnPath.indexOf(itemId);
      if (colIndex >= 0) {
        newColumnPath = newColumnPath.slice(0, colIndex);
      }

      return { itemById: newItemById, childrenByParentId: newChildrenByParentId, columnPath: newColumnPath };
    }),

  breadcrumbClick: (segmentIndex) =>
    set((state) => {
      const newColumnPath = state.columnPath.slice(0, segmentIndex + 1);
      const newSelections: Record<number, string> = {};
      for (let i = 0; i < segmentIndex; i++) {
        if (state.selections[i]) {
          newSelections[i] = state.selections[i];
        }
      }
      return {
        columnPath: newColumnPath,
        selections: newSelections,
        multiSelections: {},
        selectionAnchor: {},
        editingItemId: null,
        previewTargetId: newColumnPath.length > 1
          ? newColumnPath[newColumnPath.length - 1]
          : null,
      };
    }),

  // ---- Multi-Select ----
  toggleMultiSelect: (columnIndex, itemId) =>
    set((state) => {
      const current = state.multiSelections[columnIndex] ?? [];
      const exists = current.includes(itemId);
      const updated = exists
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      return {
        multiSelections: { ...state.multiSelections, [columnIndex]: updated },
        selectionAnchor: { ...state.selectionAnchor, [columnIndex]: itemId },
      };
    }),

  setMultiSelection: (columnIndex, itemIds) =>
    set((state) => ({
      multiSelections: { ...state.multiSelections, [columnIndex]: itemIds },
    })),

  clearMultiSelection: (columnIndex) =>
    set((state) => {
      const updated = { ...state.multiSelections };
      delete updated[columnIndex];
      return { multiSelections: updated };
    }),

  // ---- Editing ----
  startEditing: (itemId) => set({ editingItemId: itemId }),
  stopEditing: () => set({ editingItemId: null }),

  // ---- Optimistic CRUD ----
  optimisticCreate: (parentId, item) =>
    set((state) => {
      const newItemById = { ...state.itemById, [item.id]: item };
      const newChildren = { ...state.childrenByParentId };
      if (newChildren[parentId]) {
        newChildren[parentId] = [...newChildren[parentId], item];
      } else {
        newChildren[parentId] = [item];
      }

      // If this is the first child, mark parent hasChildren and open its column
      let newColumnPath = state.columnPath;
      if (parentId !== 'workspace') {
        const parent = newItemById[parentId];
        if (parent && !parent.hasChildren) {
          const updatedParent = { ...parent, hasChildren: true };
          newItemById[parentId] = updatedParent;
          const parentKey = parent.parentId ?? 'workspace';
          if (newChildren[parentKey]) {
            newChildren[parentKey] = newChildren[parentKey].map((s) =>
              s.id === parentId ? updatedParent : s,
            );
          }
          // If the parent is selected but has no child column, add one
          const parentColIndex = newColumnPath.indexOf(parentId);
          if (parentColIndex === -1) {
            // Parent is not yet in the column path as a column provider,
            // but it might be the last selected item. Check selections.
            for (const [, selId] of Object.entries(state.selections)) {
              if (selId === parentId) {
                // Parent is selected — extend columnPath to show its children
                const selColIdx = newColumnPath.length;
                newColumnPath = [...newColumnPath, parentId];
                break;
              }
            }
          }
        }
      }

      return { itemById: newItemById, childrenByParentId: newChildren, columnPath: newColumnPath };
    }),

  optimisticRename: (itemId, newTitle) =>
    set((state) => {
      const item = state.itemById[itemId];
      if (!item) return state;

      const updated = { ...item, title: newTitle };
      const newItemById = { ...state.itemById, [itemId]: updated };
      const newChildren = { ...state.childrenByParentId };
      const parentKey = item.parentId ?? 'workspace';
      if (newChildren[parentKey]) {
        newChildren[parentKey] = newChildren[parentKey].map((s) =>
          s.id === itemId ? updated : s,
        );
      }

      return { itemById: newItemById, childrenByParentId: newChildren };
    }),

  optimisticDelete: (itemId, parentId) => {
    // Capture return value via closure (avoids get() which breaks SSR)
    let result: { item: FinderItem; index: number } | null = null;

    set((state) => {
      const item = state.itemById[itemId];
      if (!item) return state;

      const parentKey = parentId;
      const siblings = state.childrenByParentId[parentKey] ?? [];
      const index = siblings.findIndex((s) => s.id === itemId);

      // Capture for caller before mutating
      result = { item, index };

      const newItemById = { ...state.itemById };
      delete newItemById[itemId];
      const newChildren = { ...state.childrenByParentId };
      if (newChildren[parentKey]) {
        newChildren[parentKey] = newChildren[parentKey].filter((s) => s.id !== itemId);
        // If last child removed, clear parent's hasChildren
        if (parentKey !== 'workspace' && newChildren[parentKey].length === 0 && newItemById[parentKey]) {
          newItemById[parentKey] = { ...newItemById[parentKey], hasChildren: false };
          // Also update parent in its grandparent's children list
          const gpKey = newItemById[parentKey].parentId ?? 'workspace';
          if (newChildren[gpKey]) {
            newChildren[gpKey] = newChildren[gpKey].map((s) =>
              s.id === parentKey ? newItemById[parentKey] : s,
            );
          }
        }
      }

      // Clean up navigation if deleted item was in columnPath
      let newColumnPath = state.columnPath;
      const colIndex = newColumnPath.indexOf(itemId);
      if (colIndex >= 0) {
        newColumnPath = newColumnPath.slice(0, colIndex);
      }

      // CR-6: If parent became childless, collapse its empty column
      if (parentKey !== 'workspace' && newChildren[parentKey]?.length === 0) {
        const parentColIndex = newColumnPath.indexOf(parentKey);
        if (parentColIndex >= 0) {
          newColumnPath = newColumnPath.slice(0, parentColIndex);
        }
      }

      // Clear selection if deleted item was selected
      const newSelections = { ...state.selections };
      for (const [idx, selId] of Object.entries(newSelections)) {
        if (selId === itemId) delete newSelections[Number(idx)];
      }

      // Clear from multi-selections
      const newMultiSelections = { ...state.multiSelections };
      for (const [idx, ids] of Object.entries(newMultiSelections)) {
        const filtered = ids.filter((id) => id !== itemId);
        if (filtered.length > 0) {
          newMultiSelections[Number(idx)] = filtered;
        } else {
          delete newMultiSelections[Number(idx)];
        }
      }

      // Clear stale selectionAnchor
      const newSelectionAnchor = { ...state.selectionAnchor };
      for (const [idx, anchorId] of Object.entries(newSelectionAnchor)) {
        if (anchorId === itemId) delete newSelectionAnchor[Number(idx)];
      }

      return {
        itemById: newItemById,
        childrenByParentId: newChildren,
        columnPath: newColumnPath,
        selections: newSelections,
        multiSelections: newMultiSelections,
        selectionAnchor: newSelectionAnchor,
        previewTargetId: state.previewTargetId === itemId ? null : state.previewTargetId,
      };
    });

    return result;
  },

  optimisticBatchDelete: (itemIds, parentId) => {
    const idSet = new Set(itemIds);
    set((state) => {
      const newItemById = { ...state.itemById };
      for (const id of itemIds) delete newItemById[id];

      const newChildren = { ...state.childrenByParentId };
      const parentKey = parentId;
      if (newChildren[parentKey]) {
        newChildren[parentKey] = newChildren[parentKey].filter((s) => !idSet.has(s.id));
        // If all children removed, clear parent's hasChildren
        if (parentKey !== 'workspace' && newChildren[parentKey].length === 0 && newItemById[parentKey]) {
          newItemById[parentKey] = { ...newItemById[parentKey], hasChildren: false };
          const gpKey = newItemById[parentKey].parentId ?? 'workspace';
          if (newChildren[gpKey]) {
            newChildren[gpKey] = newChildren[gpKey].map((s) =>
              s.id === parentKey ? newItemById[parentKey] : s,
            );
          }
        }
      }

      // Clean up columnPath
      let newColumnPath = state.columnPath;
      const firstColIndex = newColumnPath.findIndex((id) => idSet.has(id));
      if (firstColIndex >= 0) {
        newColumnPath = newColumnPath.slice(0, firstColIndex);
      }

      // CR-6: If parent became childless, collapse its empty column
      if (parentKey !== 'workspace' && newChildren[parentKey]?.length === 0) {
        const parentColIndex = newColumnPath.indexOf(parentKey);
        if (parentColIndex >= 0) {
          newColumnPath = newColumnPath.slice(0, parentColIndex);
        }
      }

      // Clean up selections
      const newSelections = { ...state.selections };
      for (const [idx, selId] of Object.entries(newSelections)) {
        if (idSet.has(selId)) delete newSelections[Number(idx)];
      }

      // Clean up multi-selections
      const newMultiSelections = { ...state.multiSelections };
      for (const [idx, ids] of Object.entries(newMultiSelections)) {
        const filtered = ids.filter((id) => !idSet.has(id));
        if (filtered.length > 0) {
          newMultiSelections[Number(idx)] = filtered;
        } else {
          delete newMultiSelections[Number(idx)];
        }
      }

      // Clean up stale selectionAnchors
      const newSelectionAnchor = { ...state.selectionAnchor };
      for (const [idx, anchorId] of Object.entries(newSelectionAnchor)) {
        if (idSet.has(anchorId)) delete newSelectionAnchor[Number(idx)];
      }

      return {
        itemById: newItemById,
        childrenByParentId: newChildren,
        columnPath: newColumnPath,
        selections: newSelections,
        multiSelections: newMultiSelections,
        selectionAnchor: newSelectionAnchor,
        previewTargetId: state.previewTargetId && idSet.has(state.previewTargetId) ? null : state.previewTargetId,
      };
    });
  },

  // ---- Delete Confirmation ----
  setPendingDelete: (payload) => set({ pendingDelete: payload }),
}));
