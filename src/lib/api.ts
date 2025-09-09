const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "";
const GECKO_NET = "pepe-unchained";

type Json = any;

async function getJSON<T = Json>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return (await r.json()) as T;
}

const isAddr = (a?: string) => /^0x[0-9a-fA-F]{40}$/.test((a || "").trim());

// --- TOKENS ---
export async function tokens(): Promise<Array<{address:string; symbol?:string; name?:string}>> {
  if (API_BASE) {
    try {
      const j: any = await getJSON(`${API_BASE}/tokens`);
      if (Array.isArray(j)) return j.filter((x:any)=>isAddr(x?.address)).map((x:any)=>({address:x.address.toLowerCase(), symbol:x.symbol, name:x.name}));
    } catch {}
    try {
      const j2: any = await getJSON(`${API_BASE}/tokens/discover?limit=200&page=1`);
      const arr = Array.isArray(j2?.items) ? j2.items : [];
      return arr.filter((x:any)=>isAddr(x?.address)).map((x:any)=>({address:x.address.toLowerCase(), symbol:x.symbol, name:x.name}));
    } catch {}
  }
  // Fallback from Gecko trending pools
  try {
    const j: any = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/trending_pools?include=base_token,quote_token`);
    const pools = Array.isArray(j?.data) ? j.data : [];
    const map = new Map<string, any>();
    for (const p of pools) {
      const a = p?.attributes || {};
      const add = (addr?: string, sym?: string, name?: string) => {
        if (isAddr(addr)) {
          const k = addr!.toLowerCase();
          if (!map.has(k)) map.set(k, { address: k, symbol: sym || "TKN", name: name || sym || "Token" });
        }
      };
      add(a.base_token_address, a.base_token_symbol, a.base_token_name);
      add(a.quote_token_address, a.quote_token_symbol, a.quote_token_name);
    }
    return Array.from(map.values());
  } catch { return []; }
}

// --- MARKET ---
export async function market(addr: string): Promise<{ price: number|null; mc: number|null; vol: number|null; change: string }>{ 
  if (API_BASE) {
    try {
      const j: any = await getJSON(`${API_BASE}/market/${addr}`);
      const a = j?.data?.attributes || j?.attributes || j || {};
      const change = a.price_percent_change_24h != null ? Number(a.price_percent_change_24h).toFixed(2) + " %" : "—";
      return { price: a.price_usd ?? null, mc: (a.market_cap_usd ?? a.fdv_usd) ?? null, vol: a.volume_usd_24h ?? null, change };
    } catch {}
  }
  try {
    const j: any = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/tokens/${addr}`);
    const a = j?.data?.attributes || {};
    const change = a.price_percent_change_24h != null ? Number(a.price_percent_change_24h).toFixed(2) + " %" : "—";
    return { price: a.price_usd ?? null, mc: (a.market_cap_usd ?? a.fdv_usd) ?? null, vol: a.volume_usd_24h ?? null, change };
  } catch {}
  return { price: null, mc: null, vol: null, change: "—" };
}

