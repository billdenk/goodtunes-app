import { useEffect, useState } from "react";

// Polls our authenticated redemption-status endpoint until the code for
// this order is ready. This is the extension's ONLY data channel:
// neither the thank-you nor the order-status surface delivers ORDER
// metafields to extensions (AppMetafieldEntryTarget has no 'order'
// owner type), so the $app-namespace metafield the server writes is a
// durable record we can't read from here.
//
// Auth model: the Shopify session token proves shop + app context; the
// order's confirmation number (which Shopify shows only to the buyer)
// proves ownership of this specific order. The server releases the code
// only when both check out.

const ENDPOINT = "https://admin.goodtunes.music/api/shopify/redemption-status";
const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 40; // ~2 minutes

export interface Redemption {
  code: string;
  url: string;
}

interface SessionTokenApi {
  get(): Promise<string | null | undefined>;
}

export function useRedemptionPoll(
  orderGid: string | undefined,
  confirmationNumber: string | null | undefined,
  sessionToken: SessionTokenApi,
): Redemption | null {
  const [redemption, setRedemption] = useState<Redemption | null>(null);

  useEffect(() => {
    if (!orderGid || !confirmationNumber) return;
    const numericId = orderGid.split("/").pop() ?? "";
    if (!numericId) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const token = await sessionToken.get();
        if (token) {
          const res = await fetch(
            `${ENDPOINT}?orderId=${encodeURIComponent(numericId)}&confirmation=${encodeURIComponent(confirmationNumber)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const data = (await res.json()) as {
              ready?: boolean;
              code?: string;
              url?: string;
            };
            if (data.ready && data.code && data.url) {
              if (!cancelled) setRedemption({ code: data.code, url: data.url });
              return; // done — stop polling
            }
          } else if (res.status === 403 || res.status === 404) {
            return; // never going to succeed for this caller — stop
          }
        }
      } catch {
        // transient network error — fall through to retry
      }
      if (!cancelled && attempts < MAX_ATTEMPTS) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderGid, confirmationNumber, sessionToken]);

  return redemption;
}
