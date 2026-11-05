/**
 * dsh-net-dashboard - host half.
 *
 * Mounts one loopback-only HTTP route family that answers the browser
 * dashboard with a live snapshot of this machine's network quality:
 *
 *   GET /api/net-dashboard/snapshot
 *
 * Snapshot sections (every section is independent; a failing collector
 * degrades only its own field and reports into `errors`):
 *
 *   - interfaces  `ifconfig -a`            name / MAC / IPv4 / IPv6 / flags
 *   - primary     `route -n get default`   default interface + gateway
 *   - wifi        `ipconfig getsummary`    SSID / RSSI / noise / channel
 *   - dns         `scutil --dns`           resolver order
 *   - traffic     `netstat -ib`            per-interface byte counters, with
 *                                          per-refresh rates computed against
 *                                          the previous sample kept in memory
 *   - sessions    `netstat -an -p tcp|udp` TCP state breakdown + UDP sockets
 *   - latency     long-lived `ping -i 1`   gateway + configurable targets;
 *                                          rolling window of recent samples
 *   - publicIp    ipapi.co / ipify         cached for 10 minutes (optional)
 *
 * Latency is collected by persistent `ping` child processes (one per target,
 * 1s interval) so the snapshot route only reads fresh in-memory state — the
 * 3s dashboard poll never spawns command storms. Processes are killed and
 * restarted on gateway changes and disposed with the plugin fiber.
 */

import { execFile, spawn } from "node:child_process";
import { isIPv4 } from "node:net";
import os from "node:os";

/** Stable cordis plugin name. */
export const name = "dsh-net-dashboard";

/** Host services this plugin waits for. */
export const inject = ["webServer"];

/** Route paths; the browser bundle mirrors these literals. */
export const ROUTES = Object.freeze({
  snapshot: "/api/net-dashboard/snapshot"
});

/** Secondary public latency target used when no explicit config names one. */
export const DEFAULT_PUBLIC_TARGET = "223.5.5.5";
/** How long the public IP lookup result stays fresh, in ms. */
const PUBLIC_IP_TTL_MS = 10 * 60 * 1000;
/** Latency window kept per target (one sample per second, ~3 minutes). */
const LATENCY_WINDOW = 180;
/** Default bound on one collector command, in ms. */
const CMD_TIMEOUT_MS = 2500;

//#region bounded command helpers

/**
 * Run one command and resolve its stdout.
 * @param {string} file executable path
 * @param {string[]} args arguments
 * @param {number} [timeoutMs] kill bound
 * @returns {Promise<string>} stdout text
 */
function run(file, args, timeoutMs = CMD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? ""));
    });
  });
}

/**
 * Run one command and resolve its stdout, or null when anything fails.
 * @param {string} file executable path
 * @param {string[]} args arguments
 * @param {number} [timeoutMs] kill bound
 * @returns {Promise<string|null>} stdout text or null
 */
async function runOptional(file, args, timeoutMs) {
  try {
    return await run(file, args, timeoutMs);
  } catch {
    return null;
  }
}

//#endregion

//#region trust fence (mirrors the official plugin family loopback guard)

/** Whether a host string names the loopback authority. */
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  return isIPv4(hostname) && hostname.startsWith("127.");
}

/** Whether a socket address is loopback. */
function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  if (address.startsWith("::ffff:")) address = address.slice(7);
  if (address === "::1") return true;
  return isIPv4(address) && address.startsWith("127.");
}

/**
 * Request-level trust fence: loopback socket AND loopback Host header, plus
 * browser same-origin markers. Paired remote devices are deliberately not
 * allowed: only the machine's own GUI may read the dashboard.
 * @param {import("node:http").IncomingMessage} request incoming request
 * @returns {boolean} whether the request may enter the dashboard routes
 */
export function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket && request.socket.remoteAddress)) return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

//#endregion

//#region command output parsers

/**
 * Parse `ifconfig -a` into per-interface records.
 * @param {string} text command output
 * @returns {Array<object>} interface records
 */
