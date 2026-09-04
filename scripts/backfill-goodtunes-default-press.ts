import { backfillEligibleGoodTunesArtists } from "../server/goodTunesDefaultPress";
import { pool } from "../server/db";

async function main() {
  const updated = await backfillEligibleGoodTunesArtists();
  console.log(`GoodTunes artist default-press backfill updated ${updated} row(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });