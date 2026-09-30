import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCollector } from "./collector.mjs";
const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, ".private/server");
await mkdir(directory, { recursive: true });
const log = async message => {
  console.log(new Date().toISOString() + " " + message);
  await import("node:fs/promises").then(fs => fs.appendFile(path.join(directory, "service.log"), new Date().toISOString() + " " + message + "\n"));
};
const origins = ["https://silmoon04.github.io", "http://127.0.0.1:4174", "http://127.0.0.1:5174"];
const collector = createCollector({ directory, origins, snapshotPath: path.join(root, "dist/data/search.json") });
await new Promise((resolve, reject) => { collector.api.once("error", reject); collector.api.listen(8785, "127.0.0.1", resolve); });
await new Promise((resolve, reject) => { collector.admin.once("error", reject); collector.admin.listen(8786, "127.0.0.1", resolve); });
await writeFile(path.join(directory, "service.pid"), String(process.pid));
await writeFile(path.join(directory, "quick-tunnel.yaml"), "no-autoupdate: true\n");
await log("Collector ready; private dashboard http://127.0.0.1:8786/");
let child, stopping = false, endpoint, publishTimer, tunnelRetry;
async function github(method, pathname, token, body) {
  // A per-request DNS resolver avoids changing the laptop's global network settings.
  const resolver = new Resolver({ timeout: 3000, tries: 1 }); resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  let address; try { address = (await resolver.resolve4("api.github.com"))[0]; } catch { /* Use system DNS. */ }
  return new Promise((resolve, reject) => {
    const args = ["--config", "-", "--silent", "--show-error", "--connect-timeout", "8", "--max-time", "20", "--request", method,
      "--header", "Accept: application/vnd.github+json", "--header", "X-GitHub-Api-Version: 2022-11-28", "--user-agent", "paris-stays-laptop",
      "--write-out", "\n%{http_code}", ...(address ? ["--resolve", "api.github.com:443:" + address] : []),
      ...(body ? ["--header", "Content-Type: application/json", "--data-binary", JSON.stringify(body)] : []), "https://api.github.com" + pathname];
    const request = execFile("curl.exe", args, { windowsHide: true, timeout: 25000, maxBuffer: 1_000_000 }, (error, stdout) => {
      if (error) return reject(new Error("GitHub connection failed; endpoint update will retry"));
      const split = stdout.lastIndexOf("\n"), status = Number(stdout.slice(split + 1)), payload = stdout.slice(0, split);
      if (status === 404) return resolve(null);
      if (status >= 300) return reject(new Error("GitHub endpoint update HTTP " + status));
      try { resolve(JSON.parse(payload)); } catch { reject(new Error("Invalid GitHub response")); }
    });
    // The token goes through stdin, never shell interpolation, process arguments or logs.
    request.stdin.end('header = "Authorization: Bearer ' + token.replace(/["\\\r\n]/g, "") + '"\n');
  });
}
async function publishEndpoint() {
  if (!endpoint || stopping) return;
  try {
    const resolver = new Resolver({ timeout: 3000, tries: 1 }); resolver.setServers(["8.8.8.8", "1.1.1.1"]);
    const hostname = new URL(endpoint).hostname;
    let address; try { address = (await resolver.resolve4(hostname))[0]; } catch { /* System DNS may already know the new tunnel. */ }
    const { stdout: healthText } = await run("curl.exe", ["--silent", "--show-error", "--fail", "--connect-timeout", "5", "--max-time", "12", ...(address ? ["--resolve", hostname + ":443:" + address] : []), endpoint + "/health"], { windowsHide: true, timeout: 15000 });
    if (JSON.parse(healthText).service !== "paris-stays") throw new Error("Tunnel not ready");
    const { stdout } = await run("gh", ["auth", "token"], { windowsHide: true, timeout: 10000 });
    const token = stdout.trim();
    const route = "/repos/silmoon04/paris-stays/contents/runtime.json";
    const current = await github("GET", route + "?ref=gh-pages", token);
    const data = { version: 1, collectorUrl: endpoint, updatedAt: new Date().toISOString() };
    const existing = current?.content ? JSON.parse(Buffer.from(current.content, "base64").toString()) : null;
    if (existing?.collectorUrl !== endpoint) await github("PUT", route, token, { message: "Update optional laptop collector endpoint", branch: "gh-pages", content: Buffer.from(JSON.stringify(data) + "\n").toString("base64"), ...(current?.sha ? { sha: current.sha } : {}) });
    await writeFile(path.join(root, "public/runtime.json"), JSON.stringify(data) + "\n");
    await writeFile(path.join(directory, "endpoint.json"), JSON.stringify(data) + "\n");
    await log("Public endpoint updated; the existing GitHub Pages link stays unchanged.");
  } catch (error) {
    await log("Endpoint publication will retry: " + error.message);
    publishTimer = setTimeout(publishEndpoint, 60000);
  }
}
function tunnel() {
  if (stopping) return;
  const executable = process.env.PARIS_CLOUDFLARED || "cloudflared";
  child = spawn(executable, ["tunnel", "--config", path.join(directory, "quick-tunnel.yaml"), "--no-autoupdate", "--protocol", "http2", "--url", "http://127.0.0.1:8785"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  void writeFile(path.join(directory, "tunnel.log"), "");
  const output = chunk => {
    void appendFile(path.join(directory, "tunnel.log"), chunk.toString());
    buffer = (buffer + chunk.toString()).slice(-12000);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)?.find(url => url !== "https://api.trycloudflare.com");
    if (match && endpoint !== match) {
      endpoint = match;
      void writeFile(path.join(directory, "endpoint.json"), JSON.stringify({ version: 1, collectorUrl: endpoint, updatedAt: new Date().toISOString() }));
      void log("HTTPS tunnel established: " + endpoint);
      void publishEndpoint();
    }
  };
  child.stdout.on("data", output); child.stderr.on("data", output);
  child.on("error", error => { void log("Tunnel unavailable: " + error.message); });
  child.on("exit", () => { endpoint = undefined; if (!stopping) { void log("Tunnel disconnected; restarting in 30 seconds."); tunnelRetry = setTimeout(tunnel, 30000); } });
}
tunnel();
async function stop() {
  if (stopping) return; stopping = true;
  clearTimeout(publishTimer); clearTimeout(tunnelRetry); child?.kill();
  await collector.close(); process.exit(0);
}
process.on("SIGINT", stop); process.on("SIGTERM", stop);
