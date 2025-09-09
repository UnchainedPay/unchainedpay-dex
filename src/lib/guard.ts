import { BrowserProvider, Contract, parseUnits } from 'ethers';

const GUARD_ADDR = process.env.NEXT_PUBLIC_GUARD_ADDR as `0x${string}`;
const GUARD_ABI = [
  'function swapViaGuard(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,address recipient,bool convertNow) external returns (uint256)'
];
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) external returns (bool)'
];

export async function swapViaGuard(opts: {
  provider: BrowserProvider;
  fromAddr: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountHuman: string;
  minOutHuman?: string;
  convertNow?: boolean;
}) {
  const signer = await opts.provider.getSigner();
  const me = await signer.getAddress();

  const ercIn = new Contract(opts.tokenIn, ERC20_ABI, signer);
  const dIn: number = await ercIn.decimals();
  const amountIn = parseUnits(opts.amountHuman, dIn);

  const allowance = await ercIn.allowance(me, GUARD_ADDR);
  if (allowance < amountIn) {
    const txA = await ercIn.approve(GUARD_ADDR, amountIn);
    await txA.wait();
  }

  let minOut = 0n;
  if (opts.minOutHuman) {
    const ercOut = new Contract(opts.tokenOut, ERC20_ABI, signer);
    const dOut: number = await ercOut.decimals();
    minOut = parseUnits(opts.minOutHuman, dOut);
  }

  const guard = new Contract(GUARD_ADDR, GUARD_ABI, signer);
  const tx = await guard.swapViaGuard(opts.tokenIn, opts.tokenOut, amountIn, minOut, opts.fromAddr, !!opts.convertNow);
  const receipt = await tx.wait();
  return receipt;
}