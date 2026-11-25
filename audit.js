import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "audit.json");
const MAX_EVENTS = 3000;

const GENESIS = "genesis";
const FILE_VERSION = 2;
let events = [];
let timer = null;
let dirty = false;

function eventPayload(event) {
	return JSON.stringify({
		at: event.at,
		actor: event.actor,
		action: event.action,
		target: event.target,
		detail: event.detail,
		ip: event.ip,
		userAgent: event.userAgent,
	});
}

function eventHash(event, previousHash) {
	return crypto
		.createHash("sha256")
		.update(`${previousHash}|${eventPayload(event)}`)
		.digest("hex");
}

function rebuildHashes() {
	let previous = GENESIS;
	for (const event of events) {
		event.hash = eventHash(event, previous);
		previous = event.hash;
	}
}

export function verifyAudit() {
	let previous = GENESIS;
	for (let i = 0; i < events.length; i++) {
		const event = events[i];
		const expected = eventHash(event, previous);
		if (!event.hash || event.hash !== expected) {
			return { ok: false, index: i, event };
		}
		previous = event.hash;
	}
	return { ok: true, count: events.length };
}

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		if (Array.isArray(data.events)) events = data.events;
		if (data.version !== FILE_VERSION) {
			rebuildHashes();
			dirty = true;
			saveNow();
		}
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
		fs.writeFileSync(
			tmp,
			JSON.stringify({ version: FILE_VERSION, events }, null, 2),
			{ mode: 0o600 },
		);
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
	const event = {
		at: new Date().toISOString(),
		actor: String(actor || "sistema").slice(0, 64),
		action: String(action).slice(0, 64),
		target: String(target || "").slice(0, 128),
		detail: String(detail || "").slice(0, 500),
		ip: String(ip || "").slice(0, 64),
		userAgent: String(userAgent || "").slice(0, 200),
	};
	event.hash = eventHash(event, events[events.length - 1]?.hash || GENESIS);
	events.push(event);
	if (events.length > MAX_EVENTS) {
		events.splice(0, events.length - MAX_EVENTS);
		rebuildHashes();
	}
	scheduleSave();
}

export function listAudit({
	actor = "",
	action = "",
	limit = 300,
	excludeActors = [],
	excludeTargets = [],
} = {}) {
	const wantedActor = String(actor || "").toLowerCase();
	const wantedAction = String(action || "").toLowerCase();
	const hiddenActors = new Set(excludeActors.map((v) => String(v).toLowerCase()));
	const hiddenTargets = new Set(excludeTargets.map((v) => String(v).toLowerCase()));
	const out = [];
	for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
		const e = events[i];
		if (wantedActor && String(e.actor).toLowerCase() !== wantedActor) continue;
		if (wantedAction && String(e.action).toLowerCase() !== wantedAction) continue;
		if (hiddenActors.has(String(e.actor).toLowerCase())) continue;
		if (hiddenTargets.has(String(e.target).toLowerCase())) continue;
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
	rebuildHashes();
	dirty = true;
	saveNow();
}

export function exportAudit() {
	return JSON.parse(JSON.stringify(events));
}

export function auditToCsv({ actor = "", action = "", excludeActors = [], excludeTargets = [] } = {}) {
	const rows = listAudit({ actor, action, limit: MAX_EVENTS, excludeActors, excludeTargets });
	const escape = (value) => {
		let text = String(value ?? "");
		if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
		return `"${text.replaceAll('"', '""')}"`;
	};
	const header = ["fecha", "actor", "accion", "objetivo", "detalle", "ip", "navegador", "hash"];
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
				e.hash,
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
