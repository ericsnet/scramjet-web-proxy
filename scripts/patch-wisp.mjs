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
		"constructor(ws, path, {TCPSocket, UDPSocket, ping_interval, wisp_version, wisp_extensions, username, isAdmin} = {}) {",
	).replace(
		"    this.path = path;",
		"    this.path = path;\n    this.username = username || \"\";\n    this.isAdmin = typeof isAdmin === \"function\" ? isAdmin : () => false;",
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
