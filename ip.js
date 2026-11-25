import net from "node:net";

export function normalizeIp(value) {
	let address = String(value || "").trim();
	if (address.startsWith("[") && address.endsWith("]")) {
		address = address.slice(1, -1);
	}
	if (address.startsWith("::ffff:")) {
		const ipv4 = address.slice(7);
		if (net.isIP(ipv4) === 4) return ipv4;
	}
	return address;
}

export function preferredIp(addresses) {
	const list = (Array.isArray(addresses) ? addresses : [addresses])
		.map(normalizeIp)
		.filter((address) => net.isIP(address));
	return list.find((address) => net.isIP(address) === 4) || list[0] || "";
}
