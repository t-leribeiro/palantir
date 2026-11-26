import { loadConfig } from "file:///C:/projects/soultech/palantir/src/platform/config.ts";
import { createPool } from "file:///C:/projects/soultech/palantir/src/platform/db/index.ts";
import { buildObjectStore } from "file:///C:/projects/soultech/palantir/src/main/media.ts";
const config = loadConfig({ ...process.env, PALANTIR_ROLE: "worker" });
const pool = createPool(config.databaseUrl);
for (const id of process.argv.slice(2)) {
  const { rows } = await pool.query("select storage_key, mime_type, duration_s from attachments where id = $1", [id]);
  const a = rows[0];
  console.log(id.slice(0, 8), "duration_s:", typeof a.duration_s, a.duration_s);
  const timeout = Math.max(120_000, (a.duration_s ?? 0) * 3 * 1000);
  console.log("  timeout:", timeout);
  try { AbortSignal.timeout(timeout); console.log("  AbortSignal.timeout ok"); } catch (e: any) { console.log("  AbortSignal.timeout lança:", e.name, e.code, e.message); }
  const bytes = await buildObjectStore(config.media).get(a.storage_key);
  try { const f = new FormData(); f.set("file", new Blob([bytes], { type: a.mime_type }), "audio.ogg"); console.log("  form ok"); } catch (e: any) { console.log("  form lança:", e.name, e.message); }
}
await pool.end();
