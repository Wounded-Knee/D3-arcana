import { networkInterfaces } from "node:os";

const VIRTUAL_IFACE = /^(docker|br-|veth|cni|flannel|virbr|lxc|tun|tap)/;

export interface LanInterfaceAddress {
  name: string;
  address: string;
}

export function listLanAddresses(): LanInterfaceAddress[] {
  const addresses: LanInterfaceAddress[] = [];

  for (const [name, interfaces] of Object.entries(networkInterfaces())) {
    if (!interfaces) {
      continue;
    }

    for (const iface of interfaces) {
      if (iface.family !== "IPv4" || iface.internal) {
        continue;
      }

      addresses.push({ name, address: iface.address });
    }
  }

  return addresses;
}

export function getLanAddresses(): string[] {
  return [...new Set(listLanAddresses().map((entry) => entry.address))];
}

export function pickPreferredLanAddress(
  interfaces: LanInterfaceAddress[],
): string | undefined {
  const physical = interfaces.filter((entry) => !VIRTUAL_IFACE.test(entry.name));
  const pool = physical.length > 0 ? physical : interfaces;

  return (
    pool.find((entry) => entry.address.startsWith("192.168."))?.address ??
    pool.find((entry) => entry.address.startsWith("10."))?.address ??
    pool[0]?.address
  );
}

export function getPreferredLanAddress(): string | undefined {
  return pickPreferredLanAddress(listLanAddresses());
}

export function logDevelopmentEndpoints(port: number | string): void {
  const lanAddresses = getLanAddresses();
  const preferred = getPreferredLanAddress();

  console.log(`Server listening on port ${port}`);

  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("");
  console.log("Development endpoints:");

  for (const address of lanAddresses) {
    const marker = address === preferred ? " (preferred LAN)" : "";
    console.log(`  http://${address}:${port}/health${marker}`);
  }

  console.log(`  ws://${preferred ?? lanAddresses[0] ?? "localhost"}:${port}/ws`);
  console.log("");
  console.log(
    "Mobile API/LiveKit hosts follow Metro (--lan). Do not bake LAN IPs into apps/mobile/.env.",
  );

  if (!process.env.DEV_AUTH_TOKENS?.trim()) {
    console.log("");
    console.warn(
      "DEV_AUTH_TOKENS is not set. Run `pnpm --filter server db:seed` and add the printed value to apps/server/.env",
    );
  }
}
