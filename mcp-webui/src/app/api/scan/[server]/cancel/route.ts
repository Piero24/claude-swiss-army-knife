import { NextResponse } from "next/server";
import { cancelScan } from "@/lib/scan-status";
import http from "http";

const SCAN_CONFIG: Record<string, { container: string; module: string }> = {
  "synology-nas": { container: "synology-mcp", module: "synology_mcp" },
  obsidian: { container: "obsidian-mcp", module: "obsidian_mcp" },
  "ubuntu-server": { container: "ubuntu-mcp", module: "ubuntu_mcp" },
};

function dockerExecCancel(container: string, cmd: string[]): Promise<void> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        socketPath: "/var/run/docker.sock",
        path: `/containers/${container}/exec`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const { Id } = JSON.parse(data);
            // Start the exec (fire-and-forget)
            const startReq = http.request(
              {
                socketPath: "/var/run/docker.sock",
                path: `/exec/${Id}/start`,
                method: "POST",
                headers: { "Content-Type": "application/json" },
              },
              () => {},
            );
            startReq.on("error", () => {});
            startReq.write(JSON.stringify({ Detach: true, Tty: false }));
            startReq.end();
          } catch {
            // best-effort
          }
          resolve();
        });
      },
    );
    req.on("error", () => resolve());
    req.setTimeout(5000, () => { req.destroy(); resolve(); });
    req.write(JSON.stringify({ Cmd: cmd }));
    req.end();
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const { server } = await params;
  cancelScan();

  // Also write cancel sentinel inside the container
  const cfg = SCAN_CONFIG[server];
  if (cfg) {
    dockerExecCancel(cfg.container, [
      "python", "-m", cfg.module, "discover", "--cancel",
    ]);
  }

  return NextResponse.json({ cancelled: true });
}
