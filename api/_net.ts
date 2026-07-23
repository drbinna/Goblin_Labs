// SSRF guard: fetch a user-supplied URL only after confirming every resolved
// IP is publicly routable, and re-check on each redirect hop (defends against
// redirect-to-internal and the cloud metadata endpoint at 169.254.169.254).
import dns from "node:dns/promises";
import net from "node:net";

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || // this-net, private, loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local (metadata)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast / reserved
  );
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true; // link-local, ULA
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

function isPrivateAddr(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) return isPrivateV6(ip);
  return true; // not an IP literal → treat as unsafe
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname) && isPrivateAddr(hostname)) throw new Error("blocked host");
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length) throw new Error("unresolvable host");
  for (const { address } of addrs) if (isPrivateAddr(address)) throw new Error("blocked host");
}

// Fetch that validates the target (and each redirect) is a public http(s) host.
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 3,
): Promise<Response> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("http(s) URLs only");
    await assertPublicHost(url.hostname);
    const res = await fetch(url.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url); // re-validated next loop
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}
