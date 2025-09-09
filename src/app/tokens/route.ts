import { NextResponse } from "next/server";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";

export const dynamic = "force-dynamic"; // pas de cache côté Next en dev

export async function GET() {
  const url =
    `${EXPLORER_URL}/api/v2/tokens` +
    `?type=${encodeURIComponent("ERC-20,ERC-721,ERC-1155")}` +
    `&limit=500&page=1`;
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `explorer HTTP ${r.status}` },
        { status: r.status }
      );
    }
    const j: any = await r.json();
    const items = Array.isArray(j?.items) ? j.items : [];
    const tokens = items
      .map((it: any) => it?.token || it)
      .filter(
        (t: any) =>
          String(t?.type || "").toUpperCase() === "ERC-20" &&
          /^0x[0-9a-fA-F]{40}$/.test(String(t?.address || ""))
      )
      .map((t: any) => ({
        address: String(t.address).toLowerCase(),
        symbol: t.symbol || "TKN",
        name: t.name || t.symbol || "Token",
      }));
    return NextResponse.json({ items: tokens });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "fetch failed" },
      { status: 500 }
    );
  }
}
