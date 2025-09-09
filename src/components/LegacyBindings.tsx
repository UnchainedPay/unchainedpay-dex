"use client";
import { useEffect, useRef } from "react";
import { BrowserProvider, Contract, parseUnits } from "ethers";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";
const GECKO_NET = "pepe-unchained";
const CHAIN_ID_DEC = Number(process.env.NEXT_PUBLIC_CHAIN_ID_DEC || 97741);
const CHAIN_ID_HEX = "0x" + CHAIN_ID_DEC.toString(16);
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://rpc-pepu-v2-mainnet-0.t.conduit.xyz";
const EXPLORER_WEB =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz";
const GUARD_ADDR = (process.env.NEXT_PUBLIC_GUARD_ADDR ||
  "0x53859FAe789c92dceB8c9aF61b13e458C4313fe7") as `0x${string}`;

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const GUARD_ABI = [
  "function swapViaGuard(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,address recipient,bool convertNow) external returns (uint256)",
];

function isAddr(a?: string) {
  return /^0x[0-9a-fA-F]{40}$/.test((a || "").trim());
}
const fmtUSD = (n: any) =>
  n == null || isNaN(Number(n))
    ? "—"
    : "$ " + Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
const fmtNum = (n: any, d = 6) =>
  n == null || isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

async function waitForDom(selector: string, timeoutMs = 15000): Promise<Element> {
  const found = document.querySelector(selector);
  if (found) return found;
  return new Promise((resolve, reject) => {
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeoutMs);
  });
}

