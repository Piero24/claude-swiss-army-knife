import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "MCP Permissions Manager",
  description: "Manage permissions for your MCP servers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <Toaster position="top-right" theme="dark" />
        {children}
      </body>
    </html>
  );
}
