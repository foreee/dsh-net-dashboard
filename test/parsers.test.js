import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isLoopbackRequest,
  parseDns,
  parseIfconfig,
  parseNetstatIb,
  parseNetstatTcp,
  parseNetstatUdp,
  parseRouteGateway,
  parseWifiSummary
} from "../lib/index.js";

/** Minimal `ifconfig -a` excerpt (macOS). */
const IFCONFIG = `lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
	options=1203<RXCSUM,TXCSUM,TXSTATUS,SW_TIMESTAMP>
	inet 127.0.0.1 netmask 0xff000000
	inet6 ::1 prefixlen 128
	inet6 fe80::1%lo0 prefixlen 64 scopeid 0x1
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether da:36:aa:54:e3:be
	inet6 fe80::b:1c91:38a3:6b4a%en0 prefixlen 64 secured scopeid 0xd
	inet 172.16.6.53 netmask 0xfffffc00 broadcast 172.16.7.255
	status: active
utun2: flags=8051<UP,POINTOPOINT,RUNNING,MULTICAST> mtu 1380
`;

/** Minimal `netstat -ib` excerpt: link rows carry the byte counters, protocol rows repeat them. */
const NETSTAT_IB = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                      21222806     0 23592772903 21222806     0 23592772903     0
lo0        16384 127           localhost       21222806     - 23592772903 21222806     - 23592772903     -
en0        1500  <Link#15>    da:36:aa:54:e3:be 9000001     0 109045245571 3000000     0 23023646608     0
en0        1500  172.16.6.53   172.16.6.53    9000001     - 109045245571 3000000     - 23023646608     -
`;

/** Minimal `netstat -an -p tcp` excerpt. */
const NETSTAT_TCP = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)
tcp4       0      0  127.0.0.1.8080         127.0.0.1.51000        ESTABLISHED
tcp4       0      0  127.0.0.1.19387        127.0.0.1.51001        ESTABLISHED
tcp6       0      0  *.9000                 *.*                    LISTEN
tcp4       0      0  172.16.6.53.51000      1.2.3.4.443            TIME_WAIT
`;

/** Minimal `netstat -an -p udp` excerpt. */
const NETSTAT_UDP = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)
udp4       0      0  127.0.0.1.51002        *.*
udp6       0      0  *.5353                 *.*
`;

/** Minimal `route -n get default` excerpt. */
const ROUTE = `   route to: default
destination: default
       mask: default
    gateway: 172.16.4.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>
`;

/** Minimal `scutil --dns` excerpt. */
const DNS = `DNS configuration

resolver #1
  search domain[0] : lan
  nameserver[0] : 114.114.114.114
  nameserver[1] : 211.138.156.66
  if_index : 15 (en0)

resolver #2
  nameserver[0] : 114.114.114.114
  reach : 172.16.4.1
`;

test("parseIfconfig extracts names, MACs, both address families and flags", () => {
  const interfaces = parseIfconfig(IFCONFIG);
  assert.equal(interfaces.length, 3);

  const [loopback, ethernet, tunnel] = interfaces;
  assert.equal(loopback.name, "lo0");
  assert.deepEqual(loopback.ipv4, ["127.0.0.1"]);
  assert.deepEqual(loopback.ipv6, ["::1", "fe80::1%lo0"]);
  assert.equal(loopback.mtu, 16384);

  assert.equal(ethernet.name, "en0");
  assert.equal(ethernet.mac, "da:36:aa:54:e3:be");
  assert.deepEqual(ethernet.ipv4, ["172.16.6.53"]);
  assert.equal(ethernet.running, true);

  assert.equal(tunnel.name, "utun2");
  assert.equal(tunnel.mac, null);
  assert.deepEqual(tunnel.ipv4, []);
});

test("parseNetstatIb counts each interface once, at link-layer rows", () => {
  const counters = parseNetstatIb(NETSTAT_IB);
  assert.deepEqual([...counters.keys()], ["lo0", "en0"]);
  assert.deepEqual(counters.get("en0"), { ibytes: 109045245571, obytes: 23023646608 });
});

test("parseNetstatTcp breaks sockets down by state", () => {
  const result = parseNetstatTcp(NETSTAT_TCP);
  assert.equal(result.total, 4);
  assert.deepEqual(result.states, { ESTABLISHED: 2, LISTEN: 1, TIME_WAIT: 1 });
});

test("parseNetstatUdp counts UDP sockets only", () => {
  assert.equal(parseNetstatUdp(NETSTAT_UDP), 2);
});

test("parseRouteGateway reads the default route facts", () => {
  assert.deepEqual(parseRouteGateway(ROUTE), { interface: "en0", gateway: "172.16.4.1" });
});

test("parseDns keeps the first resolver order and deduplicates", () => {
  assert.deepEqual(parseDns(DNS), ["114.114.114.114", "211.138.156.66"]);
});

test("parseWifiSummary treats macOS redactions as absent fields", () => {
  const redacted = parseWifiSummary("    SSID : <redacted>\n    BSSID : <redacted>\n");
  assert.deepEqual(redacted, { ssid: null, rssi: null, noise: null, channel: null, txRate: null, bssid: null });

  const visible = parseWifiSummary("    SSID : Office-5G\n    RSSI : -52\n    noise : -90\n    channel : 44 (5GHz, 80MHz)\n");
  assert.equal(visible.ssid, "Office-5G");
  assert.equal(visible.rssi, -52);
  assert.equal(visible.noise, -90);
  assert.equal(visible.channel, "44 (5GHz, 80MHz)");
});

test("isLoopbackRequest enforces loopback socket, host header and same origin", () => {
  const make = (remoteAddress, headers) => ({ socket: { remoteAddress }, headers });
  assert.equal(isLoopbackRequest(make("127.0.0.1", { host: "127.0.0.1:19387" })), true);
  assert.equal(isLoopbackRequest(make("::ffff:127.0.0.1", { host: "localhost:19387" })), true);
  assert.equal(isLoopbackRequest(make("::1", { host: "[::1]:19387" })), true);
  assert.equal(isLoopbackRequest(make("192.168.1.9", { host: "127.0.0.1:19387" })), false);
  assert.equal(isLoopbackRequest(make("127.0.0.1", { host: "example.com" })), false);
  assert.equal(isLoopbackRequest(make("127.0.0.1", { host: "127.0.0.1:19387", origin: "https://evil.example" })), false);
  assert.equal(isLoopbackRequest(make("127.0.0.1", { host: "127.0.0.1:19387", origin: "http://127.0.0.1:19387" })), true);
});
