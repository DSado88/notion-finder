'use client';

import { create } from 'zustand';
import type { FinderItem, SortField, SortDirection } from '@/types/finder';

interface FinderStore {
  // ---- Navigation State ----
  viewMode: 'miller' | 'list';
  /** Parent IDs for each visible column. 'workspace' = root. */
  columnPath: string[];
  /** columnIndex → selected item ID */
  selections: Record<number, string>;
  previewTargetId: string | null;

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
  setViewMode: (mode: 'miller' | 'list') => void;
  setColumnSort: (columnIndex: number, field: SortField, direction: SortDirection) => void;
  setColumnWidth: (columnIndex: number, width: number) => void;
  breadcrumbClick: (segmentIndex: number) => void;
  /** Mark an item as having no children (removes chevron, prevents empty columns) */
  markNoChildren: (itemId: string) => void;
}

export const useFinderStore = create<FinderStore>((set) => ({
  viewMode: 'miller',
  columnPath: ['workspace'],
  selections: {},
  previewTargetId: null,
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

      return {
        columnPath: newColumnPath,
        selections: newSelections,
        previewTargetId: itemId,
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
        previewTargetId: newColumnPath.length > 1
          ? newColumnPath[newColumnPath.length - 1]
          : null,
      };
    }),
}));
