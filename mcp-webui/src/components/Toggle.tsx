"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible label for screen readers */
  label?: string;
}

/**
 * Shared toggle switch — replaces the duplicated w-9 h-5 rounded-full pattern
 * used across dashboard, agents page, and server detail.
 */
export default function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange(!checked);
      }}
      className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${
        checked ? "bg-green-600" : "bg-gray-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={label || (checked ? "Deactivate" : "Activate")}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
