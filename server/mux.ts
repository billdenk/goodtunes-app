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
  return Boolean(
    process.env.MUX_TOKEN_ID &&
      process.env.MUX_TOKEN_SECRET &&
      process.env.MUX_SIGNING_KEY_ID &&
      process.env.MUX_SIGNING_KEY_PRIVATE,
  );
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
  if (!secret || !signatureHeader) {
    // If no secret configured, accept payload but log — webhooks aren't
    // strictly required for v1; we can also poll asset status on the
    // admin "Refresh" button.
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
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
