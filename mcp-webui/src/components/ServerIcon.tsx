import React from "react";

interface ServerIconProps {
  icon: string;
  className?: string;
}

export function ServerIcon({ icon, className = "w-7 h-7 flex items-center justify-center shrink-0" }: ServerIconProps) {
  if (icon && icon.trim().startsWith("<svg")) {
    return (
      <div
        className={`${className} [&>svg]:w-full [&>svg]:h-full [&>svg]:object-contain`}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }
  return <span className={`text-xl ${className}`}>{icon}</span>;
}
