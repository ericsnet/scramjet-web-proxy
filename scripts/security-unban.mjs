import { listBans, unbanIp } from "../security.js";

const value = String(process.argv[2] || "").trim();

if (!value || value === "--list") {
	const bans = listBans();
	if (!bans.length) {
		console.log("No hay IPs baneadas.");
	} else {
		for (const ban of bans) {
			console.log(
				`${ban.ip}\t${ban.kind || "manual"}\t${ban.by || "—"}\t${ban.reason || "—"}\t${ban.at}`,
			);
		}
	}
	process.exit(0);
}

const result = unbanIp(value);
if (result.error === "invalid-ip" || result.error === "notfound") {
	console.error(result.error === "notfound" ? "Esa IP no está baneada." : "IP no válida.");
	process.exit(1);
}
console.log(`Baneo retirado para ${value}. Reinicia webproxy para aplicarlo: sudo systemctl restart webproxy`);
