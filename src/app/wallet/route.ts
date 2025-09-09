import { NextResponse } from "next/server";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";

function isAddr(a?: string) {
  return /^0x[0-9a-fA-F]{40}$/.test((a || "").trim());
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = (searchParams.get("address") || "").toLowerCase();
    if (!isAddr(address)) {
      return NextResponse.json(
        { error: "Invalid address" },
        { status: 400 }
      );
    }

    // 1) ancienne API blockscout
    const api1 = `${EXPLORER_URL}/api?module=account&action=tokenlist&address=${address}`;
    // 2) v2 (fallback)
    const api2 = `${EXPLORER_URL}/api/v2/addresses/${address}/tokens?type=ERC-20&limit=200`;

    // essaie api1 puis api2
    let items: any[] = [];
    try {
      const r1 = await fetch(api1, { headers: { accept: "application/json" }, cache: "no-store" });
      if (r1.ok) {
        const j1: any = await r1.json();
        const arr = Array.isArray(j1?.result) ? j1.result : [];
        items = arr
          .map((t: any) => ({
            address: (t.contractAddress || t.contract || "").toLowerCase(),
            name: t.name || "Token",
            symbol: t.symbol || "TKN",
            decimals: Number(t.decimals ?? 18),
            balance: String(t.balance ?? "0"),
          }))
          .filter((x: any) => isAddr(x.address));
      }
    } catch {}

    if (!items.length) {
      const r2 = await fetch(api2, { headers: { accept: "application/json" }, cache: "no-store" });
      if (r2.ok) {
        const j2: any = await r2.json();
        const arr = Array.isArray(j2?.items) ? j2.items : [];
        items = arr
          .map((it: any) => {
            const t = it?.token || it;
            return {
              address: (t?.address || t?.contract_address || "").toLowerCase(),
              name: t?.name || "Token",
              symbol: t?.symbol || "TKN",
              decimals: Number(t?.decimals ?? 18),
              balance: String(it?.value ?? it?.balance ?? "0"),
            };
          })
          .filter((x: any) => isAddr(x.address));
      }
    }

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "wallet failed" }, { status: 500 });
  }
}
