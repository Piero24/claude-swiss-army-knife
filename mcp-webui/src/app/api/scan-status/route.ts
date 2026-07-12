import { NextResponse } from "next/server";
import { getScanStatus } from "@/lib/scan-status";

export async function GET() {
  return NextResponse.json(getScanStatus());
}
