"use client";

import React from "react";

export interface UserItem {
  id: string;
  name: string;
  enabled?: boolean;
}

interface UserSelectorProps {
  users: UserItem[];
  selectedUser: string | null;
  onChange: (userId: string) => void;
  className?: string;
}

export default function UserSelector({
  users,
  selectedUser,
  onChange,
  className = "",
}: UserSelectorProps) {
  if (!users || users.length === 0) return null;

  const effectiveUser = selectedUser && users.some((u) => u.id === selectedUser)
    ? selectedUser
    : users[0]?.id || "";

  return (
    <select
      value={effectiveUser}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name || u.id} {u.enabled === false ? "(Disabled)" : ""}
        </option>
      ))}
    </select>
  );
}
