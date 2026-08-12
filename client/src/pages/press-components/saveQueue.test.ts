// Task #3047 — serialized save queue: two rapid whole-config saves must
// never let a slow OLDER request land after (and overwrite) a NEWER one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSerialSaver } from "./saveQueue";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setImmediate(r));

test("second save waits for the first — reversed completion order is impossible", async () => {
  const sent: string[] = [];
  const gates: ReturnType<typeof deferred>[] = [];
  const save = createSerialSaver<string>((config) => {
    sent.push(config);
    const d = deferred();
    gates.push(d);
    return d.promise;
  });

  save("A");
  save("B"); // fired while A is in flight — must queue, not race
  await tick();
  assert.deepEqual(sent, ["A"]); // B is NOT on the wire yet
  gates[0].resolve(); // A completes (slowly) — B only ships now
  await tick();
  assert.deepEqual(sent, ["A", "B"]); // server's last write is the newest config
  gates[1].resolve();
});

test("intermediate configs coalesce — only the latest queued config ships", async () => {
  const sent: string[] = [];
  const gates: ReturnType<typeof deferred>[] = [];
  const save = createSerialSaver<string>((config) => {
    sent.push(config);
    const d = deferred();
    gates.push(d);
    return d.promise;
  });

  save("v1");
  save("v2");
  save("v3"); // v2 is stale — v3 contains every prior edit
  gates[0].resolve();
  await tick();
  assert.deepEqual(sent, ["v1", "v3"]);
  gates[1].resolve();
});

test("a failed save does not wedge the queue", async () => {
  const sent: string[] = [];
  const gates: ReturnType<typeof deferred>[] = [];
  const save = createSerialSaver<string>((config) => {
    sent.push(config);
    const d = deferred();
    gates.push(d);
    return d.promise;
  });

  save("A");
  save("B");
  gates[0].reject(new Error("network"));
  await tick();
  assert.deepEqual(sent, ["A", "B"]); // B still ships after A fails
  gates[1].resolve();
});
