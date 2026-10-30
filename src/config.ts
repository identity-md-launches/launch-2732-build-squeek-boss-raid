import { createConfig, fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const SITE_NAME = "Squeek Boss Raid";
export const SITE_DESCRIPTION =
  "A community boss fight on Squeekchain (Sepolia). The real hamster's wheel drains the Boss; you add hits on-chain.";

/** Squeekchain public API. The brief names squeekchain.com; api.squeekchain.com serves the same routes. */
export const API_BASES = ["https://squeekchain.com/v1", "https://api.squeekchain.com/v1"] as const;

/** Squeekchain's SQK token on Sepolia (identities.token in /v1/economy/state). */
export const SQK_TOKEN = "0x1c0df748aa3814a13fb1294c7f1088ecc7b9973a" as const;

/** Public Sepolia RPCs. Tenderly serves wide eth_getLogs ranges; publicnode is the fallback. */
export const PUBLIC_RPCS = ["https://sepolia.gateway.tenderly.co", "https://ethereum-sepolia-rpc.publicnode.com"] as const;

/** First Sepolia block the raid reads attack events from (the game's launch block). */
export const RAID_START_BLOCK = 12027600n;

export const chain = sepolia;

export const config = createConfig({
  chains: [chain],
  // EIP-6963 discovery lists every installed extension under its own name
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [chain.id]: fallback(PUBLIC_RPCS.map((url) => http(url))) },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
