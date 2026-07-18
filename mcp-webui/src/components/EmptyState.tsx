"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Icon element displayed above the message */
  icon?: ReactNode;
  /** Main message text */
  title: string;
  /** Secondary description */
  description?: string;
  /** Optional call-to-action button */
  action?: ReactNode;
}

/**
 * Shared "no data" placeholder — replaces the 5+ duplicated empty state patterns
 * across server detail, agents, and audit log sections.
 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-gray-800 p-12 text-center">
      {icon && <div className="mx-auto mb-3 text-gray-600 flex justify-center">{icon}</div>}
      <p className="text-gray-400 mb-2">{title}</p>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  );
}
