/**
 * One-off manual trigger for the company-wide Zoom sync (normally runs on BullMQ's daily
 * schedule via jobs/worker.ts). Useful for testing without waiting for 03:00 UTC.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env.prodtest scripts/run-company-sync-once.ts
 */
import { syncCompanyZoomAccount } from "../src/modules/zoom/companySync.js";

const result = await syncCompanyZoomAccount();
console.log(result);
process.exit(0);
