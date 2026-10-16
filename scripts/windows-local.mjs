import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline/promises";

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const marker = "ARTMASTER_WINDOWS_LOCAL_V1";
export function requireCompatibleNode(version = process.versions.node) {
  if (Number(version.split(".")[0]) < 24)
    throw new Error(
      "Este necesar Node.js 24 sau mai nou. Instaleaza-l de la https://nodejs.org si redeschide START.bat.",
    );
}
export function localPort(value = process.env.ARTMASTER_LOCAL_PORT || "3000") {
  if (!/^\d{4,5}$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error(
      "ARTMASTER_LOCAL_PORT trebuie sa fie intre 1024 si 65535. Gazda ramane 127.0.0.1.",
    );
  return Number(value);
}
export function localEnvironment(root, inherited = process.env) {
  const port = localPort(inherited.ARTMASTER_LOCAL_PORT || "3000");
  return {
    ...inherited,
    NODE_ENV: "development",
    SITE_URL: `http://localhost:${port}`,
    SITE_INDEXABLE: "false",
    ARTMASTER_STORAGE: "local",
    ARTMASTER_DATA_DIR: join(root, ".data", "windows-local"),
    ARTMASTER_ALLOW_LOCAL_PRODUCTION: "false",
    ARTMASTER_TRUST_PROXY: "false",
    ARTMASTER_IP_HEADER: "x-real-ip",
    PORT: String(port),
    ARTMASTER_LOCAL_PORT: String(port),
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    ARTMASTER_SESSION_SECRET: "",
    ARTMASTER_FORM_SECRET: "",
    RESEND_API_KEY: "",
    RESEND_FROM_EMAIL: "",
    CONTACT_RECIPIENT_EMAIL: "",
    QUOTE_NOTIFICATION_EMAIL: "",
    CONTACT_SEND_CONFIRMATION: "false",
    GA_MEASUREMENT_ID: "",
    GSC_VERIFICATION: "",
    ARTMASTER_GOOGLE_REPORTING_ENABLED: "false",
    GOOGLE_CLIENT_EMAIL: "",
    GOOGLE_PRIVATE_KEY: "",
    GA4_PROPERTY_ID: "",
    GSC_SITE_URL: "",
    ARTMASTER_PAGESPEED_ENABLED: "false",
    PAGESPEED_API_KEY: "",
    GOOGLE_APPLICATION_CREDENTIALS: "",
    ADMIN_PASSWORD: "",
    PARTNERS_PREVIEW: "true",
    CONTACT_VIBER_NUMBER: "",
  };
}
async function regularFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(
      "Un fisier local este o legatura sau are un tip neacceptat. Foloseste o copie curata.",
    );
}
export async function prepareConfiguration(root = projectRoot) {
  // Never reuse an unrelated environment or data directory. Never overwrite a configuration.
  for (const name of [
    ".env",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
  ]) {
    if (existsSync(join(root, name)))
      throw new Error(
        `Exista ${name}. Pentru izolare, extrage proiectul intr-un folder nou; fisierul existent nu a fost modificat.`,
      );
  }
  const template = await readFile(
      join(root, "config", "windows.env.example"),
      "utf8",
    ),
    target = join(root, ".env.local");
  if (existsSync(target)) {
    await regularFile(target);
    if ((await readFile(target, "utf8")) !== template)
      throw new Error(
        "Exista o configuratie .env.local diferita. Nu o suprascriem. Foloseste un folder nou pentru pachetul Windows.",
      );
  } else await writeFile(target, template, { flag: "wx", mode: 0o600 });
  const parent = join(root, ".data");
  if (existsSync(parent) && (await lstat(parent)).isSymbolicLink())
    throw new Error("Directorul de date nu poate fi o legatura.");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const directory = join(parent, "windows-local"),
    ownership = join(directory, ".windows-local-owner");
  if (existsSync(directory)) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || !existsSync(ownership))
      throw new Error(
        "Exista un director de date fara marcajul pachetului. Nu il modificam; foloseste o copie curata.",
      );
    await regularFile(ownership);
    if ((await readFile(ownership, "utf8")) !== marker)
      throw new Error("Directorul de date nu apartine acestui pachet local.");
  } else {
    await mkdir(directory, { mode: 0o700 });
    await writeFile(ownership, marker, { flag: "wx", mode: 0o600 });
  }
  return directory;
}
export async function run(command, args, options = {}) {
  const { cwd = projectRoot, env = localEnvironment(cwd), ...rest } = options;
  return new Promise((done, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
      ...rest,
    });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGTERM", stop);
    const interrupt = () => {
      if (process.platform !== "win32") child.kill("SIGINT");
    };
    process.once("SIGINT", interrupt);
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") done();
      else
        reject(
          new Error(
            `Comanda s-a oprit (cod ${code ?? signal}). Vezi mesajele de mai sus.`,
          ),
        );
    });
    function cleanup() {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", interrupt);
    }
  });
}
export async function installIfNeeded(root = projectRoot) {
  const directory = await prepareConfiguration(root),
    stamp = join(directory, "dependencies.sha256");
  const hash = createHash("sha256")
    .update(await readFile(join(root, "package-lock.json")))
    .digest("hex");
  const ready = [
    "node_modules/next/dist/bin/next",
    "node_modules/tsx/dist/cli.mjs",
    "node_modules/sharp/package.json",
  ].every((file) => existsSync(join(root, file)));
  if (ready && existsSync(stamp) && (await readFile(stamp, "utf8")) === hash)
    return;
  console.log(
    "Instalam dependintele din package-lock.json. Prima pornire necesita internet; cheia si parola nu sunt necesare.",
  );
  if (process.platform === "win32")
    await run(
      process.env.ComSpec || "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        "npm ci --include=dev --include=optional --no-audit --no-fund",
      ],
      { cwd: root },
    );
  else
    await run(
      "npm",
      ["ci", "--include=dev", "--include=optional", "--no-audit", "--no-fund"],
      { cwd: root },
    );
  await writeFile(stamp, hash, { mode: 0o600 });
}
export async function assertPortAvailable(port = 3000) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Portul ${port} este ocupat. Inchide propria instanta anterioara sau aplicatia care il foloseste. Nu o oprim automat.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : done())),
    );
  });
}
export async function main(action = process.argv[2] || "start") {
  requireCompatibleNode();
  if (!["start", "prepare", "admin"].includes(action))
    throw new Error("Actiune acceptata: start, prepare sau admin.");
  await installIfNeeded();
  await run(process.execPath, [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/windows-init.ts",
  ]);
  if (action === "prepare") return;
  if (action === "admin") {
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let email, role;
    try {
      email = (await input.question("E-mail pentru contul local: "))
        .trim()
        .toLowerCase();
      role =
        (
          await input.question("Rol [admin/editor/viewer], implicit admin: ")
        ).trim() || "admin";
    } finally {
      input.close();
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["admin", "editor", "viewer"].includes(role)
    )
      throw new Error("E-mail sau rol nevalid.");
    await run(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"],
      {
        env: {
          ...localEnvironment(projectRoot),
          ADMIN_EMAIL: email,
          ADMIN_ROLE: role,
        },
      },
    );
    return;
  }
  const port = localPort();
  await assertPortAvailable(port);
  console.log(
    `\nARTMASTER - testare izolata pe acest PC\nWebsite: http://localhost:${port}\nAdministrare: http://localhost:${port}/admin\nCreeaza contul prin CREATE-ADMIN.bat. Nu exista parola implicita.\nAsteapta mesajul Ready. Ctrl+C opreste serverul. Nu expune aceasta instanta pe internet.\n`,
  );
  await run(process.execPath, [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(`ARTMASTER: ${error.message}`);
    process.exitCode = 1;
  });
