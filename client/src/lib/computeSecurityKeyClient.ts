import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { hexToBytes } from "../../../shared/seedKeyAlgorithms";

let vanilla: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null;

function getVanillaClient(): ReturnType<typeof createTRPCProxyClient<AppRouter>> {
  if (!vanilla) {
    vanilla = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          fetch(input, init) {
            return globalThis.fetch(input, {
              ...(init ?? {}),
              credentials: "include",
            });
          },
        }),
      ],
    });
  }
  return vanilla;
}

/** Calls `flash.computeSecurityKey` — key material stays on the server. */
export async function computeSecurityKeyRemote(ecuType: string, seed: Uint8Array): Promise<Uint8Array | null> {
  const seedHex = Array.from(seed)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const r = await getVanillaClient().flash.computeSecurityKey.mutate({ ecuType, seedHex });
  if (r.ok && "keyHex" in r && r.keyHex) {
    return hexToBytes(r.keyHex);
  }
  return null;
}
