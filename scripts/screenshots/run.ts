// Seeds a fresh CloudySuite with the Saltbush Studio workspace and captures the
// marketing site's screenshots. See README.md beside this file.
//   bun scripts/screenshots/run.ts --product /path/to/cloudysuite
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Locator,
  type Page,
} from "playwright-core";
import { type FixtureFiles, makeFiles } from "./fixtures/files";
import { fillTemplate, RunClock } from "./templates";

const HERE = import.meta.dir;
const FIXTURES = join(HERE, "fixtures");
const FONT = resolve(HERE, "../../public/fonts/inter-latin-opsz-normal.woff2");
const CHROMIUM_REVISION = "1248";

const DOMAIN = "example.com";
const TIME_ZONE = "Australia/Melbourne";
const LOCALE = "en-AU";
const PASSWORD = "saltbush-studio-2026";
const PORTS = { worker: 8787, fakeCloudflare: 8799 };
const CLOUDFLARE_TOKEN = "owner-token-owner-token-owner-token";

const app = (name: "auth" | "mail" | "storage" | "calendar", path = "/") =>
  `https://${name}.${DOMAIN}${path}`;

type Person = {
  name: string;
  local: string;
  role: "admin" | "member";
  // Null leaves them on a password alone, which the People page points out.
  passkey: string | null;
};

const PEOPLE: Person[] = [
  { name: "Maya Chen", local: "maya", role: "admin", passkey: "MacBook Pro" },
  { name: "Tom Okafor", local: "tom", role: "member", passkey: "iPhone" },
  { name: "Priya Raman", local: "priya", role: "member", passkey: "Pixel" },
  { name: "Lucas Ferreira", local: "lucas", role: "member", passkey: null },
  { name: "Hannah Byrne", local: "hannah", role: "member", passkey: "Work laptop" },
  { name: "Sione Tuilagi", local: "sione", role: "member", passkey: "iPhone" },
  { name: "Ellie Novak", local: "ellie", role: "member", passkey: "MacBook Air" },
  { name: "Ravi Patel", local: "ravi", role: "admin", passkey: "ThinkPad" },
];
const [ADMIN] = PEOPLE as [Person];

const MAIL = {
  labels: {
    "Wattle Grove planting plan, rev C": ["Wattle Grove Park"],
    "Nursery availability for the spring order": ["Wattle Grove Park"],
    "Invoice INV-20431 from Kiln Supply": ["Accounts"],
    "Quote Q-1182: sandstone pavers for Harbour Steps": ["Accounts"],
  } as Record<string, string[]>,
  labelColours: { "Wattle Grove Park": "Green", Accounts: "Orange" } as Record<string, string>,
  unread: [
    "Invoice INV-20431 from Kiln Supply",
    "PA-2026/0417: request for further information",
    "Retaining wall details for review",
    "Invitation: Riverbend schoolyard walkthrough",
  ],
  studioUnread: ["Enquiry: courtyard garden for a terrace house"],
  invitation: "Invitation: Riverbend schoolyard walkthrough",
  open: "Wattle Grove planting plan, rev C",
};

const STORAGE = {
  teamFolder: "Projects",
  folders: [
    "Banksia Lane Courtyard",
    "Harbour Steps Plaza",
    "Harbour Steps Plaza/Details",
    "Riverbend School",
    "Wattle Grove Park",
    "Wattle Grove Park/Consultation",
    "Wattle Grove Park/Photos",
    "Wattle Grove Park/Survey",
  ],
  // Who adds each file, so the table shows a team's work rather than one person's.
  uploader: {
    "Concept plan rev C.png": "tom",
    "Concept plan rev C.pdf": "tom",
    "Planting schedule rev C.xlsx": "tom",
    "Site plan rev C.dxf": "sione",
    "Site photo, north entry.jpg": "priya",
    "Fee proposal, signed.pdf": "hannah",
    "Feature survey.pdf": "lucas",
    "Feature survey.dxf": "lucas",
    "Community drop-in summary.pdf": "ellie",
    "Creek edge, looking east.jpg": "priya",
    "Existing gums.jpg": "priya",
    "Retaining wall details.pdf": "sione",
    "Courtyard layout rev A.pdf": "hannah",
    "Concept pack.pdf": "maya",
  } as Record<string, string>,
  // Each person keeps a few copies in My files, so nobody's usage reads 0 bytes.
  myFiles: {
    maya: ["Concept pack.pdf", "Fee proposal, signed.pdf"],
    tom: ["Site plan rev C.dxf"],
    priya: ["Existing gums.jpg", "Creek edge, looking east.jpg"],
    lucas: ["Feature survey.pdf"],
    hannah: ["Courtyard layout rev A.pdf"],
    sione: ["Retaining wall details.pdf", "Site photo, north entry.jpg"],
    ellie: ["Community drop-in summary.pdf"],
    ravi: ["Planting schedule rev C.xlsx"],
  } as Record<string, string[]>,
  open: "Wattle Grove Park",
  chosen: "Concept plan rev C.png",
};