export default function LegacyBindings() {
  // Garde-fou React 18 StrictMode (évite double init en dev)
  const did = useRef(false);

  useEffect(() => {
    if (did.current) return;
    did.current = true;

    let cleanup = () => {};

    (async () => {
      try {
        await waitForDom("#btnMM");
      } catch {}

      const $ = (id: string) => document.getElementById(id) as HTMLElement | null;
      const fromSel = () => $("fromSelect") as HTMLSelectElement | null;
      const toSel = () => $("toSelect") as HTMLSelectElement | null;
      const amountI = () => $("amount") as HTMLInputElement | null;
      const slipSel = () => $("slippageSelect") as HTMLSelectElement | null;
      const btnMM = () => $("btnMM") as HTMLButtonElement | null;
      const btnSwap = () => $("btnSwap") as HTMLButtonElement | null;
      const btnSwitch = () => $("btnSwitch") as HTMLButtonElement | null;
      const btnLoad = () =>
        $("btnLoadTokens") as HTMLButtonElement | null;

      const setStatus = (msg: string) => {
        const host = document.getElementById("swapStatus") || $("slipInfo");
        if (host) host.textContent = msg;
      };

      const setDataBadge = (txt?: string) => {
        const badge =
          document.getElementById("dataBadge") ||
          document.getElementById("agoLabel");
        if (badge) {
          if (!txt)
            badge.textContent =
              badge.textContent?.replace(/ \| Data delayed.*$/, "") || "";
          else badge.textContent = (badge.textContent ? badge.textContent + " | " : "") + txt;
        }
      };

      const state: any = {
        meta: {} as Record<string, { address: string; name?: string; symbol?: string }>,
        market: {} as Record<string, { price: number | null; mc: number | null; vol: number | null; chg: string }>,
        supply: {} as Record<string, { supplyTotal: number | null; supplyCirc: number | null; holders: number | null }>,
        pools: {} as Record<string, Array<{ liq: number | null }>>,
        balances: {} as Record<string, bigint>,
        allowances: {} as Record<string, bigint>,
        from: null as string | null,
        to: null as string | null,
        address: "" as `0x${string}` | "",
        estOut: 0,
        isSwapping: false,
      };

      // ===== Tabs
      const tabs = Array.from(
        document.querySelectorAll(".tabs .tab")
      ) as HTMLElement[];
      const showTab = (id: string) => {
        ["swap", "wallet", "bridge", "fast", "cfg"].forEach((x) => {
          const el = document.getElementById(x);
          if (el) el.style.display = x === id ? "block" : "none";
        });
        tabs.forEach((t) =>
          t.classList.toggle("active", t.getAttribute("data-tab") === id)
        );
      };
      tabs.forEach((t) => {
        const id = t.getAttribute("data-tab") || "swap";
        t.addEventListener("click", () => showTab(id));
      });
      showTab("swap");

      // ===== Tokens via /api/tokens
      async function fetchTokensList(): Promise<
        Array<{ address: string; symbol?: string; name?: string }>
      > {
        const r = await fetch("/api/tokens", {
          headers: { accept: "application/json" },
        });
        if (!r.ok) throw new Error(`GET /api/tokens -> HTTP ${r.status}`);
        const j = await r.json();
        const items = Array.isArray(j?.items) ? j.items : [];
        if (!items.length) throw new Error("Aucun token depuis /api/tokens");
        return items;
      }

      function setChart(which: "from" | "to", addr: string) {
        const frameId = which === "from" ? "fromFrame" : "toFrame";
        const iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
        if (iframe)
          iframe.src = `https://www.geckoterminal.com/${GECKO_NET}/tokens/${addr}?embed=1&theme=dark&info=0&swaps=0&interval=1h`;
      }

      // ===== Market (prix/MC/vol/Δ) via /api/market
      async function loadMarket(
        addr: string
      ): Promise<{
        price: number | null;
        mc: number | null;
        vol: number | null;
        chg: string;
        degraded?: boolean;
      }> {
        try {
          const r = await fetch(`/api/market/${addr}`, {
            headers: { accept: "application/json" },
          });
          if (!r.ok) throw new Error("market http");
          const j = await r.json();
          const degraded = !(j && (j.price != null || j.mc != null));
          return {
            price: j.price ?? null,
            mc: j.mc ?? null,
            vol: j.vol ?? null,
            chg: j.change ?? "—",
            degraded,
          };
        } catch {
          return { price: null, mc: null, vol: null, chg: "—", degraded: true };
        }
      }

      // ===== Extras: supply/holders + pools
      async function fetchExtras(addr: string) {
        try {
          const [tRes, pRes] = await Promise.all([
            fetch(`/api/token/${addr}`, { headers: { accept: "application/json" } }),
            fetch(`/api/pools/${addr}`, { headers: { accept: "application/json" } }),
          ]);
          if (tRes.ok) {
            const t = await tRes.json();
            state.supply[addr] = {
              supplyTotal: t?.supplyTotal ?? null,
              supplyCirc: t?.supplyCirc ?? null,
              holders: t?.holders ?? null,
            };
          } else {
            state.supply[addr] = {
              supplyTotal: null,
              supplyCirc: null,
              holders: null,
            };
          }
          if (pRes.ok) {
            const p = await pRes.json();
            state.pools[addr] = Array.isArray(p?.pools) ? p.pools : [];
          } else {
            state.pools[addr] = [];
          }
        } catch {
          state.supply[addr] = { supplyTotal: null, supplyCirc: null, holders: null };
          state.pools[addr] = [];
        }
      }

      function applyExtras(which: "from" | "to", addr: string) {
        const sup = state.supply[addr] || {};
        const circ = sup.supplyCirc != null ? fmtNum(sup.supplyCirc, 2) : "—";
        const total = sup.supplyTotal != null ? fmtNum(sup.supplyTotal, 2) : "—";
        const holders =
          sup.holders != null ? Number(sup.holders).toLocaleString() : "—";
        const pools = state.pools[addr] || [];
        const topLiq = pools[0]?.liq != null ? fmtUSD(pools[0].liq) : "—";

        if (which === "from") {
          (document.getElementById("fromSupply")!).textContent = `${circ} / ${total}`;
          (document.getElementById("fromHolders")!).textContent = holders;
          (document.getElementById("fromLiq")!).textContent = topLiq;
        } else {
          (document.getElementById("toSupply")!).textContent = `${circ} / ${total}`;
          (document.getElementById("toHolders")!).textContent = holders;
          (document.getElementById("toLiq")!).textContent = topLiq;
        }
      }

      async function onSelect(which: "from" | "to", addr: string) {
        if (!isAddr(addr)) return;

        const ids =
          which === "from"
            ? { price: "fromPrice", mc: "fromMC", vol: "fromVol", chg: "fromChange" }
            : { price: "toPrice", mc: "toMC", vol: "toVol", chg: "toChange" };
        (document.getElementById(ids.price)!).textContent = "…";
        (document.getElementById(ids.mc)!).textContent = "…";
        (document.getElementById(ids.vol)!).textContent = "…";
        (document.getElementById(ids.chg)!).textContent = "…";

        const mk = await loadMarket(addr);
        state.market[addr] = mk;

        (document.getElementById(ids.price)!).textContent = fmtUSD(mk.price);
        (document.getElementById(ids.mc)!).textContent = fmtUSD(mk.mc);
        (document.getElementById(ids.vol)!).textContent = fmtUSD(mk.vol);
        (document.getElementById(ids.chg)!).textContent = mk.chg;

        setDataBadge(mk.degraded ? "Data delayed" : undefined);

        await fetchExtras(addr);
        applyExtras(which, addr);

        setChart(which, addr);
        if (which === "from") state.from = addr;
        else state.to = addr;

        computeQuote();
        if (state.address) {
          try {
            await refreshBalanceAndAllowance();
          } catch {}
        }
      }

      function computeQuote() {
        const amt = Number(amountI()?.value || "0");
        const from = state.from,
          to = state.to;
        const payTag = document.getElementById("payTag")!;
        const getTag = document.getElementById("getTag")!;
        const slipInfo = document.getElementById("slipInfo")!;
        const b = btnSwap();

        if (!amt || !from || !to) {
          if (b) {
            b.disabled = true;
            b.textContent = "Swap";
          }
          payTag.textContent = "Swap";
          getTag.textContent = "—";
          slipInfo.textContent = "";
          return;
        }
        const pFrom = state.market[from]?.price || 0;
        const pTo = state.market[to]?.price || 0;
        if (!pFrom || !pTo) {
          if (b) {
            b.disabled = true;
            b.textContent = "Swap";
          }
          return;
        }
        const usd = amt * pFrom;
        const out = usd / pTo;
        state.estOut = out;

        const sFrom = state.meta[from]?.symbol || "";
        const sTo = state.meta[to]?.symbol || "";
        payTag.textContent = `${fmtNum(amt)} ${sFrom}`;
        getTag.textContent = `${fmtNum(out)} ${sTo}`;

        // --- Tolerance affichée = slippage utilisateur + 0.2% de frais ---
        const slip = slipSel()?.value || "3";
        const feePct = 0.2;
        const sNum = Number(slip) || 0;
        const effTol = sNum + feePct;
        const factor = Math.max(0, 1 - effTol / 100);
        const minOutPreview = out * factor;

        const feeInfo = " | Fee: 0.2% per swap (0.1% to UPAY LP, 0.1% UPAY burn)";
        if (slip === "nolimit") {
          slipInfo.textContent = "Tolerance: unlimited" + feeInfo;
        } else {
          slipInfo.textContent =
            `Tolerance: ${sNum}% (+0.2% fee → effective ${effTol.toFixed(2)}%)` +
            ` (~ minOut ≈ ${fmtNum(minOutPreview)} ${sTo})` +
            feeInfo;
        }

        if (b) b.disabled = false;
      }

      // ===== MetaMask
      let isConnectingMM = false;
      async function connectMM() {
        if (isConnectingMM) {
          alert("Already processing eth_requestAccounts. Please wait.");
          throw new Error("busy");
        }
        const mm =
          (window as any).ethereum?.providers?.find((p: any) => p.isMetaMask) ||
          ((window as any).ethereum?.isMetaMask ? (window as any).ethereum : null);
        if (!mm) {
          alert("MetaMask introuvable");
          throw new Error("No MetaMask");
        }
        try {
          isConnectingMM = true;
          if (btnMM()) btnMM()!.disabled = true;
          setStatus("Connecting…");
          await mm.request({ method: "eth_requestAccounts" });
          const provider = new BrowserProvider(mm);
          const signer = await provider.getSigner();
          const me = await signer.getAddress();
          state.address = me as `0x${string}`;
          const addrEl = document.getElementById("walletAddr");
          if (addrEl) addrEl.textContent = me;
          const b = btnMM();
          if (b) {
            b.textContent = "🔌 Disconnect";
            b.disabled = false;
          }
          setStatus("Connected ✔");
          return { provider, signer, mm };
        } finally {
          isConnectingMM = false;
          if (btnMM()) btnMM()!.disabled = false;
        }
      }

      async function ensurePepuV2(mm: any) {
        try {
          await mm.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_ID_HEX }],
          });
        } catch (err: any) {
          if (err?.code === 4902) {
            await mm.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: CHAIN_ID_HEX,
                  chainName: "Pepe Unchained V2",
                  rpcUrls: [RPC_URL],
                  nativeCurrency: { name: "PEPU", symbol: "PEPU", decimals: 18 },
                  blockExplorerUrls: [EXPLORER_WEB],
                },
              ],
            });
          } else {
            throw err;
          }
        }
      }

      // ===== Solde & Allowance (bloque le swap si insuffisant)
      async function refreshBalanceAndAllowance() {
        try {
          if (!state.address || !state.from) return;
          const mm =
            (window as any).ethereum?.providers?.find((p: any) => p.isMetaMask) ||
            ((window as any).ethereum?.isMetaMask ? (window as any).ethereum : null);
          if (!mm) return;
          const provider = new BrowserProvider(mm);
          const signer = await provider.getSigner();
          const tokenIn = state.from as `0x${string}`;
          const erc = new Contract(tokenIn, ERC20_ABI, signer);
          const dIn: number = await erc.decimals();

          const amountStr = amountI()?.value?.trim() || "0";
          const need = parseUnits(amountStr || "0", dIn);
          state._neededAmountIn = need;

          const [bal, alw] = await Promise.all([
            erc.balanceOf(state.address as `0x${string}`) as Promise<bigint>,
            erc.allowance(state.address as `0x${string}`, GUARD_ADDR) as Promise<bigint>,
          ]);
          state.balances[tokenIn] = bal;
          state.allowances[tokenIn] = alw;

          const b = btnSwap();
          if (b) {
            if (bal < need) {
              b.disabled = true;
              b.textContent = "Insufficient balance";
            } else if (alw < need) {
              b.disabled = true;
              b.textContent = "Needs approval";
            } else {
              b.disabled = false;
              b.textContent = "Swap";
            }
          }
        } catch {
          /* ignore */
        }
      }

      async function doSwap() {
        // verrou global (ceinture & bretelles)
        // @ts-ignore
        if ((window as any).__UP_SWAP_LOCK) return;
        // @ts-ignore
        (window as any).__UP_SWAP_LOCK = true;

        try {
          if (state.isSwapping) return;
          state.isSwapping = true;
          const b = btnSwap();
          if (b) {
            b.disabled = true;
            b.textContent = "Preparing…";
          }
          setStatus("Connecting…");
          const { signer, mm } = await connectMM();
          setStatus("Switching network…");
          await ensurePepuV2(mm);

          const tokenIn = fromSel()?.value?.trim() as `0x${string}`;
          const tokenOut = toSel()?.value?.trim() as `0x${string}`;
          const amount = amountI()?.value?.trim() || "";
          if (!isAddr(tokenIn) || !isAddr(tokenOut))
            throw new Error("Token adress invalide");
          if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
            throw new Error("Montant invalide");

          setStatus("Checking balance & allowance…");
          const ercIn = new Contract(tokenIn, ERC20_ABI, signer);
          const dIn: number = await ercIn.decimals();
          const amountIn = parseUnits(amount, dIn);

          const [balance, allowance]: [bigint, bigint] = await Promise.all([
            ercIn.balanceOf(state.address as `0x${string}`),
            ercIn.allowance(state.address as `0x${string}`, GUARD_ADDR),
          ]);

          if (balance < amountIn) {
            throw new Error("Insufficient balance.");
          }

          if (allowance < amountIn) {
            setStatus("Approving…");
            if (b) b.textContent = "Approving…";
            try {
              const tx0 = await ercIn.approve(GUARD_ADDR, 0n);
              await tx0.wait();
            } catch {}
            const MAX = (1n << 256n) - 1n;
            const txA = await ercIn.approve(GUARD_ADDR, MAX);
            setStatus(`Approving… (tx: ${txA.hash.slice(0, 10)}…)`);
            await txA.wait();
            setStatus("Approved ✔");
          }

          // minOut (slippage + 0.2% fee)
          let minOut = 0n;
          const slip = slipSel()?.value || "3";
          if (slip !== "nolimit") {
            const ercOut = new Contract(tokenOut, ERC20_ABI, signer);
            const dOut: number = await ercOut.decimals();
            const estOut = Number(state.estOut || 0);
            const feePct = 0.2;
            const sNum = Number(slip) || 0;
            const effTol = sNum + feePct;
            const factor = Math.max(0, 1 - effTol / 100);
            const minOutHuman = estOut * factor;
            if (isFinite(minOutHuman) && minOutHuman > 0)
              minOut = parseUnits(String(minOutHuman), dOut);
          }

          // Envoi direct (sans estimateGas)
          setStatus("Swapping…");
          if (b) b.textContent = "Swapping…";
          const guard = new Contract(GUARD_ADDR, GUARD_ABI, signer);
          const tx = await guard.swapViaGuard(
            tokenIn,
            tokenOut,
            amountIn,
            minOut,
            state.address as `0x${string}`,
            false
          );
          setStatus(`Swapping… (tx: ${tx.hash.slice(0, 10)}…)`);
          await tx.wait();
          setStatus(`Done ✔ — View tx: ${EXPLORER_WEB}/tx/${tx.hash}`);
          alert("✅ Swap executed\n" + `${EXPLORER_WEB}/tx/${tx.hash}`);
        } catch (e: any) {
          if (e?.message !== "busy")
            alert(⚠️ " + (e?.reason || e?.message || String(e)));
        } finally {
          state.isSwapping = false;
          const b = btnSwap();
          if (b) {
            b.disabled = false;
            b.textContent = "Swap";
          }
          computeQuote();
          if (state.address) {
            try {
              await refreshBalanceAndAllowance();
            } catch {}
          }
          // @ts-ignore
          (window as any).__UP_SWAP_LOCK = false;
        }
      }

      // ===== Wallet (inchangé hors statut)
      function formatUnitsSafe(
        balance: string | number | bigint,
        decimals: number
      ) {
        try {
          const bn = BigInt(balance);
          const d = Math.max(0, Number(decimals || 0));
          if (d === 0) return Number(bn);
          const s = bn.toString();
          if (s.length <= d) return Number(`0.${"0".repeat(d - s.length)}${s}`);
          return Number(`${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`);
        } catch {
          return 0;
        }
      }
      function renderWalletList(list: any[]) {
        const box = document.getElementById("walletTokens");
        if (!box) return;
        const status = document.getElementById("walletStatus");
        box.innerHTML = "";
        if (!list.length) {
          if (status) status.textContent = "No tokens found on this network.";
          return;
        }
        for (const t of list) {
          const human = formatUnitsSafe(t.balance ?? "0", t.decimals ?? 18);
          const el = document.createElement("div");
          el.className = "token-item";
          el.innerHTML = `<span>${t.name || t.symbol || t.address}${
            t.symbol ? ` (${t.symbol})` : ""
          }</span><span>${human.toLocaleString(undefined,{maximumFractionDigits:6})}</span>`;
          box.appendChild(el);
        }
        if (status) status.textContent = "✅ Tokens loaded";
      }
      async function loadWalletTokens() {
        try {
          if (!state.address) await connectMM();
          const status = document.getElementById("walletStatus");
          if (status) status.textContent = "Loading tokens…";
          const r = await fetch(`/api/wallet?address=${state.address}`, {
            headers: { accept: "application/json" },
          });
          const j = await r.json();
          renderWalletList(Array.isArray(j?.items) ? j.items : []);
        } catch (e: any) {
          const status = document.getElementById("walletStatus");
          if (status) status.textContent = "⚠️ " + (e?.message || String(e));
        }
      }
      async function switchToPepuV2() {
        try {
          const { mm } = await connectMM();
          await ensurePepuV2(mm);
          const s = document.getElementById("walletStatus");
          if (s) s.textContent = "✅ Pepe Unchained V2 selected.";
        } catch (e: any) {
          const s = document.getElementById("walletStatus");
          if (s) s.textContent = "⚠️ " + (e?.message || String(e));
        }
      }

      // ===== Attach listeners avec AbortController (et cleanup)
      const listeners = new AbortController();
      const sig = listeners.signal;

      btnMM()?.addEventListener(
        "click",
        async () => {
          try {
            if (state.address) {
              state.address = "" as any;
              const addrEl = document.getElementById("walletAddr");
              if (addrEl) addrEl.textContent = "—";
              const b = btnMM();
              if (b) b.textContent = "🦊 Connect MetaMask";
              setStatus("");
            } else {
              await connectMM();
              await refreshBalanceAndAllowance();
            }
          } catch (e: any) {
            if (e?.message !== "busy") alert(e?.message || String(e));
          }
        },
        { signal: sig }
      );
      btnSwap()?.addEventListener("click", doSwap, { signal: sig });
      btnSwitch()?.addEventListener("click", switchToPepuV2, { signal: sig });
      btnLoad()?.addEventListener("click", loadWalletTokens, { signal: sig });

      fromSel()?.addEventListener(
        "change",
        (e: any) => onSelect("from", e.target.value),
        { signal: sig }
      );
      toSel()?.addEventListener(
        "change",
        (e: any) => onSelect("to", e.target.value),
        { signal: sig }
      );
      amountI()?.addEventListener(
        "input",
        async () => {
          computeQuote();
          if (state.address) await refreshBalanceAndAllowance();
        },
        { signal: sig }
      );
      slipSel()?.addEventListener("change", computeQuote, { signal: sig });

      // ===== Boot
      try {
        const list = await fetchTokensList();
        if (fromSel() && toSel()) {
          const fill = (sel: HTMLSelectElement) => {
            sel.innerHTML = "";
            list.forEach((t) => {
              const o = document.createElement("option");
              o.value = t.address;
              o.textContent = `${t.name || t.symbol || t.address}${
                t.symbol ? ` (${t.symbol})` : ""
              }`;
              sel.appendChild(o);
              state.meta[t.address] = {
                address: t.address,
                name: t.name,
                symbol: t.symbol,
              };
            });
          };
          fill(fromSel()!);
          fill(toSel()!);
          if (list[0]) await onSelect("from", list[0].address);
          if (list[1]) await onSelect("to", list[1].address);
        }
      } catch (e) {
        console.error("Token list error:", e);
        setDataBadge("Data delayed");
      }

      cleanup = () => {
        // retire tous les listeners attachés avec { signal }
        listeners.abort();
      };
    })();

    return () => cleanup();
  }, []);

  return null;
}
