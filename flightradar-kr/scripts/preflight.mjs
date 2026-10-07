// Production environment check. Usage: node --env-file=.env.production scripts/preflight.mjs  (or run with the vars exported)
// Prints only SET / MISSING — never a value.
const need = [["DATABASE_URL", "Supabase Pooler URL (storage)"], ["ADMIN_PASSWORD", "/admin access"], ["CRON_SECRET", "/api/cron/watchlists auth"]];
const real = [["TELEGRAM_BOT_TOKEN", "real notifications"], ["TELEGRAM_CHAT_ID", "real notifications"]];
const optional = ["SKYSCANNER_API_KEY", "OWNER_USER_ID"];
let bad = 0;
const has = (k) => Boolean(process.env[k]?.trim());
for (const [k, why] of need) { console.log(`${has(k) ? "OK     " : "MISSING"} ${k} — ${why}`); if (!has(k)) bad++; }
for (const [k, why] of real) { console.log(`${has(k) ? "OK     " : "MISSING"} ${k} — ${why}`); if (!has(k)) bad++; }
if (process.env.TELEGRAM_DRY_RUN?.toLowerCase() === "true") { console.log("WARN    TELEGRAM_DRY_RUN=true — nothing is really sent"); bad++; }
if (process.env.DEMO_MODE?.toLowerCase() === "true") console.log("WARN    DEMO_MODE=true — test data will appear");
for (const k of optional) console.log(`${has(k) ? "SET    " : "unset  "} ${k} (optional)`);
for (const k of Object.keys(process.env)) if (k.startsWith("NEXT_PUBLIC_") && /KEY|TOKEN|SECRET|PASSWORD|DATABASE/i.test(k)) { console.log(`DANGER  ${k} would be exposed to the browser`); bad++; }
process.exit(bad ? 1 : 0);
