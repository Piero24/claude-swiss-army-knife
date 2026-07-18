"use client";

import { useEffect, useCallback, type ReactNode } from "react";

interface ModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Called when the modal should close (backdrop click or Escape key) */
  onClose: () => void;
  /** Optional title shown at the top */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Max width class (default: "max-w-md") */
  maxWidth?: string;
}

/**
 * Shared modal overlay — replaces the duplicated
 * `fixed inset-0 bg-black/60 flex items-center justify-center z-50` pattern
 * used in bulk confirm, add-rule, and add-user dialogs.
 */
export default function Modal({ open, onClose, title, children, maxWidth = "max-w-md" }: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-lg p-6 w-full ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
