import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "audit.json");
const MAX_EVENTS = 3000;

let events = [];
let timer = null;
let dirty = false;

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		if (Array.isArray(data.events)) events = data.events;
	} catch (err) {
		console.error("No se pudo cargar audit.json:", err.message);
		events = [];
	}
}

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify({ events }, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (err) {
		console.error("No se pudo guardar audit.json:", err.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (timer) return;
	timer = setTimeout(() => {
		timer = null;
		saveNow();
	}, 800);
	timer.unref?.();
}

export function addAudit({
	actor = "sistema",
	action,
	target = "",
	detail = "",
	ip = "",
	userAgent = "",
} = {}) {
	if (!action) return;
	events.push({
		at: new Date().toISOString(),
		actor: String(actor || "sistema").slice(0, 64),
		action: String(action).slice(0, 64),
		target: String(target || "").slice(0, 128),
		detail: String(detail || "").slice(0, 500),
		ip: String(ip || "").slice(0, 64),
		userAgent: String(userAgent || "").slice(0, 200),
	});
	if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
	scheduleSave();
}

export function listAudit({ actor = "", action = "", limit = 300 } = {}) {
	const wantedActor = String(actor || "").toLowerCase();
	const wantedAction = String(action || "").toLowerCase();
	const out = [];
	for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
		const e = events[i];
		if (wantedActor && String(e.actor).toLowerCase() !== wantedActor) continue;
		if (wantedAction && String(e.action).toLowerCase() !== wantedAction) continue;
		out.push(e);
	}
	return out;
}

export function auditCount() {
	return events.length;
}

export function auditActions() {
	return [...new Set(events.map((e) => e.action))].sort();
}

export function clearAudit() {
	events = [];
	dirty = true;
	saveNow();
}

export function clearQuarantineAttempts() {
	events = events.filter((e) => e.action !== "quarantine.attempt");
	dirty = true;
	saveNow();
}

export function exportAudit() {
	return JSON.parse(JSON.stringify(events));
}

export function auditToCsv({ actor = "", action = "" } = {}) {
	const rows = listAudit({ actor, action, limit: MAX_EVENTS });
	const escape = (value) => {
		let text = String(value ?? "");
		if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
		return `"${text.replaceAll('"', '""')}"`;
	};
	const header = ["fecha", "actor", "accion", "objetivo", "detalle", "ip", "navegador"];
	const lines = [header.join(",")];
	for (const e of rows) {
		lines.push(
			[
				e.at,
				e.actor,
				e.action,
				e.target,
				e.detail,
				e.ip,
				e.userAgent,
			]
				.map(escape)
				.join(","),
		);
	}
	return lines.join("\n");
}

export function flushAudit() {
	saveNow();
}

load();
