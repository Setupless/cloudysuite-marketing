// Serves the product's own fake Cloudflare API with one account, "Saltbush
// Studio", that owns the zone example.com. The product's script offers only
// `.localhost` zones, which would show in the wizard.
//   bun fake-cloudflare.ts <product checkout> <port>
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const [product, port] = process.argv.slice(2);
if (!product || !port) {
  console.error("Usage: bun fake-cloudflare.ts <product checkout> <port>");
  process.exit(1);
}

const { createFakeCloudflare } = await import(
  join(product, "apps/auth/src/setup/fake-cloudflare.ts")
);

const ACCOUNT = "5a17b05405a17b05405a17b05405a17b";
const OWNER_TOKEN = "owner-token-owner-token-owner-token";

const fake = createFakeCloudflare({
  onSecretSet(name: string, text: string) {
    appendFileSync(join(product, ".dev.vars"), `\n${name}=${text}\n`);
    console.log(`secret-set ${name}`);
  },
});
fake.addAccount(ACCOUNT, "Saltbush Studio");
fake.addWorker(ACCOUNT, "cloudysuite", "any", "2026-11-01T00:00:00Z");
const worker = fake.state.accounts.get(ACCOUNT)?.workers.get("cloudysuite");
if (worker) worker.settings = { logpush: false, tags: [] };
fake.addZone(ACCOUNT, "e1a3c0de5a17b054e1a3c0de5a17b054", "example.com");
fake.addToken(OWNER_TOKEN, ACCOUNT);

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(port),
  fetch: (request) => fake.fetch(request),
});
console.log(`fake-cloudflare ready on ${port}`);