type Size = { width: number; height: number };
const DESKTOP: Size = { width: 1280, height: 800 };
// The wizard is one narrow card, so a smaller window keeps it from floating in empty space.
const SETUP: Size = { width: 1040, height: 720 };
const PHONE: Size = { width: 390, height: 844 };

type Shot = {
  name: string;
  viewport: Size;
  // Leaves the page showing the screen, as a person would get there.
  show: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "mail",
    viewport: DESKTOP,
    show: async (page) => {
      await page.goto(app("mail"));
      await threadLink(page, "inbox", MAIL.open).click();
      await page.getByRole("region", { name: "Conversation" }).getByRole("heading", { name: MAIL.open }).waitFor();
    },
  },
  {
    name: "mail-phone",
    viewport: PHONE,
    show: async (page) => {
      await page.goto(app("mail"));
      await threadLink(page, "inbox", MAIL.open).waitFor();
    },
  },
  {
    name: "calendar",
    viewport: DESKTOP,
    show: async (page) => {
      await page.goto(app("calendar", "/schedule"));
      await page.getByRole("button", { name: "Week", pressed: true }).waitFor();
      await page.getByText("Studio stand-up").first().waitFor();
      await scrollWeekTo(page, "8:00 am");
    },
  },
  {
    name: "storage",
    viewport: DESKTOP,
    show: async (page) => {
      await openFolder(page, STORAGE.open);
      await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(STORAGE.chosen)}`) }).click();
      const panel = page.getByRole("complementary", { name: "Details" });
      await panel.getByRole("heading", { name: STORAGE.chosen }).waitFor();
      await panel.locator("img").first().waitFor();
    },
  },
  {
    name: "account",
    viewport: DESKTOP,
    show: async (page) => {
      await page.goto(app("auth", "/admin"));
      await page.getByRole("heading", { level: 1, name: "Organisation" }).waitFor();
    },
  },
  // Last, because opening the invitation marks it read for every later shot.
  {
    name: "mail-invite",
    viewport: DESKTOP,
    show: async (page) => {
      await page.goto(app("mail"));
      await threadLink(page, "inbox", MAIL.invitation).click();
      await page
        .getByRole("region", { name: "Conversation" })
        .getByRole("region", { name: "Riverbend schoolyard walkthrough" })
        .waitFor();
    },
  },
];

const SCHEMES = ["light", "dark"] as const;


type Service = { name: string; child: ChildProcess; output: string; log: string };
const services = new Set<Service>();

function start(name: string, command: string, args: string[], cwd: string, log: string): Service {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const service: Service = { name, child, output: "", log };
  const record = (chunk: Buffer) => {
    const text = chunk.toString();
    service.output += text;
    writeFileSync(log, text, { flag: "a" });
  };
  child.stdout?.on("data", record);
  child.stderr?.on("data", record);
  services.add(service);
  return service;
}

async function stop(service: Service) {
  services.delete(service);
  const { child } = service;
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = new Promise((done) => child.once("exit", done));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, name);
    } catch {}
  };
  signal("SIGTERM");
  const timer = setTimeout(() => signal("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}

async function stopAll() {
  await Promise.all([...services].map(stop));
}

async function waitForOutput(service: Service, pattern: RegExp, from = 0, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = pattern.exec(service.output.slice(from));
    if (match) return match;
    if (service.child.exitCode !== null) {
      throw new Error(`${service.name} exited early. See ${service.log}`);
    }
    await Bun.sleep(200);
  }
  throw new Error(`${service.name} never printed ${pattern}. See ${service.log}`);
}

async function assertPortFree(port: number) {
  const inUse = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {} } })
    .then((socket) => (socket.end(), true))
    .catch(() => false);
  if (inUse) throw new Error(`Port ${port} is in use. Stop whatever is on it and run again.`);
}


async function prepareProduct(source: string, work: string): Promise<string> {
  const head = (await $`git -C ${source} rev-parse HEAD`.text()).trim();
  const product = join(work, "product");
  const current = existsSync(product)
    ? (await $`git -C ${product} rev-parse HEAD`.nothrow().text()).trim()
    : "";
  if (current !== head) {
    rmSync(product, { recursive: true, force: true });
    console.log(`Cloning ${source} at ${head.slice(0, 7)}`);
    await $`git clone --quiet ${source} ${product}`;
    await $`git -C ${product} checkout --quiet ${head}`;
  }
  const built = join(product, ".screenshots-built");
  if (!existsSync(built) || readFileSync(built, "utf8") !== head) {
    console.log("Installing and building the product");
    await $`bun install --frozen-lockfile`.cwd(product).quiet();
    await $`bun run build`.cwd(product).quiet();
    writeFileSync(built, head);
  }
  return product;
}

function startWorker(product: string, state: string, logs: string): Service {
  return start(
    "wrangler dev",
    join(product, "node_modules/.bin/wrangler"),
    [
      "dev",
      "--port",
      String(PORTS.worker),
      "--local-protocol",
      "https",
      // The Worker redirects http to https for any non-local host, and wrangler
      // talks to it over http unless told the outer protocol.
      "--upstream-protocol",
      "https",
      "--persist-to",
      state,
    ],
    product,
    join(logs, "wrangler.log"),
  );
}


const fontFace = `(() => {
  const bytes = Uint8Array.from(atob("${readFileSync(FONT).toString("base64")}"), (c) => c.charCodeAt(0));
  const face = new FontFace("Inter", bytes, { weight: "100 900" });
  document.fonts.add(face);
  face.load();
})()`;

function chromiumPath(): string {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? "", ".cache/ms-playwright");
  const path = join(root, `chromium_headless_shell-${CHROMIUM_REVISION}`, "chrome-headless-shell-linux64", "chrome-headless-shell");
  if (!existsSync(path)) {
    throw new Error(`Chromium ${CHROMIUM_REVISION} isn't installed. Run: bunx playwright-core@1.64.0 install chromium-headless-shell`);
  }
  return path;
}

