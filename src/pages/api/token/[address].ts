import type { NextApiRequest, NextApiResponse } from "next";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";

function isAddr(a?: string){ return /^0x[0-9a-fA-F]{40}$/.test((a||"").trim()); }
function i(v:any, def:number|null=0){ const n=parseInt(String(v),10); return Number.isFinite(n)?n:def; }

function toFloat(v:any, decimals:number|null){
  try{
    if (v==null) return null;
    const d = Math.max(0, i(decimals??18, 18));
    const s = String(v);
    if (/^\d+$/.test(s)) {
      if (d===0) return Number(s);
      if (s.length<=d) return Number(`0.${"0".repeat(d - s.length)}${s}`);
      return Number(`${s.slice(0, s.length-d)}.${s.slice(s.length-d)}`);
    }
    return Number(s);
  }catch{ return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const address = String(req.query.address || "").toLowerCase();
    if (!isAddr(address)) return res.status(400).json({ error:"Invalid address" });

    const r = await fetch(`${EXPLORER_URL}/api/v2/tokens/${address}`, {
      headers:{ accept:"application/json" }, cache:"no-store"
    });
    if (!r.ok) return res.status(r.status).json({ error:`explorer ${r.status}` });

    const j:any = await r.json();
    const a = j?.token || j?.data || j || {};
    const decimals = i(a.decimals, 18);
    const total = toFloat(a.total_supply, decimals);
    const circ  = toFloat(a.circulating_supply ?? a.total_supply, decimals);
    const holders = i(a.holders_count ?? a.holder_count ?? a.holders, null);

    return res.status(200).json({ decimals, supplyTotal: total, supplyCirc: circ, holders });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "token failed" });
  }
}