export function parseIfconfig(text) {
  const interfaces = [];
  let current = null;
  const ensure = (name) => {
    current = interfaces.find((entry) => entry.name === name);
    if (current === undefined) {
      current = { name, mac: null, ipv4: [], ipv6: [], running: false, mtu: null };
      interfaces.push(current);
    }
    return current;
  };
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.replace(/\t/g, "    ");
    const nameMatch = line.match(/^([A-Za-z0-9_.-]+):\s+flags=/);
    if (nameMatch) {
      const entry = ensure(nameMatch[1]);
      entry.running = /POINTOPOINT|RUNNING|UP/.test(line) && /\bUP\b/.test(line);
      const mtuMatch = line.match(/\bmtu\s+(\d+)/);
      if (mtuMatch) entry.mtu = Number(mtuMatch[1]);
      continue;
    }
    if (current === null) continue;
    const trimmed = line.trim();
    const etherMatch = trimmed.match(/^ether\s+([0-9a-fA-F:]{12,17})/);
    if (etherMatch) {
      current.mac = etherMatch[1].toLowerCase();
      continue;
    }
    const inet4Match = trimmed.match(/^inet\s+(\d+\.\d+\.\d+\.\d+)/);
    if (inet4Match) {
      current.ipv4.push(inet4Match[1]);
      continue;
    }
    const inet6Match = trimmed.match(/^inet6\s+([0-9A-Fa-f:]+)(?:%([A-Za-z0-9_.-]+))?/);
    if (inet6Match) {
      current.ipv6.push(inet6Match[2] ? `${inet6Match[1]}%${inet6Match[2]}` : inet6Match[1]);
    }
  }
  return interfaces;
}

/**
 * Parse `netstat -ib` into link-layer byte counters (the `<Link#n>` row of
 * each interface; protocol rows repeat the same counters and are skipped).
 * @param {string} text command output
 * @returns {Map<string, {ibytes: number, obytes: number}>} counters by name
 */
export function parseNetstatIb(text) {
  const counters = new Map();
  for (const line of String(text ?? "").split("\n").slice(1)) {
    const cells = line.trim().split(/\s+/);
    if (cells.length < 10) continue;
    const network = cells[2];
    if (typeof network !== "string" || !network.startsWith("<Link")) continue;
    // The optional Address cell shifts the fixed columns; the trailing seven
    // numeric columns (Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll) never move.
    const tail = cells.slice(-7).map(Number);
    const [ibytes, obytes] = [tail[2], tail[5]];
    if (!Number.isFinite(ibytes) || !Number.isFinite(obytes)) continue;
    counters.set(cells[0], { ibytes, obytes });
  }
  return counters;
}

/**
 * Parse `netstat -an -p tcp` into a state breakdown.
 * @param {string} text command output
 * @returns {{total: number, states: Record<string, number>}} breakdown
 */
export function parseNetstatTcp(text) {
  const states = {};
  let total = 0;
  for (const line of String(text ?? "").split("\n")) {
    const cells = line.trim().split(/\s+/);
    if (cells.length < 6 || !/^tcp[46]$/.test(cells[0] ?? "")) continue;
    const state = cells[cells.length - 1];
    if (!/^[A-Z_]+$/.test(state)) continue;
    total += 1;
    states[state] = (states[state] ?? 0) + 1;
  }
  return { total, states };
}

/**
 * Parse `netstat -an -p udp` into a socket count.
 * @param {string} text command output
 * @returns {number} UDP socket count
 */
export function parseNetstatUdp(text) {
  let total = 0;
  for (const line of String(text ?? "").split("\n")) {
    const cells = line.trim().split(/\s+/);
    if (cells.length >= 4 && /^udp[46]$/.test(cells[0] ?? "")) total += 1;
  }
  return total;
}

/**
 * Parse `route -n get default` into the primary interface and gateway.
 * @param {string} text command output
 * @returns {{interface: string|null, gateway: string|null}} primary facts
 */
export function parseRouteGateway(text) {
  let gateway = null;
  let iface = null;
  for (const line of String(text ?? "").split("\n")) {
    const gw = line.match(/^\s*gateway:\s*(\S+)/);
    if (gw) gateway = gw[1];
    const ifMatch = line.match(/^\s*interface:\s*(\S+)/);
    if (ifMatch) iface = ifMatch[1];
  }
  return { interface: iface, gateway };
}

