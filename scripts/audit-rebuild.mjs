import { addAudit, flushAudit, rebuildAuditHashes, verifyAudit } from "../audit.js";

const before = verifyAudit();
console.log("Antes:", before.ok ? `íntegra (${before.count} eventos)` : `rota en el evento ${before.index}`);
const after = rebuildAuditHashes();
if (!after.ok) {
	console.error("No se pudo reconstruir la cadena.");
	process.exit(1);
}
addAudit({
	actor: "sistema",
	action: "audit.rebuild",
	detail: "Reconstrucción manual de la cadena de auditoría",
});
flushAudit();
const final = verifyAudit();
console.log("Después:", final.ok ? `íntegra (${final.count} eventos)` : `rota en el evento ${final.index}`);