async function launch(): Promise<Browser> {
  return chromium.launch({
    executablePath: chromiumPath(),
    args: [`--host-resolver-rules=MAP *.${DOMAIN} 127.0.0.1:${PORTS.worker}`, "--ignore-certificate-errors"],
  });
}

async function newContext(
  browser: Browser,
  options: { viewport?: Size; scheme?: "light" | "dark"; storageState?: string; scale?: number } = {},
): Promise<BrowserContext> {
  const viewport = options.viewport ?? DESKTOP;
  const phone = viewport.width < 600;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: options.scale ?? 1,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: options.scheme ?? "light",
    locale: LOCALE,
    timezoneId: TIME_ZONE,
    ignoreHTTPSErrors: true,
    storageState: options.storageState,
  });
  // Inter leads the product's font stack. Without it on the machine, the
  // screenshots would show the fallback font instead.
  await context.addInitScript(fontFace);
  context.setDefaultTimeout(30_000);
  return context;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function threadLink(page: Page, folder: string, subject: string): Locator {
  return page.locator(`main a[href*="/${folder}/"]`, { hasText: subject }).first();
}

async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {});
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((image) =>
        image.complete ? null : new Promise((done) => image.addEventListener("load", done, { once: true })),
      ),
    ),
  );
  await page.waitForTimeout(600);
}

