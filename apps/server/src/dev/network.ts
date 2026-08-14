import { networkInterfaces } from "node:os";

export function getLanAddresses(): string[] {
  const addresses = new Set<string>();

  for (const interfaces of Object.values(networkInterfaces())) {
    if (!interfaces) {
      continue;
    }

    for (const iface of interfaces) {
      if (iface.family !== "IPv4" || iface.internal) {
        continue;
      }

      addresses.add(iface.address);
    }
  }

  return [...addresses];
}

export function logDevelopmentEndpoints(port: number | string): void {
  const lanAddresses = getLanAddresses();

  console.log(`Server listening on port ${port}`);

  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log("");
  console.log("Development endpoints:");

  for (const address of lanAddresses) {
    console.log(`  http://${address}:${port}/health`);
  }

  console.log(`  ws://${lanAddresses[0] ?? "localhost"}:${port}/ws`);
  console.log("");
  console.log(
    "Mobile app API host should match Metro (e.g. http://192.168.x.x:3000).",
  );

  if (!process.env.DEV_AUTH_TOKENS?.trim()) {
    console.log("");
    console.warn(
      "DEV_AUTH_TOKENS is not set. Run `pnpm --filter server db:seed` and add the printed value to apps/server/.env",
    );
  }
}
