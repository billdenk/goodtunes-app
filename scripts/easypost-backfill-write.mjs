// One-time write of EasyPost-derived shipping data onto historical prod orders.
// Single set-based UPDATE via json_to_recordset (one round trip).
// Non-destructive: only fills NULL tracking; only fills empty name/phone/address;
// merges a reversible source marker into fulfillment_raw. Reads /tmp/ep_assign.json.
import fs from "node:fs";
import pg from "pg";

const url = process.env.PROD_DATABASE_URL;
if (!url) { console.error("NO PROD_DATABASE_URL"); process.exit(1); }
const assigns = JSON.parse(fs.readFileSync("/tmp/ep_assign.json", "utf8"));
console.log("assignments to apply:", assigns.length);

const pool = new pg.Pool({ connectionString: url, max: 2 });

const UPDATE = `
WITH data AS (
  SELECT * FROM json_to_recordset($1::json) AS x(
    order_id text, tracking_number text, carrier text, tracking_url text,
    fulfillment_status text, shipped_at timestamp, delivered_at timestamp,
    buyer_name text, buyer_phone text, shipping_address jsonb, fulfillment_raw jsonb)
)
UPDATE orders o SET
  tracking_number    = d.tracking_number,
  carrier            = d.carrier,
  tracking_url       = d.tracking_url,
  fulfillment_status = d.fulfillment_status,
  shipped_at         = d.shipped_at,
  delivered_at       = COALESCE(d.delivered_at, o.delivered_at),
  buyer_name         = COALESCE(NULLIF(o.buyer_name, ''), d.buyer_name),
  buyer_phone        = COALESCE(NULLIF(o.buyer_phone, ''), d.buyer_phone),
  shipping_address   = COALESCE(o.shipping_address, d.shipping_address),
  fulfillment_raw    = COALESCE(o.fulfillment_raw, '{}'::jsonb) || d.fulfillment_raw
FROM data d
WHERE o.id = d.order_id AND o.tracking_number IS NULL`;

const res = await pool.query(UPDATE, [JSON.stringify(assigns)]);
console.log("rows updated:", res.rowCount);

const v = await pool.query(`
  SELECT
    count(*) FILTER (WHERE tracking_number IS NOT NULL) AS with_tracking,
    count(*) FILTER (WHERE fulfillment_status = 'delivered') AS delivered,
    count(*) FILTER (WHERE fulfillment_status = 'shipped') AS shipped,
    count(*) FILTER (WHERE fulfillment_status = 'returned') AS returned,
    count(*) FILTER (WHERE shipping_address IS NOT NULL) AS with_address,
    count(*) FILTER (WHERE buyer_name IS NOT NULL AND buyer_name <> '') AS with_name,
    count(*) FILTER (WHERE fulfillment_raw->>'source' = 'easypost_backfill_2026-06') AS marked,
    count(*) AS total
  FROM orders`);
console.log("VERIFY:", v.rows[0]);
await pool.end();
console.log("DONE");
