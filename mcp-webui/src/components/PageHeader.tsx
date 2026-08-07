"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ServerIcon } from "@/components/ServerIcon";

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional icon (SVG string or emoji) */
  icon?: string;
  /** Back navigation link (defaults to "/") */
  backHref?: string;
  /** Action buttons rendered on the right side */
  actions?: ReactNode;
}

/**
 * Shared page header — back arrow + icon + title + optional action buttons.
 */
export default function PageHeader({ title, icon, backHref = "/", actions }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <Link href={backHref} className="text-gray-400 hover:text-white">
        <ArrowLeft size={20} />
      </Link>
      {icon && <ServerIcon icon={icon} className="w-7 h-7 flex items-center justify-center shrink-0" />}
      <h1 className="text-2xl font-bold">{title}</h1>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
