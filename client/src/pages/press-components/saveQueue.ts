// Serialized, coalescing save queue for whole-config component PUTs.
//
// The pricing (and sibling) component saves send the ENTIRE config blob on
// every blur, and the server atomically replaces it. Two rapid edits used to
// race: if the first PUT completed AFTER the second, the older payload
// overwrote the newer one and silently dropped a price. This queue makes an
// out-of-order overwrite impossible client-side: at most one request is in
// flight, and while one is, only the LATEST queued config is kept (each local
// config already contains every prior edit, so intermediate payloads are
// redundant).
export function createSerialSaver<T>(send: (config: T) => Promise<unknown>): (config: T) => void {
  let inFlight = false;
  let queued: { config: T } | null = null;

  const pump = (config: T) => {
    inFlight = true;
    send(config)
      // A failed save must not wedge the queue — the next edit retries with
      // the full (newer) config anyway.
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        if (queued) {
          const next = queued.config;
          queued = null;
          pump(next);
        }
      });
  };

  return (config: T) => {
    if (inFlight) queued = { config };
    else pump(config);
  };
}
