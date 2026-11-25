import { clearMfa, getUser, listUsers } from "../auth.js";

const username = String(process.argv[2] || "").trim();
if (!username) {
	console.log("Uso: npm run mfa:reset -- usuario");
	console.log("\nUsuarios con MFA activada:");
	for (const user of listUsers()) {
		if (user.mfaEnabled) console.log(` - ${user.username} (${user.role})`);
	}
	process.exit(0);
}
const user = getUser(username);
if (!user) {
	console.error(`No existe el usuario ${username}.`);
	process.exit(1);
}
clearMfa(user.username);
console.log(`MFA desactivada para ${user.username}.`);
