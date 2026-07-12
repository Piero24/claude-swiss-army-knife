import { NextResponse } from "next/server";
import { cancelScan } from "@/lib/scan-status";

export async function POST() {
  cancelScan();
  return NextResponse.json({ cancelled: true });
}
