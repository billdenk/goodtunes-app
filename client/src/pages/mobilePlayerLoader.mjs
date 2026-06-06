// Test-only ESM loader hook for the mobile-player drag-to-seek test.
//
// Does everything assetStubLoader does (stub static asset imports so the
// real Player can load under tsx without Vite, and rewrite the Vite-only
// `import.meta.env` to a global), PLUS it redirects `@/lib/platform` to a
// tiny synthetic module whose `isIOS` is a mutable live binding.
//
// Why the redirect: the real `isIOS` is computed once at module-eval time
// from `navigator.userAgent`, so it's frozen for the life of the process.
// The volume slider is gated behind `!isIOS`, and we need to assert the
// gate in BOTH states from a single (cached) Player import. Exporting
// `isIOS` as a reassignable `let` plus a `__setTestIsIOS` setter gives the
// test a live binding it can flip between renders. Every other platform
// export is hard-coded to its web/jsdom default (matches the real values
// under jsdom: not native, not iOS) so the rest of the graph is unaffected.
const ASSET_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|mp3|wav|mp4|webm)$/i;

const PLATFORM_STUB_SOURCE = `
let isIOS = false;
let isWebIOS = false;
export { isIOS, isWebIOS };
// In jsdom tests isNative is always false, so the real isWebIOS (= isIOS &&
// !isNative) collapses to isIOS. Flip both together off the one setter so a
// test toggling iOS exercises BOTH the isIOS-gated and the isWebIOS-gated
// player controls (the volume block is gated on !isWebIOS).
export function __setTestIsIOS(v) { isIOS = v; isWebIOS = v; }
export const isNative = false;
export const isNativeIOS = false;
export const nativePlatform = "web";
export const chatEnabled = true;
export const nativeDownloadsEnabled = false;
export const buyEnabled = true;
export const ordersEnabled = true;
export const streamingHandoffEnabled = false;
export const notificationsEnabled = false;
export const aboutEnabled = false;
export const linkedAccountsEnabled = false;
export const setPasswordEnabled = false;
`;

function isPlatformSpecifier(specifier) {
  const bare = specifier.split("?")[0];
  return (
    bare === "@/lib/platform" ||
    bare.endsWith("/lib/platform") ||
    bare.endsWith("/lib/platform.ts")
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (isPlatformSpecifier(specifier)) {
    return {
      url: "stub:platform",
      format: "platform-stub",
      shortCircuit: true,
    };
  }
  if (ASSET_RE.test(specifier.split("?")[0])) {
    const base = context.parentURL ?? "file:///";
    let url;
    try {
      url = new URL(specifier, base).href;
    } catch {
      url = "file:///" + specifier;
    }
    return { url, format: "asset-stub", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (context.format === "platform-stub" || url === "stub:platform") {
    return {
      format: "module",
      source: PLATFORM_STUB_SOURCE,
      shortCircuit: true,
    };
  }
  if (context.format === "asset-stub") {
    return {
      format: "module",
      source: 'export default "";',
      shortCircuit: true,
    };
  }
  const result = await nextLoad(url, context);
  if (
    result?.source != null &&
    (result.format === "module" || result.format === "commonjs")
  ) {
    const src =
      typeof result.source === "string"
        ? result.source
        : Buffer.from(result.source).toString("utf8");
    if (src.includes("import.meta.env")) {
      return {
        ...result,
        source: src.split("import.meta.env").join("globalThis.__VITE_ENV__"),
      };
    }
  }
  return result;
}
