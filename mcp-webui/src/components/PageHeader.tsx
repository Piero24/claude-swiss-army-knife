"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Back navigation link (defaults to "/") */
  backHref?: string;
  /** Action buttons rendered on the right side */
  actions?: ReactNode;
}

/**
 * Shared page header — back arrow + title + optional action buttons.
 * Replaces the duplicated pattern on server detail, agents, and settings pages.
 */
export default function PageHeader({ title, backHref = "/", actions }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <Link href={backHref} className="text-gray-400 hover:text-white">
        <ArrowLeft size={20} />
      </Link>
      <h1 className="text-2xl font-bold">{title}</h1>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