// The Week grid opens on the current time, which may be the middle of the night.
// This scrolls it as a person would, to put the hour just under the sticky header.
async function scrollWeekTo(page: Page, hourLabel: string) {
  await page.getByText(hourLabel, { exact: true }).first().evaluate((hour) => {
    const allDay = [...document.querySelectorAll("*")].find(
      (node) => node.childElementCount === 0 && node.textContent?.trim() === "All day",
    );
    let header = allDay?.getBoundingClientRect().bottom ?? 0;
    for (let at = allDay?.parentElement; at; at = at.parentElement) {
      if (getComputedStyle(at).position === "sticky") {
        header = at.getBoundingClientRect().bottom;
        break;
      }
    }
    for (let at = hour.parentElement; at; at = at.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) {
        at.scrollTop += hour.getBoundingClientRect().top - header - 16;
        return;
      }
    }
  });
}


type Run = {
  browser: Browser;
  worker: Service;
  product: string;
  state: string;
  logs: string;
  work: string;
  clock: RunClock;
  files: FixtureFiles;
  out: string;
  contexts: Map<string, BrowserContext>;
};

const step = (text: string) => console.log(`- ${text}`);

async function runSetupWizard(run: Run): Promise<Service> {
  step("Setup wizard, with the fake Cloudflare API");
  const context = await newContext(run.browser, { scale: 2, viewport: SETUP });
  const page = await context.newPage();
  await page.goto(`https://localhost:${PORTS.worker}/setup`);
  await page.getByLabel("Cloudflare token").fill(CLOUDFLARE_TOKEN);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: DOMAIN, exact: true }).check();
  await page.getByRole("radio", { name: new RegExp(`^Directly on ${escapeRegExp(DOMAIN)}`) }).check();
  await page.getByRole("button", { name: "Continue" }).waitFor();
  await page.mouse.move(0, 0);
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await capture(run, page, `setup-${scheme}`, SETUP);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Set up my domain" }).click();
  await page.getByRole("button", { name: "Check again" }).waitFor({ timeout: 60_000 });

  // The fake API wrote the new sign-in secret to .dev.vars. A real Worker
  // restarts by itself, and wrangler dev reads it again on a restart.
  step("Restarting wrangler dev with the new secret");
  await stop(run.worker);
  const worker = startWorker(run.product, run.state, run.logs);
  await waitForOutput(worker, /Ready on/);
  await page.getByRole("button", { name: "Check again" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Email to sign in with").fill(`${ADMIN.local}@${DOMAIN}`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(`Your email address at ${DOMAIN}`).fill(ADMIN.local);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByRole("heading", { name: "CloudySuite is ready" }).waitFor({ timeout: 60_000 });
  await context.close();
  return worker;
}

// Better Auth refuses a fourth password sign-in from one address until 10
// seconds pass with none, and every person here signs in from this machine.
let lastSignIn = 0;
async function paceSignIn() {
  const wait = lastSignIn + 10_500 - Date.now();
  if (wait > 0) await Bun.sleep(wait);
  lastSignIn = Date.now();
}

async function signIn(run: Run, person: Person): Promise<BrowserContext> {
  const context = await newContext(run.browser);
  const page = await context.newPage();
  await page.goto(app("auth", "/sign-in"));
  await page.getByRole("button", { name: "Use a password instead" }).click();
  await page.getByLabel("Email").fill(`${person.local}@${DOMAIN}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await paceSignIn();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: `Account menu for ${person.name}` }).waitFor();
  await page.close();
  run.contexts.set(person.local, context);
  return context;
}

async function addPasskey(context: BrowserContext, name: string) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  await page.goto(app("auth"));
  await page.getByLabel("Name for this passkey").fill(name);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.getByText(name, { exact: true }).first().waitFor();
  await page.close();
}

async function invitePeople(run: Run) {
  const admin = run.contexts.get(ADMIN.local)!;
  const page = await admin.newPage();
  await page.goto(app("auth", "/admin/people"));
  for (const person of PEOPLE.slice(1)) {
    step(`Inviting ${person.name}`);
    const personal = `${person.name.toLowerCase().replace(" ", ".")}@personal.example`;
    const from = run.worker.output.length;
    await page.getByLabel("Where to send the invite").fill(personal);
    await page.getByLabel("Name before the @").fill(person.local);
    await page
      .getByLabel("What they can do")
      .selectOption({ label: person.role === "admin" ? "Admin: also manages this organisation" : "Member: uses the apps" });
    await page.getByRole("button", { name: "Send invite" }).click();
    await page.getByRole("status").filter({ hasText: `We sent an invite to ${personal}` }).waitFor();
    // wrangler dev writes outgoing mail to a file and prints where.
    const [, textFile] = await waitForOutput(
      run.worker,
      new RegExp(`To: ${escapeRegExp(personal)}[\\s\\S]*?Text: (\\S+\\.txt)`),
      from,
    );
    const link = /https:\/\/\S+\/invite\/[0-9a-f]+/.exec(readFileSync(textFile!, "utf8"))?.[0];
    if (!link) throw new Error(`No invite link in ${textFile}`);

    const context = await newContext(run.browser);
    const welcome = await context.newPage();
    await welcome.goto(link);
    await welcome.getByLabel("Your name").fill(person.name);
    await welcome.getByLabel("Choose a password").fill(PASSWORD);
    await paceSignIn();
    await welcome.getByRole("button", { name: "Create my account" }).click();
    await welcome.getByRole("button", { name: `Account menu for ${person.name}` }).waitFor();
    await welcome.close();
    run.contexts.set(person.local, context);
    if (person.passkey) await addPasskey(context, person.passkey);
  }
  await page.close();
}

async function createStudioMailbox(run: Run) {
  step("Shared mailbox studio@");
  const page = await run.contexts.get(ADMIN.local)!.newPage();
  await page.goto(app("auth", "/admin/mailboxes"));
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Studio");
  await page.getByRole("group", { name: "Address", exact: true }).getByLabel("Name before the @").fill("studio");
  await page.getByRole("button", { name: "Create mailbox" }).click();
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Studio", level: 2, exact: true }) });
  await section.waitFor();
  for (const [local, access] of [
    [ADMIN.local, "Manager: can read, send, and import mail"],
    ["hannah", "Member: can read and send mail"],
    ["ellie", "Member: can read and send mail"],
  ] as const) {
    const person = PEOPLE.find((one) => one.local === local)!;
    await section.getByLabel("Person").selectOption({ label: `${person.name} (${person.local}@${DOMAIN})` });
    await section.getByLabel("Access").selectOption({ label: access });
    await section.getByRole("button", { name: "Give access" }).click();
    await section.getByText(person.name).first().waitFor();
  }
  await page.close();
}

// The sidebar shows one mailbox's folders at a time, with the others listed below.
async function openMailbox(page: Page, mailbox: string): Promise<Locator> {
  await page.goto(app("mail"));
  const folders = page.getByRole("navigation", { name: mailbox, exact: true });
  if (!(await folders.isVisible())) {
    await page.getByRole("complementary").getByRole("link", { name: mailbox, exact: true }).click();
  }
  await folders.waitFor();
  return folders;
}

async function importMbox(page: Page, mailbox: string, path: string) {
  await page.goto(app("mail"));
  await page.getByRole("complementary").getByRole("link", { name: "Import mail" }).click();
  await page.getByText("Your .mbox file").first().waitFor();
  const choice = page.getByLabel("Mailbox to import into");
  if (await choice.count()) {
    await choice.selectOption({ label: mailbox });
    await page.getByRole("heading", { name: "Choose a file" }).waitFor();
  }
  await page.locator('input[type="file"]').setInputFiles(path);
  await page.getByRole("button", { name: "Start import" }).click();
  await page.getByText("The import has finished").waitFor({ timeout: 120_000 });
}

// Imported mail lands in Archive, read. A person moves it to the Inbox.
async function moveArchiveToInbox(page: Page, mailbox: string, labels: Record<string, string[]>) {
  await (await openMailbox(page, mailbox)).getByRole("link", { name: "Archive" }).click();
  const list = page.getByRole("region", { name: "Archive" });
  const conversation = page.getByRole("region", { name: "Conversation" });
  await list.locator("a").first().waitFor();
  while ((await list.locator('a[href*="/archive/"]').count()) > 0) {
    const first = list.locator('a[href*="/archive/"]').first();
    const href = await first.getAttribute("href");
    await first.click();
    const subject = (await conversation.getByRole("heading", { level: 1 }).innerText()).trim();
    for (const label of labels[subject] ?? []) {
      await conversation.getByRole("button", { name: "Labels" }).click();
      const picker = page.getByLabel("Find or create a label");
      await picker.fill(label);
      await picker.press("Enter");
      await conversation.getByRole("button", { name: `Remove the label ${label}` }).waitFor();
      await page.keyboard.press("Escape");
    }
    await conversation.getByRole("button", { name: "Move to Inbox" }).click();
    await list.locator(`a[href="${href}"]`).waitFor({ state: "detached" });
  }
}

async function markUnread(page: Page, mailbox: string, subjects: string[]) {
  await (await openMailbox(page, mailbox)).getByRole("link", { name: "Inbox" }).click();
  const conversation = page.getByRole("region", { name: "Conversation" });
  for (const subject of subjects) {
    await threadLink(page, "inbox", subject).click();
    await conversation.getByRole("heading", { name: subject }).waitFor();
    await conversation.getByRole("button", { name: "Mark as unread" }).click();
    await threadLink(page, "inbox", subject).getByLabel("Unread").waitFor();
  }
}

async function seedMail(run: Run) {
  const page = await run.contexts.get(ADMIN.local)!.newPage();
  const fill = (name: string) => {
    const path = join(run.work, "fixtures", name);
    writeFileSync(path, fillTemplate(name, { clock: run.clock, fixtures: FIXTURES, files: run.files.mail }));
    return path;
  };
  step("Importing Maya's mail");
  await importMbox(page, ADMIN.name, fill("maya-inbox.mbox"));
  await moveArchiveToInbox(page, ADMIN.name, MAIL.labels);
  step("Importing the Studio mailbox");
  await importMbox(page, "Studio", fill("studio-inbox.mbox"));
  await moveArchiveToInbox(page, "Studio", {});

  step("Label colours");
  await (await openMailbox(page, ADMIN.name)).getByRole("link", { name: "Edit labels" }).click();
  for (const [label, colour] of Object.entries(MAIL.labelColours)) {
    // The radio is visually hidden inside its label, so force reaches it.
    await page.getByRole("group", { name: `Colour of the label ${label}` }).getByRole("radio", { name: colour }).check({ force: true });
    await page.waitForTimeout(800);
  }

  step("Adding the Riverbend invitation to Maya's calendar");
  await openMailbox(page, ADMIN.name);
  await threadLink(page, "inbox", MAIL.invitation).click();
  const card = page.getByRole("region", { name: "Conversation" }).getByRole("region", { name: "Riverbend schoolyard walkthrough" });
  await card.getByRole("button", { name: "Add to my calendar" }).click();
  await card.getByRole("button", { name: "Add to my calendar" }).waitFor({ state: "detached" });

  step("Leaving some mail unread");
  await markUnread(page, ADMIN.name, MAIL.unread);
  await markUnread(page, "Studio", MAIL.studioUnread);
  await page.close();
}

async function seedCalendar(run: Run) {
  const page = await run.contexts.get(ADMIN.local)!.newPage();
  const fill = (name: string) => {
    const path = join(run.work, "fixtures", name);
    writeFileSync(path, fillTemplate(name, { clock: run.clock, fixtures: FIXTURES, files: {} }));
    return path;
  };
  step("Studio team calendar and events");
  await page.goto(app("calendar", "/schedule"));
  await page.getByRole("button", { name: "New team calendar" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: /Name/ }).fill("Studio");
  await page.getByRole("button", { name: "Create team calendar" }).click();
  await page.getByRole("button", { name: "Settings for Studio" }).waitFor();
  for (const [calendar, file] of [
    ["Studio", "studio.ics"],
    [ADMIN.name, "maya.ics"],
  ] as const) {
    await page.getByRole("button", { name: `Settings for ${calendar}` }).click();
    const dialog = page.getByRole("dialog");
    if (calendar === "Studio") {
      for (const person of PEOPLE.slice(1)) {
        await dialog.getByRole("searchbox", { name: "Add a person" }).fill(person.name);
        await dialog.getByRole("button", { name: new RegExp(`^${escapeRegExp(person.name)}`) }).click();
        await dialog.getByRole("combobox", { name: `What ${person.name} can do` }).waitFor();
      }
    }
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Import events from a file" }).click();
    await (await chooser).setFiles(fill(file));
    await dialog.getByText(`From ${file}:`).waitFor();
    await dialog.getByRole("button", { name: "Done" }).click();
    await dialog.waitFor({ state: "detached" });
  }
  await page.close();
}

// A folder's row is one link whose name runs on into who changed it and when.
const folderLink = (page: Page, name: string) =>
  page.getByRole("main").getByRole("link", { name: new RegExp(`^${escapeRegExp(name)}(\\s|$)`) });

async function openFolder(page: Page, path: string) {
  await page.goto(app("storage"));
  await page.getByRole("navigation", { name: "Storage" }).getByRole("link", { name: STORAGE.teamFolder }).click();
  await page.getByRole("heading", { name: STORAGE.teamFolder, level: 1 }).waitFor();
  for (const name of path.split("/").filter(Boolean)) {
    await folderLink(page, name).click();
    await page.getByRole("heading", { name, level: 1 }).waitFor();
  }
}

async function seedStorage(run: Run) {
  const page = await run.contexts.get(ADMIN.local)!.newPage();
  step("Projects team folder and its people");
  await page.goto(app("storage"));
  await page.getByRole("button", { name: "New team folder" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: /Name/ }).fill(STORAGE.teamFolder);
  await page.getByRole("button", { name: "Create team folder" }).click();
  await page.getByRole("heading", { name: STORAGE.teamFolder, level: 1 }).waitFor();
  await page.getByRole("complementary", { name: "Details" }).getByRole("button", { name: "People" }).click();
  const dialog = page.getByRole("dialog");
  for (const person of PEOPLE.slice(1)) {
    await dialog.getByRole("searchbox").fill(person.name);
    await dialog.getByRole("button", { name: new RegExp(`^${escapeRegExp(person.name)}`) }).click();
    await dialog.getByRole("combobox", { name: `What ${person.name} can do` }).waitFor();
  }
  await dialog.getByRole("button", { name: "Done" }).click();

  step("Project folders");
  for (const path of STORAGE.folders) {
    const parent = dirname(path) === "." ? "" : dirname(path);
    await openFolder(page, parent);
    await page.getByRole("main").getByRole("button", { name: "New folder" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill(basename(path));
    await page.getByRole("button", { name: "Create folder" }).click();
    await folderLink(page, basename(path)).waitFor();
  }
  await page.close();

  for (const [folder, files] of Object.entries(run.files.projects)) {
    const byUploader = Map.groupBy(files, (file) => STORAGE.uploader[basename(file)] ?? ADMIN.local);
    for (const [local, group] of byUploader) {
      step(`${PEOPLE.find((one) => one.local === local)!.name} uploads to ${folder}`);
      const page = await run.contexts.get(local)!.newPage();
      await openFolder(page, folder);
      await upload(page, group);
      await page.close();
    }
  }

  step("Copies in everyone's My files");
  const byName = new Map(Object.values(run.files.projects).flat().map((file) => [basename(file), file]));
  for (const [local, names] of Object.entries(STORAGE.myFiles)) {
    const page = await run.contexts.get(local)!.newPage();
    await page.goto(app("storage", "/my-files"));
    await page.getByRole("heading", { name: "My files", level: 1 }).waitFor();
    await upload(page, names.map((name) => byName.get(name)!));
    await page.close();
  }
}

async function upload(page: Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Upload" }).click();
  await (await chooser).setFiles(files);
  for (const file of files) {
    await page
      .getByRole("main")
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(basename(file))}\\s`) })
      .waitFor({ timeout: 120_000 });
  }
  await page.getByText(/^Uploaded /).first().waitFor({ timeout: 120_000 });
}


