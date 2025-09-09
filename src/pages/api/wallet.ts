import type { NextApiRequest, NextApiResponse } from "next";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";

function isAddr(a?: string) {
  return /^0x[0-9a-fA-F]{40}$/.test((a || "").trim());
}
function toInt(v: any, def = 0) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const address = String(req.query.address || "").toLowerCase();
    if (!isAddr(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const api1 = `${EXPLORER_URL}/api?module=account&action=tokenlist&address=${address}`;
    const api2 = `${EXPLORER_URL}/api/v2/addresses/${address}/tokens?type=ERC-20&limit=200`;

    let items: any[] = [];

    // try legacy blockscout
    try {
      const r1 = await fetch(api1, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (r1.ok) {
        const j1: any = await r1.json();
        const arr = Array.isArray(j1?.result) ? j1.result : [];
        items = arr
          .map((t: any) => ({
            address: (t.contractAddress || t.contract || "").toLowerCase(),
            name: t.name || "Token",
            symbol: t.symbol || "TKN",
            decimals: toInt(t.decimals, 18),
            balance: String(t.balance ?? "0"),
          }))
          .filter((x: any) => isAddr(x.address));
      }
    } catch {}

    // fallback v2
    if (!items.length) {
      const r2 = await fetch(api2, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
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
              decimals: toInt(t?.decimals, 18),
              balance: String(it?.value ?? it?.balance ?? "0"),
            };
          })
          .filter((x: any) => isAddr(x.address));
      }
    }

    res.status(200).json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "wallet failed" });
  }
}
