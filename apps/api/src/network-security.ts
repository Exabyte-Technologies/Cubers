import ipaddr from "ipaddr.js";
import proxyaddr from "proxy-addr";
import type { IncomingMessage } from "node:http";

// Forwarded headers are usable only across an explicitly trusted proxy hop.
// Never use hop counts: a shorter route could let a caller supply its own IP.
export function proxyTrust(cidrs: string) {
  const entries = cidrs
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of entries) {
    if (entry.includes("/")) {
      const [address, bits] = ipaddr.parseCIDR(entry);
      if (
        (address.kind() === "ipv4" && bits < 8) ||
        (address.kind() === "ipv6" && bits < 16)
      )
        throw new Error("Proxy trust must name a specific network");
    } else ipaddr.parse(entry);
  }
  return entries.length ? proxyaddr.compile(entries) : () => false;
}
export function clientIp(request: IncomingMessage, cidrs: string) {
  const address = proxyaddr(request, proxyTrust(cidrs));
  return ipaddr.process(address).toString();
}
export function allowedOrigin(origin: unknown, origins: string[]) {
  // Native clients have no browser Origin. Authentication is still mandatory.
  return (
    origin === undefined ||
    (typeof origin === "string" && origins.includes(origin))
  );
}
export function privateAddress(address: string) {
  try {
    const ip = ipaddr.parse(address);
    if (ip.range() !== "unicast") return true;
    if (ip.kind() === "ipv6") {
      const v6 = ip as ipaddr.IPv6;
      // Permit global unicast only. Transition, mapped, local, documentation,
      // multicast and reserved networks cannot be AI service destinations.
      return (
        !v6.match(ipaddr.parse("2000::") as ipaddr.IPv6, 3) ||
        v6.match(ipaddr.parse("2001::") as ipaddr.IPv6, 23) ||
        v6.match(ipaddr.parse("2002::") as ipaddr.IPv6, 16)
      );
    }
    return false;
  } catch {
    return true;
  }
}
