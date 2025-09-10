// src/pages/api/tokens.ts
import type { NextApiRequest, NextApiResponse } from "next";

const WORKER =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.API_BASE ||
  "https://unchainedpay-api.u5763870533.workers.dev";

// Adresses à exclure (en minuscules)
const BLOCKED = new Set<string>([
  "0x06f69a40c33c5a4cd038bbe1da689d4d636ec448", // USDT
  "0x20fb684bfc1abaabd3acec5712f2aa30bd494df74", // USDC (celle que tu m'as donnée)
]);

type RawToken = Record<string, any>;
type TokenItem = { address: string; symbol?: string; name?: string };

function pickAddress(x: RawToken): string | null {
  // Essaye plusieurs clés possibles renvoyées par des sources différentes
  const cand =
    x?.address ||
    x?.tokenAddress ||
    x?.contract_address ||
    x?.contractAddress ||
    x?.token ||
    x?.contract ||
    x?.addr;
  if (typeof cand === "string" && /^0x[0-9a-fA-F]{40}$/.test(cand)) {
    return cand.toLowerCase();
  }
  return null;
}

function mapItem(x: RawToken): TokenItem | null {
  const address = pickAddress(x);
  if (!address) return null;
  return {
    address,
    symbol: x?.symbol,
    name: x?.name,
  };
}

function isBlockedToken(t: TokenItem): boolean {
  if (!t) return false;
  const addr = String(t.address || "").toLowerCase();
  const sym = String(t.symbol || "").toUpperCase();
  // Bloque par adresse OU par symbole (pour couvrir une éventuelle autre adresse d’USDC/USDT)
  return BLOCKED.has(addr) || sym === "USDC" || sym === "USDT";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let items: TokenItem[] = [];

    if (WORKER) {
      // 1) /tokens (whitelist courte)
      try {
        const r = await fetch(`${WORKER}/tokens`, { headers: { accept: "application/json" } });
        if (r.ok) {
          const j = await r.json();
          const arr: RawToken[] = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
          items.push(
            ...arr.map(mapItem).filter((x): x is TokenItem => !!x)
          );
        }
      } catch {}

      // 2) /tokens/discover (fallback)
      if (!items.length) {
        try {
          const r = await fetch(`${WORKER}/tokens/discover?limit=200&page=1`, {
            headers: { accept: "application/json" },
          });
          if (r.ok) {
            const j = await r.json();
            const arr: RawToken[] = Array.isArray(j?.items) ? j.items : [];
            items.push(
              ...arr.map(mapItem).filter((x): x is TokenItem => !!x)
            );
          }
        } catch {}
      }
    }

    // 3) Filtre anti-stables (adresse + symbole)
    items = items.filter((t) => !isBlockedToken(t));

    // 4) Dédup par adresse
    const seen = new Set<string>();
    items = items.filter((t) => {
      const k = t.address.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server_error" });
  }
}