async function capture(run: Run, page: Page, name: string, viewport: Size) {
  await settle(page);
  const text = await page.evaluate(() => document.body.innerText);
  for (const banned of ["localhost", "cloudysuite.localhost", "Something went wrong"]) {
    if (text.includes(banned)) throw new Error(`${name} shows "${banned}"`);
  }
  const png = join(run.work, "captures", `${name}.png`);
  mkdirSync(dirname(png), { recursive: true });
  await page.screenshot({ path: png, animations: "disabled", caret: "hide" });
  const webp = join(run.out, `${name}.webp`);
  await $`magick ${png} -quality 85 -define webp:method=6 ${webp}`;
  const [width, height] = (await $`magick identify -format "%w %h" ${webp}`.text()).split(" ").map(Number);
  if (width !== viewport.width * 2 || height !== viewport.height * 2) {
    throw new Error(`${name} is ${width}x${height}, not ${viewport.width * 2}x${viewport.height * 2}`);
  }
  console.log(`  wrote ${webp}`);
}

async function captureAll(run: Run) {
  const state = join(run.work, "maya.json");
  await run.contexts.get(ADMIN.local)!.storageState({ path: state });
  for (const shot of SHOTS) {
    for (const scheme of SCHEMES) {
      const context = await newContext(run.browser, { viewport: shot.viewport, scheme, storageState: state, scale: 2 });
      const page = await context.newPage();
      await shot.show(page);
      await page.mouse.move(shot.viewport.width - 2, shot.viewport.height - 2);
      await capture(run, page, `${shot.name}-${scheme}`, shot.viewport);
      await context.close();
    }
  }
  for (const shot of [...SHOTS.map(({ name }) => name), "setup"]) {
    const mean = async (scheme: string) =>
      Number(await $`magick ${join(run.out, `${shot}-${scheme}.webp`)} -colorspace Gray -format "%[fx:mean]" info:`.text());
    const [light, dark] = [await mean("light"), await mean("dark")];
    if (light - dark < 0.2) throw new Error(`${shot}: light and dark look alike (${light} and ${dark})`);
  }
}


