// src/pages/api/market/[address].ts
import type { NextApiRequest, NextApiResponse } from "next";

const GECKO_NET = "pepe-unchained";
const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";

function isAddr(a?: string) {
  return /^0x[0-9a-fA-F]{40}$/.test((a || "").trim());
}
function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function i(v: any, def: number = 0) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}
function toFloat(v: any, decimals: number | null | undefined) {
  try {
    if (v == null) return null;
    const d = Math.max(0, Number(decimals ?? 18)); // ✅ Fix: Number(...) pour éviter null
    const s = String(v);
    if (/^\d+$/.test(s)) {
      if (d === 0) return Number(s);
      if (s.length <= d) return Number(`0.${"0".repeat(d - s.length)}${s}`);
      return Number(`${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`);
    }
    return Number(s);
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const address = String(req.query.address || "").toLowerCase();
    if (!isAddr(address)) return res.status(400).json({ error: "Invalid address" });

    // On récupère en parallèle:
    const [rg, rt] = await Promise.all([
      fetch(
        `https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/tokens/${address}`,
        { headers: { accept: "application/json" }, cache: "no-store" }
      ),
      fetch(`${EXPLORER_URL}/api/v2/tokens/${address}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      }),
    ]);

    if (!rg.ok) return res.status(rg.status).json({ error: `gecko ${rg.status}` });

    const jg: any = await rg.json();
    const ag = jg?.data?.attributes || {};

    const price = asNum(ag.price_usd);
    let mc = asNum(ag.market_cap_usd);
    const fdv = asNum(ag.fdv_usd);
    let vol =
      asNum(ag.volume_usd_24h) ??
      asNum(ag.volume_usd?.h24) ??
      asNum(ag.h24_volume_usd);
    let chg =
      ag.price_percent_change_24h ??
      ag.price_change_percentage?.h24 ??
      ag.h24_price_change_percentage;

    // Si vol/Δ manquants, tenter top pool
    if (vol == null || chg == null) {
      try {
        const rp = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/tokens/${address}/pools`,
          { headers: { accept: "application/json" }, cache: "no-store" }
        );
        if (rp.ok) {
          const jp: any = await rp.json();
          const pa = jp?.data?.[0]?.attributes || {};
          if (vol == null)
            vol =
              asNum(pa.volume_usd_24h) ??
              asNum(pa.volume_usd?.h24) ??
              asNum(pa.h24_volume_usd);
          if (chg == null)
            chg =
              pa.price_percent_change_24h ??
              pa.price_change_percentage?.h24 ??
              pa.h24_price_change_percentage;
        }
      } catch {}
    }

    // Fallback MC
    if (!rt.ok && (mc == null || mc === 0)) {
      mc = fdv ?? mc ?? null;
    } else if (mc == null || mc === 0) {
      const jt: any = await rt.json();
      const t = jt?.token || jt?.data || jt || {};
      const decimals = Number(i(t.decimals, 18)); // ✅ encore safe ici
      const circ = toFloat(t.circulating_supply ?? t.total_supply, decimals);
      if (price != null && circ != null) {
        const calc = price * circ;
        mc = fdv ?? calc ?? null;
      } else {
        mc = fdv ?? mc ?? null;
      }
    }

    const change = chg != null ? `${Number(chg).toFixed(2)} %` : "—";

    return res.status(200).json({
      price: price ?? null,
      mc: mc ?? null,
      vol: vol ?? null,
      change,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "market failed" });
  }
}