// --- POOLS ---
export async function pools(addr: string): Promise<Array<{address:string; dex?:string; liq?:number}>> {
  if (API_BASE) {
    try {
      const j: any = await getJSON(`${API_BASE}/pools/${addr}`);
      if (Array.isArray(j?.pools)) return j.pools;
    } catch {}
  }
  try {
    const j: any = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/tokens/${addr}/pools`);
    const arr = Array.isArray(j?.data) ? j.data : [];
    return arr.map((p:any)=>({ 
      address: (p?.attributes?.address || p?.attributes?.pool_address || "").toLowerCase(),
      dex: p?.attributes?.dex || p?.attributes?.name || "Pool",
      liq: Number(p?.attributes?.reserve_in_usd ?? p?.attributes?.reserve_usd ?? p?.attributes?.liquidity_usd)
    }));
  } catch { return []; }
}

// --- SUPPLY ---
export async function supply(addr: string): Promise<{ supplyTotal: number|null; supplyCirc: number|null; decimals: number }>{ 
  if (API_BASE) {
    try { return await getJSON(`${API_BASE}/supply/${addr}`); } catch {}
  }
  try {
    const j: any = await getJSON(`${EXPLORER_URL}/api/v2/tokens/${addr}`);
    const a = j?.token || j?.data || j || {};
    const decimals = Number(a.decimals ?? 18);
    const toFloat = (v:any) => {
      if (v == null) return null;
      const s = String(v);
      if (/^\d+$/.test(s)) {
        if (decimals === 0) return Number(s);
        const len = s.length;
        if (len <= decimals) return Number(`0.${"0".repeat(decimals - len)}${s}`);
        return Number(`${s.slice(0, len - decimals)}.${s.slice(len - decimals)}`);
      }
      return Number(s);
    };
    return { supplyTotal: toFloat(a.total_supply), supplyCirc: toFloat(a.circulating_supply ?? a.total_supply), decimals };
  } catch {}
  return { supplyTotal: null, supplyCirc: null, decimals: 18 };
}

// --- HOLDERS ---
export async function holders(addr: string): Promise<number|null> {
  if (API_BASE) {
    try { const j:any = await getJSON(`${API_BASE}/holders/${addr}`); return j?.holders ?? null; } catch {}
  }
  try { const j:any = await getJSON(`${EXPLORER_URL}/api/v2/tokens/${addr}`); return j?.holders_count ?? j?.holder_count ?? j?.holders ?? null; } catch {}
  return null;
}

// --- OHLCV ---
export async function ohlcv(addr: string, interval: string = "1h", limit: number = 600): Promise<any[]> {
  if (API_BASE) {
    try { const j:any = await getJSON(`${API_BASE}/ohlcv/${addr}?interval=${interval}&limit=${limit}`); return Array.isArray(j?.candles)? j.candles : []; } catch {}
  }
  try {
    const j: any = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${GECKO_NET}/tokens/${addr}/ohlcv/${interval}?limit=${limit}`);
    const rows = j?.data?.attributes?.ohlcv_list || j?.data?.attributes?.candles || j?.candles || [];
    return (Array.isArray(rows) ? rows : []).map((x:any)=> Array.isArray(x) ? x : [x.timestamp || x.time, x.open, x.high, x.low, x.close, x.volume]);
  } catch { return []; }
}

// --- WALLET TOKENS ---
export async function walletTokens(address: string): Promise<Array<{address:string; name?:string; symbol?:string; decimals:number; balance:string}>> {
  if (API_BASE) {
    try {
      let j:any = await getJSON(`${API_BASE}/wallet/${address}`);
      if (!j?.items) j = await getJSON(`${API_BASE}/wallet?address=${address}`);
      return Array.isArray(j?.items)? j.items : [];
    } catch {}
  }
  try {
    const j: any = await getJSON(`${EXPLORER_URL}/api?module=account&action=tokenlist&address=${address}`);
    const arr = Array.isArray(j?.result) ? j.result : [];
    return arr.map((t:any)=>({ 
      address: (t.contractAddress || t.contract || "").toLowerCase(),
      name: t.name || "Token",
      symbol: t.symbol || "TKN",
      decimals: Number(t.decimals ?? 18),
      balance: String(t.balance ?? "0")
    })).filter((x:any)=>isAddr(x.address));
  } catch {}
  try {
    const j2:any = await getJSON(`${EXPLORER_URL}/api/v2/addresses/${address}/tokens?type=ERC-20&limit=200`);
    const arr2 = Array.isArray(j2?.items) ? j2.items : [];
    return arr2.map((it:any)=>{
      const t = it?.token || it;
      return {
        address: (t?.address || t?.contract_address || "").toLowerCase(),
        name: t?.name || "Token",
        symbol: t?.symbol || "TKN",
        decimals: Number(t?.decimals ?? 18),
        balance: String(it?.value ?? it?.balance ?? "0")
      };
    }).filter((x:any)=>isAddr(x.address));
  } catch { return []; }
}
