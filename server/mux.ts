import Mux from "@mux/mux-node";

let _client: Mux | null = null;

function client(): Mux {
  if (_client) return _client;
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error(
      "MUX_TOKEN_ID / MUX_TOKEN_SECRET not set — Mux integration disabled. " +
        "Add the secrets in Replit Secrets to enable.",
    );
  }
  _client = new Mux({ tokenId, tokenSecret });
  return _client;
}

export function isMuxConfigured(): boolean {
  return muxMissingSecrets().length === 0;
}

/**
 * Which of the four Mux secrets are missing? Used by the boot-time
 * warning + the `/api/admin/mux-status` admin banner so the operator
 * sees exactly which key to add rather than a generic "not configured".
 * MUX_WEBHOOK_SECRET is intentionally NOT required — the reconcile
 * sweep heals webhook drops, so a missing webhook secret degrades but
 * does not break the pipeline.
 */
export function muxMissingSecrets(): string[] {
  const required = [
    "MUX_TOKEN_ID",
    "MUX_TOKEN_SECRET",
    "MUX_SIGNING_KEY_ID",
    "MUX_SIGNING_KEY_PRIVATE",
  ] as const;
  return required.filter((k) => !process.env[k]);
}

/**
 * Pull a human-readable error string off a Mux asset, or null if the
 * asset has no errors recorded. Mux returns `{ type, messages }` on
 * a failed asset; we flatten to a single line so it fits in a status
 * badge and a log line.
 */
export function extractMuxAssetError(asset: any): string | null {
  const e = asset?.errors;
  if (!e) return null;
  const type = e.type ? String(e.type) : null;
  const messages = Array.isArray(e.messages) ? e.messages.filter(Boolean) : [];
  if (!type && messages.length === 0) return null;
  const msg = messages.join("; ");
  return [type, msg].filter(Boolean).join(" · ") || null;
}

/**
 * Create a new Mux asset by URL (public asset URL — e.g. our
 * /objects/uploads/<id>.wav, or a presigned GCS URL).
 * Returns the synchronous handle + initial playback id. The asset is
 * `preparing` until Mux's webhook fires `video.asset.ready`.
 */
export async function createAssetFromUrl(publicUrl: string): Promise<{
  assetId: string;
  playbackId: string | null;
  status: string;
}> {
  const asset = await client().video.assets.create({
    inputs: [{ url: publicUrl }],
    playback_policy: ["signed"],
    // Mux treats audio as a video asset with no video tracks; this
    // produces an HLS manifest that hls.js plays as audio.
    video_quality: "basic",
  } as any);
  const pb = asset.playback_ids?.find((p) => p.policy === "signed");
  return {
    assetId: asset.id,
    playbackId: pb?.id ?? null,
    status: asset.status, // "preparing" | "ready" | "errored"
  };
}

export async function getAsset(assetId: string) {
  return client().video.assets.retrieve(assetId);
}

/**
 * Mint a 1-hour signed playback URL (HLS .m3u8) for a Mux playback id.
 * Ownership/permission must be checked BEFORE calling this.
 */
export async function signPlaybackUrl(playbackId: string): Promise<string> {
  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const keySecret = process.env.MUX_SIGNING_KEY_PRIVATE;
  if (!keyId || !keySecret) {
    throw new Error("MUX_SIGNING_KEY_ID / MUX_SIGNING_KEY_PRIVATE not set");
  }
  const token = await (client() as any).jwt.signPlaybackId(playbackId, {
    keyId,
    keySecret,
    type: "video",
    expiration: "1h",
  });
  return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
}

/**
 * Verify a Mux webhook signature using `MUX_WEBHOOK_SECRET`.
 * Returns the parsed payload, or null if verification fails / not configured.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
): any | null {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if (!secret) {
    // No secret configured. In production we MUST refuse to mutate state
    // on unsigned payloads — anyone could POST a fake `video.asset.ready`
    // and corrupt our songs table. In dev we accept unsigned so local
    // tunnel/ngrok setups don't need the secret round-trip.
    if (isProd) {
      console.error(
        "[mux-webhook] MUX_WEBHOOK_SECRET not set in production — rejecting.",
      );
      return null;
    }
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }
  if (!signatureHeader) {
    // Secret is configured but request is unsigned — always reject.
    return null;
  }
  try {
    const verified = (Mux as any).Webhooks.verifyHeader(
      rawBody,
      signatureHeader,
      secret,
    );
    return verified ? JSON.parse(rawBody) : null;
  } catch {
    return null;
  }
}
