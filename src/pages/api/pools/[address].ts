import type { NextApiRequest, NextApiResponse } from "next";

const GECKO_NET = "pepe-unchained";
function isAddr(a?: string) { return /^0x[0-9a-fA-F]{40}$/.test((a || "").trim()); }
function num(v:any){ const n=Number(v); return Number.isFinite(n) ? n : null; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const address = String(req.query.address || "").toLowerCase();
    if (!isAddr(address)) return res.status(400).json({ error: "Invalid address" });

    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/tokens/${address}/pools`,
      { headers:{ accept:"application/json" }, cache:"no-store" }
    );
    if (!r.ok) return res.status(r.status).json({ error:`gecko ${r.status}` });

    const j:any = await r.json();
    const pools = (Array.isArray(j?.data)?j.data:[]).map((p:any)=>{
      const a = p?.attributes || {};
      return {
        address: (a.address || a.pool_address || "").toLowerCase(),
        dex: a?.dex || a?.name || "Pool",
        liq: num(a?.reserve_in_usd ?? a?.reserve_usd ?? a?.liquidity_usd),
      };
    });
    return res.status(200).json({ pools });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "pools failed" });
  }
}
