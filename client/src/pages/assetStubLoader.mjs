// Test-only ESM loader hook: stub static asset imports (.svg/.png/.jpg/…)
// so component/page tests can import real source files under `tsx` without
// Vite. Vite resolves these to URL strings at build time; under Node they
// throw ERR_UNKNOWN_FILE_EXTENSION. We short-circuit them to an empty
// string default export, which is all the components need at runtime.
const ASSET_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|mp3|wav|mp4|webm)$/i;

export async function resolve(specifier, context, nextResolve) {
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
  if (context.format === "asset-stub") {
    return {
      format: "module",
      source: 'export default "";',
      shortCircuit: true,
    };
  }
  const result = await nextLoad(url, context);
  // Vite replaces `import.meta.env` at build time; under Node it's
  // undefined and crashes any module that reads `import.meta.env.DEV` etc.
  // Rewrite it to a global the test seeds (leaves `import.meta.url` alone).
  if (result?.source != null && (result.format === "module" || result.format === "commonjs")) {
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
