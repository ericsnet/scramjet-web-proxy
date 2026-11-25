import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(
	root,
	"..",
	"node_modules",
	"@mercuryworkshop",
	"wisp-js",
	"src",
	"server",
);

function patch(file, marker, transform) {
	const full = path.join(base, file);
	let text = fs.readFileSync(full, "utf8");
	if (text.includes(marker)) {
		console.log(`wisp-js: ${file} ya parcheado`);
		return;
	}
	const updated = transform(text);
	if (updated === text) {
		console.log(`wisp-js: aviso, no se pudo parchear ${file}`);
		return;
	}
	fs.writeFileSync(full, updated);
	console.log(`wisp-js: ${file} parcheado`);
}

patch("connection.mjs", "this.isAdmin", (text) =>
	text.replace(
		"constructor(ws, path, {TCPSocket, UDPSocket, ping_interval, wisp_version, wisp_extensions} = {}) {",
		"constructor(ws, path, {TCPSocket, UDPSocket, ping_interval, wisp_version, wisp_extensions, username, isAdmin, isHostBlocked} = {}) {",
	).replace(
		"    this.path = path;",
		"    this.path = path;\n    this.username = username || \"\";\n    this.isAdmin = typeof isAdmin === \"function\" ? isAdmin : () => false;\n    this.isHostBlocked = typeof isHostBlocked === \"function\" ? isHostBlocked : () => false;",
	),
);

patch("connection.mjs", "this.isHostBlocked", (text) =>
	text
		.replace(
			"wisp_extensions, username, isAdmin} = {}) {",
			"wisp_extensions, username, isAdmin, isHostBlocked} = {}) {",
		)
		.replace(
			"this.isAdmin = typeof isAdmin === \"function\" ? isAdmin : () => false;",
			"this.isAdmin = typeof isAdmin === \"function\" ? isAdmin : () => false;\n    this.isHostBlocked = typeof isHostBlocked === \"function\" ? isHostBlocked : () => false;",
		),
);

patch("filter.mjs", "const isAdmin = !!(connection", (text) =>
	text
		.replace(
			"  //check the hostname whitelist/blacklist\n  if (options.hostname_whitelist) {",
			"  const isAdmin = !!(connection && connection.isAdmin && connection.isAdmin());\n\n  //check the hostname whitelist/blacklist\n  if (options.hostname_whitelist && !isAdmin) {",
		)
		.replace(
			"  else if (options.hostname_blacklist) {",
			"  else if (options.hostname_blacklist && !isAdmin) {",
		),
);

patch("filter.mjs", "connection.isHostBlocked", (text) =>
	text.replace(
		"  //check if the port is blocked",
		"  if (!isAdmin && connection && typeof connection.isHostBlocked === \"function\" && connection.isHostBlocked(hostname))\n    return close_reasons.HostBlocked;\n\n  //check if the port is blocked",
	),
);

patch("filter.mjs", "embedded_ipv4", (text) =>
	text
		.replace(
			"function check_ip_range(ip, range) {\n  return range.includes(ip.range());\n}",
			"function check_ip_range(ip, range) {\n  return range.includes(ip.range());\n}\n\nfunction embedded_ipv4(ip) {\n  if (!ip || ip.kind() !== \"ipv6\") return null;\n  if (ip.range() !== \"rfc6052\" && ip.range() !== \"rfc6145\") return null;\n  const high = ip.parts[6] || 0;\n  const low = ip.parts[7] || 0;\n  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;\n}",
		)
		.replace(
			"  if (ip.range() === \"ipv4Mapped\") \n    ip = ip.toIPv4Address();",
			"  if (ip.range() === \"ipv4Mapped\") \n    ip = ip.toIPv4Address();\n\n  const embedded = embedded_ipv4(ip);\n  if (embedded && is_ip_blocked(embedded)) return true;",
		),
);