async function main() {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      work: { type: "string", default: join(tmpdir(), "cloudysuite-screenshots") },
      out: { type: "string", default: resolve(HERE, "../../public/screens") },
    },
  });
  if (!values.product) {
    console.error("Usage: bun scripts/screenshots/run.ts --product <cloudysuite checkout> [--work <dir>] [--out <dir>]");
    process.exit(2);
  }
  const work = resolve(values.work!);
  const out = resolve(values.out!);
  const state = join(work, "state");
  const logs = join(work, "logs");
  for (const dir of [state, logs, join(work, "fixtures"), join(work, "captures")]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(out, { recursive: true });
  await Promise.all(Object.values(PORTS).map(assertPortFree));

  const product = await prepareProduct(resolve(values.product), work);
  rmSync(join(product, ".wrangler/tmp"), { recursive: true, force: true });
  writeFileSync(
    join(product, ".dev.vars"),
    `CLOUDYSUITE_LOCAL_CLOUDFLARE_API=http://127.0.0.1:${PORTS.fakeCloudflare}/client/v4\n`,
  );
  step("Migrating a fresh database");
  await $`${join(product, "node_modules/.bin/wrangler")} d1 migrations apply DB --local --persist-to ${state}`
    .cwd(product)
    .env({ ...process.env, CI: "1" })
    .quiet();

  const clock = new RunClock(Date.now(), TIME_ZONE);
  step("Making fixture files");
  const files = await makeFiles(join(work, "files"), FIXTURES);

  const fake = start("fake Cloudflare", "bun", [join(HERE, "fake-cloudflare.ts"), product, String(PORTS.fakeCloudflare)], product, join(logs, "fake-cloudflare.log"));
  await waitForOutput(fake, /fake-cloudflare ready/);
  const worker = startWorker(product, state, logs);
  await waitForOutput(worker, /Ready on/);

  const browser = await launch();
  const run: Run = { browser, worker, product, state, logs, work, clock, files, out, contexts: new Map() };
  try {
    run.worker = await runSetupWizard(run);
    const admin = await signIn(run, ADMIN);
    if (ADMIN.passkey) await addPasskey(admin, ADMIN.passkey);
    await invitePeople(run);
    await createStudioMailbox(run);
    await seedMail(run);
    await seedCalendar(run);
    await seedStorage(run);
    step("Capturing");
    await captureAll(run);
  } catch (error) {
    // Leaves a picture of every open page, which says more than a timeout.
    let index = 0;
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        index += 1;
        await page.screenshot({ path: join(logs, `failure-${index}.png`) }).catch(() => {});
      }
    }
    console.error(`Pages at the failure are in ${logs}`);
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

let exitCode = 0;
const interrupted = (signal: NodeJS.Signals) => {
  console.error(`\n${signal}: stopping everything this run started`);
  void stopAll().then(() => process.exit(130));
};
process.once("SIGINT", interrupted);
process.once("SIGTERM", interrupted);
try {
  await main();
  console.log("Done.");
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await stopAll();
}
process.exit(exitCode);