/**
 * Parse `scutil --dns` into the ordered resolver list (deduplicated, first 4).
 * @param {string} text command output
 * @returns {string[]} resolver addresses
 */
export function parseDns(text) {
  const servers = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = line.match(/nameserver\[\d+\]\s*:\s*(\S+)/);
    if (match && !servers.includes(match[1])) servers.push(match[1]);
    if (servers.length >= 4) break;
  }
  return servers;
}

/**
 * Parse `ipconfig getsummary <if>` into Wi-Fi facts (macOS 11+ output).
 * @param {string} text command output
 * @returns {object|null} Wi-Fi facts or null when absent
 */
export function parseWifiSummary(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const ssid = text.match(/^\s*SSID\s*:\s*(.+)$/m);
  const rssi = text.match(/^\s*RSSI\s*:\s*(-?\d+)/m);
  const noise = text.match(/^\s*noise\s*:\s*(-?\d+)/m);
  const channel = text.match(/^\s*channel\s*:\s*(.+)$/m);
  const speed = text.match(/lastTxRate\s*:\s*(\d+)/);
  const bssid = text.match(/^\s*BSSID\s*:\s*(\S+)$/m);
  if (ssid === null && rssi === null) return null;
  const cleanText = (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 || /^<(redacted|hidden)>$/i.test(trimmed) ? null : trimmed;
  };
  return {
    ssid: ssid ? cleanText(ssid[1]) : null,
    rssi: rssi ? Number(rssi[1]) : null,
    noise: noise ? Number(noise[1]) : null,
    channel: channel ? cleanText(channel[1]) : null,
    txRate: speed ? Number(speed[1]) : null,
    bssid: bssid ? cleanText(bssid[1]) : null
  };
}

//#endregion

//#region persistent pinger

/**
 * One long-lived `ping -i 1 <target>` process. Parses every reply into a
 * sample, counts request timeouts as losses, and restarts itself (2s delay)
 * when the process exits for any reason other than an explicit stop.
 */
class Pinger {
  /** @type {Array<{ts: number, ms: number|null}>} rolling sample window */
  window = [];
  sent = 0;
  received = 0;

  /**
   * @param {string} target IP address or host to ping
   * @param {(level: string, message: string) => void} log logger
   */
  constructor(target, log = () => {}) {
    this.target = target;
    this.log = log;
    this.stopped = false;
    this.child = null;
    this.buffer = "";
  }

