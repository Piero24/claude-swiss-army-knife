"use client";

type BadgeVariant = "access" | "result" | "health" | "status";

const VARIANT_STYLES: Record<string, Record<string, string>> = {
  access: {
    read: "bg-blue-900/50 text-blue-400",
    write: "bg-green-900/50 text-green-400",
    none: "bg-gray-700 text-gray-400",
    active: "bg-green-900/50 text-green-400",
  },
  result: {
    allowed: "bg-green-900/50 text-green-400",
    denied: "bg-red-900/50 text-red-400",
  },
  health: {
    healthy: "bg-green-900/50 text-green-400",
    idle: "bg-yellow-900/50 text-yellow-400",
    unconfigured: "bg-orange-900/50 text-orange-400",
    stopped: "bg-red-900/50 text-red-400",
    "not-found": "bg-gray-800 text-gray-400",
    error: "bg-gray-800 text-gray-400",
  },
  status: {
    set: "bg-green-900/50 text-green-400",
    none: "bg-gray-800 text-gray-500",
    loaded: "bg-green-900/50 text-green-400",
    missing: "bg-red-900/50 text-red-400",
  },
};

const HEALTH_ICONS: Record<string, string> = {
  healthy: "🟢",
  idle: "🟡",
  unconfigured: "🟠",
  stopped: "🔴",
  "not-found": "⚪",
  error: "⚪",
};

interface BadgeProps {
  /** The badge category — determines the color palette */
  variant: BadgeVariant;
  /** The value to display and style-map (e.g., "read", "allowed", "healthy") */
  value: string;
  /** Optional custom label text (defaults to value) */
  label?: string;
  /** Show health icon prefix for health variant */
  showIcon?: boolean;
}

/**
 * Unified badge component — consolidates the 6+ different inline badge styles
 * across the codebase into a single component with consistent dark-theme colors.
 */
export default function Badge({ variant, value, label, showIcon }: BadgeProps) {
  const styles = VARIANT_STYLES[variant]?.[value] || "bg-gray-700 text-gray-400";
  const icon = showIcon && variant === "health" ? HEALTH_ICONS[value] : null;
  const displayText = label || value;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${styles}`}>
      {icon && <span>{icon}</span>}
      {displayText}
    </span>
  );
}
