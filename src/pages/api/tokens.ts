import type { NextApiRequest, NextApiResponse } from "next";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";

function isAddr(a?: string) {
  return /^0x[0-9a-fA-F]{40}$/.test((a || "").trim());
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const url =
      `${EXPLORER_URL}/api/v2/tokens` +
      `?type=${encodeURIComponent("ERC-20,ERC-721,ERC-1155")}` +
      `&limit=500&page=1`;

    const r = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: `explorer HTTP ${r.status}` });
    }

    const j: any = await r.json();
    const items = Array.isArray(j?.items) ? j.items : [];

    const tokens = items
      .map((it: any) => it?.token || it)
      .filter(
        (t: any) =>
          String(t?.type || "").toUpperCase() === "ERC-20" &&
          isAddr(t?.address)
      )
      .map((t: any) => ({
        address: String(t.address).toLowerCase(),
        symbol: t.symbol || "TKN",
        name: t.name || t.symbol || "Token",
      }));

    res.status(200).json({ items: tokens });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "fetch failed" });
  }
}
