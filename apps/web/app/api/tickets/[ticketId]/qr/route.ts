import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${apiUrl}/public/tickets/${ticketId}/qr`);
    if (!res.ok) return new NextResponse("Not found", { status: 404 });
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" }
    });
  } catch {
    return new NextResponse("Error", { status: 500 });
  }
}