  /** Start (or restart) the background ping process. */
  start() {
    if (this.stopped || this.child !== null) return;
    try {
      this.child = spawn("/sbin/ping", ["-i", "1", "-W", "1000", this.target], {
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      this.log("warn", `ping ${this.target} spawn failed: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleRestart();
      return;
    }
    this.log("info", `pinging ${this.target}`);
    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk) => this.consume(String(chunk)));
    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk) => this.consume(String(chunk)));
    this.child.on("close", () => {
      this.child = null;
      if (!this.stopped) this.scheduleRestart();
    });
    this.child.on("error", () => {
      /* close follows; scheduleRestart happens there */
    });
  }

  /** Feed one output chunk through the line parser. */
  consume(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      this.consumeLine(line.trim());
    }
  }

  /** Parse one ping output line into a sample. */
  consumeLine(line) {
    if (line.length === 0) return;
    const now = Date.now();
    const reply = line.match(/time[=<]\s*([\d.]+)\s*ms/i);
    if (reply) {
      this.sent += 1;
      this.received += 1;
      this.push({ ts: now, ms: Number(reply[1]) });
      return;
    }
    if (/Request timeout/i.test(line) || /^no answer/i.test(line)) {
      this.sent += 1;
      this.push({ ts: now, ms: null });
      return;
    }
    if (/(unreachable|timed out|100\.0% packet loss|Network is down|cannot resolve)/i.test(line)) {
      this.sent += 1;
      this.push({ ts: now, ms: null });
    }
  }

  /** Append one sample to the rolling window. */
  push(sample) {
    this.window.push(sample);
    if (this.window.length > LATENCY_WINDOW * 2) this.window.splice(0, this.window.length - LATENCY_WINDOW * 2);
  }

  /** Restart after a short delay, unless stopped in the meantime. */
  scheduleRestart() {
    if (this.stopped || this.restartTimer !== undefined) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.start();
    }, 2000);
  }

  /** Kill the process and stop restarting. */
  stop() {
    this.stopped = true;
    if (this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.child !== null) {
      try {
        this.child.kill();
      } catch {}
      this.child = null;
    }
  }

  /** Project the rolling window into the snapshot face. */
  describe(label, role) {
    const cutoff = Date.now() - 120 * 1000;
    const recent = this.window.filter((sample) => sample.ts >= cutoff).slice(-120);
    const values = recent.filter((sample) => sample.ms !== null).map((sample) => sample.ms);
    const sum = values.reduce((acc, value) => acc + value, 0);
    const windowSent = recent.length;
    return {
      key: this.target,
      label,
      role,
      target: this.target,
      alive: this.child !== null,
      last: values.length > 0 ? values[values.length - 1] : null,
      avg: values.length > 0 ? Math.round((sum / values.length) * 100) / 100 : null,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      jitter: values.length > 1 ? Math.round(stddev(values) * 100) / 100 : null,
      lossPct: windowSent > 0 ? Math.round(((windowSent - values.length) / windowSent) * 1000) / 10 : null,
      sent: windowSent,
      received: values.length,
      samples: recent.map((sample) => sample.ms)
    };
  }
}

/** Population standard deviation of a numeric array. */
function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

//#endregion

//#region public IP lookup (optional, cached)

/**
 * Fetch the public IP facts. Tries ipapi.co first (IP + location in one
 * call), falls back to ipify for the bare address. Bounded and failure-free.
 * @returns {Promise<{ip: string|null, location: string|null}>} facts
 */
export async function lookupPublicIp() {
  try {
    const response = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    if (response.ok) {
      const body = await response.json();
      if (body && typeof body.ip === "string") {
        const place = [body.city, body.region, body.country_name].filter((part) => typeof part === "string" && part.length > 0).join(" · ");
        return { ip: body.ip, location: place || null };
      }
    }
  } catch {}
  try {
    const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
    if (response.ok) {
      const body = await response.json();
      if (body && typeof body.ip === "string") return { ip: body.ip, location: null };
    }
  } catch {}
  return { ip: null, location: null };
}

//#endregion

//#region collector

/**
 * Snapshot collector: owns the traffic rate state and the pinger pool, and
 * assembles the full snapshot face per HTTP request.
 */
export class NetCollector {
  /**
   * @param {object} [options] collector options
   * @param {string[]} [options.extraTargets] extra ping targets besides the gateway
   * @param {boolean} [options.publicIpEnabled] whether the public IP lookup runs
   * @param {(level: string, message: string) => void} [options.log] logger
   */
  constructor(options = {}) {
    this.extraTargets = Array.isArray(options.extraTargets) ? options.extraTargets.filter((target) => typeof target === "string" && target.length > 0) : [];
    this.publicIpEnabled = options.publicIpEnabled !== false;
    this.log = options.log ?? (() => {});
    /** @type {Map<string, {ibytes: number, obytes: number, ts: number}>} previous traffic sample */
    this.prevTraffic = new Map();
    /** @type {string|null} interface the gateway pinger currently follows */
    this.gatewayPingerTarget = null;
    /** @type {Pinger|null} pinger bound to the current default gateway */
    this.gatewayPinger = null;
    /** @type {Map<string, Pinger>} static extra pingers by target */
    this.extraPingers = new Map();
    this.publicIp = { ip: null, location: null, fetchedAt: 0, refreshing: false };
    this.disposed = false;
  }

  /** Start the latency background processes. */
  start() {
    for (const target of this.extraTargets) this.ensureExtraPinger(target);
  }

  /** Stop every background process. */
  stop() {
    this.disposed = true;
    this.gatewayPinger?.stop();
    this.gatewayPinger = null;
    for (const pinger of this.extraPingers.values()) pinger.stop();
    this.extraPingers.clear();
  }

  /** Create one extra-target pinger when absent. */
  ensureExtraPinger(target) {
    let pinger = this.extraPingers.get(target);
    if (pinger === undefined) {
      pinger = new Pinger(target, this.log);
      this.extraPingers.set(target, pinger);
      if (!this.disposed) pinger.start();
    }
    return pinger;
  }

  /** Keep the gateway pinger bound to the current default gateway. */
  ensureGatewayPinger(gateway) {
    if (typeof gateway !== "string" || !isIPv4(gateway)) {
      if (this.gatewayPinger !== null) {
        this.gatewayPinger.stop();
        this.gatewayPinger = null;
        this.gatewayPingerTarget = null;
      }
      return;
    }
    if (this.gatewayPingerTarget === gateway && this.gatewayPinger !== null) return;
    this.gatewayPinger?.stop();
    this.gatewayPinger = new Pinger(gateway, this.log);
    this.gatewayPingerTarget = gateway;
    if (!this.disposed) this.gatewayPinger.start();
  }

  /** Refresh the cached public IP facts when stale. */
  async refreshPublicIp() {
    if (!this.publicIpEnabled || this.publicIp.refreshing) return;
    if (Date.now() - this.publicIp.fetchedAt < PUBLIC_IP_TTL_MS) return;
    this.publicIp.refreshing = true;
    try {
      const facts = await lookupPublicIp();
      this.publicIp = { ip: facts.ip, location: facts.location, fetchedAt: Date.now(), refreshing: false };
    } catch {
      this.publicIp = { ...this.publicIp, fetchedAt: Date.now(), refreshing: false };
    }
  }

  /**
   * Assemble one snapshot. Safe to call concurrently; every collector is
   * independent and failure-tolerant.
   * @returns {Promise<object>} snapshot face
   */
  async snapshot() {
    const errors = [];
    const startedAt = Date.now();

    const [ifconfigText, routeText, netstatIbText, tcpText, udpText, dnsText] = await Promise.all([
      runOptional("/sbin/ifconfig", ["-a"]),
      runOptional("/sbin/route", ["-n", "get", "default"]),
      runOptional("/usr/sbin/netstat", ["-ib"]),
      runOptional("/usr/sbin/netstat", ["-an", "-p", "tcp"]),
      runOptional("/usr/sbin/netstat", ["-an", "-p", "udp"]),
      runOptional("/usr/sbin/scutil", ["--dns"])
    ]);
    if (ifconfigText === null) errors.push("ifconfig failed");
    if (routeText === null) errors.push("route failed");
    if (netstatIbText === null) errors.push("netstat -ib failed");
    if (tcpText === null) errors.push("netstat tcp failed");
    if (udpText === null) errors.push("netstat udp failed");

    const interfaces = ifconfigText !== null ? parseIfconfig(ifconfigText) : [];
    const primary = routeText !== null ? parseRouteGateway(routeText) : { interface: null, gateway: null };
    const wifi = primary.interface !== null
      ? parseWifiSummary(await runOptional("/usr/sbin/ipconfig", ["getsummary", primary.interface], 2000))
      : null;

    const dns = dnsText !== null ? parseDns(dnsText) : [];

    // Traffic: link-layer counters + per-refresh rates against the previous sample.
    const now = Date.now();
    const counters = netstatIbText !== null ? parseNetstatIb(netstatIbText) : new Map();
    const perInterface = [];
    let totalIrate = 0;
    let totalOrate = 0;
    for (const [name, sample] of counters) {
      const prev = this.prevTraffic.get(name);
      const loopback = /^lo\d*$/.test(name);
      let irate = null;
      let orate = null;
      if (prev !== undefined) {
        const dt = (now - prev.ts) / 1000;
        if (dt > 0.2 && sample.ibytes >= prev.ibytes && sample.obytes >= prev.obytes) {
          irate = Math.max(0, Math.round((sample.ibytes - prev.ibytes) / dt));
          orate = Math.max(0, Math.round((sample.obytes - prev.obytes) / dt));
          if (!loopback) {
            totalIrate += irate;
            totalOrate += orate;
          }
        }
      }
      this.prevTraffic.set(name, { ibytes: sample.ibytes, obytes: sample.obytes, ts: now });
      perInterface.push({ name, ibytes: sample.ibytes, obytes: sample.obytes, irate, orate, loopback });
    }
    if (this.prevTraffic.size > 64) {
      for (const name of this.prevTraffic.keys()) {
        if (!counters.has(name)) this.prevTraffic.delete(name);
      }
    }

    // Sessions.
    const tcp = tcpText !== null ? parseNetstatTcp(tcpText) : { total: 0, states: {} };
    const udpTotal = udpText !== null ? parseNetstatUdp(udpText) : 0;

    // Latency: bind the gateway pinger, then project all windows.
    this.ensureGatewayPinger(primary.gateway);
    const latency = [];
    if (this.gatewayPinger !== null) latency.push(this.gatewayPinger.describe("gateway", "gateway"));
    for (const [target, pinger] of this.extraPingers) latency.push(pinger.describe(target, "target"));

    // Public IP: cached, refreshed in the background when stale.
    const publicIpPromise = this.refreshPublicIp();

    const primaryEntry = primary.interface !== null ? interfaces.find((entry) => entry.name === primary.interface) : undefined;
    if (primary.interface !== null && primaryEntry === undefined) errors.push("primary interface missing from ifconfig");

    await publicIpPromise;

    return {
      ts: Date.now(),
      elapsedMs: Date.now() - startedAt,
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      interfaces,
      primary: {
        interface: primary.interface,
        gateway: primary.gateway,
        ipv4: primaryEntry?.ipv4[0] ?? null,
        ipv6: primaryEntry?.ipv6.find((address) => !address.startsWith("fe80:")) ?? null,
        mac: primaryEntry?.mac ?? null
      },
      wifi,
      dns,
      traffic: {
        perInterface,
        totals: { irate: totalIrate, orate: totalOrate }
      },
      sessions: {
        tcpTotal: tcp.total,
        udpTotal,
        states: Object.entries(tcp.states).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count)
      },
      latency,
      publicIp: {
        ip: this.publicIpEnabled ? this.publicIp.ip : null,
        location: this.publicIpEnabled ? this.publicIp.location : null,
        fetchedAt: this.publicIpEnabled && this.publicIp.fetchedAt > 0 ? this.publicIp.fetchedAt : null
      },
      errors
    };
  }
}

//#endregion

//#region cordis plugin

const JSON_HEADERS = Object.freeze({ "content-type": "application/json; charset=utf-8" });

/** Serialize one JSON body. */
function writeJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

/**
 * Mount the snapshot route.
 * @param {object} ctx host plugin context carrying webServer
 * @param {object} [config] plugin config
 * @param {boolean} [config.enabled] set false to disable the plugin body
 * @param {string[]} [config.pingTargets] extra latency targets (the gateway is always followed)
 * @param {boolean} [config.publicIp] enable the cached public IP lookup (default true)
 */
export function apply(ctx, config = {}) {
  if (config && config.enabled === false) return;
  const log = (level, message) => {
    try {
      if (ctx.logger && typeof ctx.logger[level] === "function") ctx.logger[level]("dsh-net-dashboard: " + message);
    } catch {}
  };

  const collector = new NetCollector({
    extraTargets: Array.isArray(config?.pingTargets) && config.pingTargets.length > 0 ? config.pingTargets : [DEFAULT_PUBLIC_TARGET],
    publicIpEnabled: config?.publicIp !== false,
    log
  });

  ctx.effect(() => {
    collector.start();
    const disposeRoute = ctx.webServer.register({
      kind: "exact",
      path: ROUTES.snapshot,
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { error: "forbidden: loopback-only" });
        if (req.method !== "GET") return writeJson(res, 405, { error: "method not allowed: " + req.method });
        try {
          writeJson(res, 200, await collector.snapshot());
        } catch (error) {
          log("warn", "snapshot error: " + (error instanceof Error ? error.stack : String(error)));
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
    log("info", "snapshot route mounted at " + ROUTES.snapshot);
    return () => {
      disposeRoute();
      collector.stop();
    };
  }, "dsh-net-dashboard: route + pingers");
}

//#endregion
