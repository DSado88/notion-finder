'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface InlineEditProps {
  value: string;
  onConfirm: (newValue: string) => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** Prevent click/double-click from bubbling (needed when nested inside a button) */
  stopPropagation?: boolean;
}

export function InlineEdit({
  value,
  onConfirm,
  onCancel,
  className,
  style,
  stopPropagation,
}: InlineEditProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const readyRef = useRef(false);

  // Focus + select on mount with rAF to avoid immediate blur from triggering click/Enter
  useEffect(() => {
    confirmedRef.current = false;
    readyRef.current = false;
    setDraft(value);
    const rafId = requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
        readyRef.current = true;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  // Cancel on unmount (virtualization safety — don't confirm stale draft).
  // Ref avoids stale closure and prevents effect re-runs from changing onCancel identity.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    return () => {
      if (!confirmedRef.current && readyRef.current) onCancelRef.current();
    };
  }, []);

  const handleConfirm = useCallback(() => {
    if (!readyRef.current) return;
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm(draft);
  }, [draft, onConfirm]);

  const handleCancel = useCallback(() => {
    confirmedRef.current = true;
    onCancel();
  }, [onCancel]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
        else if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
      }}
      onBlur={handleConfirm}
      className={className}
      style={style}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      onDoubleClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    />
  );
}
