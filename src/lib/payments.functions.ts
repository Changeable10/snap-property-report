import { createServerFn } from "@tanstack/react-start";
import { getPaddleClient, type PaddleEnv } from "@/lib/paddle.server";

// Paddle's List Prices API has no external_id/import_meta filter, so this
// walks the (small) active price catalog and matches on import_meta.external_id
// client-side — see the investigation this was built from.
export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const paddle = getPaddleClient(data.environment);
    for await (const price of paddle.prices.list({ status: ["active"] })) {
      if (price.importMeta?.externalId === data.priceId) return price.id;
    }
    throw new Error("Price not found");
  });
