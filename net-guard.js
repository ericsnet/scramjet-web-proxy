import dns from "node:dns/promises";
import net from "node:net";

function ipv4ToBytes(value) {
	const parts = value.split(".").map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
		return null;
	}
	return parts;
}

function ipv6ToBytes(value) {
	let text = String(value || "").toLowerCase();
	if (text.includes("%")) return null; // zonas (fe80::1%eth0) no permitidas
	if (net.isIP(text) !== 6) return null;

	const embedded = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
	if (embedded) {
		const bytes = ipv4ToBytes(embedded[2]);
		if (!bytes) return null;
		const high = ((bytes[0] << 8) | bytes[1]).toString(16);
		const low = ((bytes[2] << 8) | bytes[3]).toString(16);
		text = `${embedded[1]}${high}:${low}`;
	}

	const [left, right] = text.split("::");
	const leftGroups = left ? left.split(":") : [];
	const rightGroups = right ? right.split(":") : [];
	const zeros = 8 - leftGroups.length - rightGroups.length;
	if (zeros < 0) return null;
	const groups = [...leftGroups, ...Array(zeros).fill("0"), ...rightGroups];
	if (groups.length !== 8) return null;
	const bytes = [];
	for (const group of groups) {
		const number = Number.parseInt(group || "0", 16);
		if (!Number.isInteger(number) || number < 0 || number > 0xffff) return null;
		bytes.push(number >> 8, number & 0xff);
	}
	return bytes;
}

function containsPrivateIpv4(bytes) {
	const p = bytes;
	if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
	if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
	if (p[0] === 169 && p[1] === 254) return true;
	if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
	if (p[0] === 192 && p[1] === 168) return true;
	if (p[0] === 192 && p[1] === 0 && [0, 2].includes(p[2])) return true;
	if (p[0] === 192 && p[1] === 88 && p[2] === 99) return true;
	if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
	if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;
	if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;
	if (p[0] >= 224) return true;
	return false;
}

export function isPrivateIp(address) {
	const value = String(address || "").toLowerCase().trim();
	const version = net.isIP(value);

	if (version === 4) return containsPrivateIpv4(ipv4ToBytes(value) || []);

	if (version === 6) {
		const b = ipv6ToBytes(value);
		if (!b) return true;
		const allZero = b.every((x) => x === 0);
		if (allZero) return true; // ::
		const loopback = b.slice(0, 15).every((x) => x === 0) && b[15] === 1;
		if (loopback) return true; // ::1
		if ((b[0] & 0xfe) === 0xfc) return true; // ULA fc00::/7
		if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
		if (b[0] === 0xff) return true; // multicast
		if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // doc 2001:db8::/32
		if (b[0] === 0x20 && b[1] === 0x02) return true; // 6to4 2002::/16
		if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // Teredo 2001::/32

		// IPv4-mapped (::ffff:0:0/96) e IPv4-compatible (::/96).
		const firstTenZero = b.slice(0, 10).every((x) => x === 0);
		const mapped = firstTenZero && b[10] === 0xff && b[11] === 0xff;
		const compatible = b.slice(0, 12).every((x) => x === 0);
		if (mapped || compatible) return containsPrivateIpv4(b.slice(12));

		// NAT64 (64:ff9b::/96) puede alcanzar IPv4 privadas.
		if (
			b[0] === 0x00 &&
			b[1] === 0x64 &&
			b[2] === 0xff &&
			b[3] === 0x9b &&
			b.slice(4, 12).every((x) => x === 0)
		) {
			return containsPrivateIpv4(b.slice(12));
		}
		return false;
	}

	return false;
}

export async function isPrivateDestination(hostname) {
	const host = String(hostname || "")
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "")
		.toLowerCase();
	if (!host || host.includes("%")) return true;
	if (net.isIP(host)) return isPrivateIp(host);
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	try {
		const addresses = await dns.lookup(host, { all: true, verbatim: true });
		if (!addresses.length) return true;
		return addresses.some((entry) => isPrivateIp(entry.address));
	} catch {
		return true;
	}
}
