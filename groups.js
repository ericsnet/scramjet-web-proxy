import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "groups.json");
const MAX_GROUPS = 100;
const MAX_NAME = 40;

export const DEFAULT_GROUP_RULES = Object.freeze({
	accessMode: "",
	blockedSites: [],
	siteMessages: {},
	allowedSites: [],
	allowlistMessage: "",
	schedule: null,
	bandwidthKbps: 0,
	maxStreams: 0,
	maxConnections: 0,
});

let db = { groups: [] };

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function cleanName(value) {
	return String(value || "").trim().slice(0, MAX_NAME);
}

function parseSites(input, label, max = 100) {
	const raw = Array.isArray(input) ? input.join("\n") : String(input || "");
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
	const errors = [];
	const hosts = [];
	const messages = {};
	if (lines.length > max) {
		return { hosts: [], messages: {}, errors: [`Máximo ${max} sitios ${label}.`] };
	}
	for (const line of lines) {
		const [hostPart, ...messageParts] = line.split("|");
		const message = messageParts.join("|").trim().slice(0, 300);
		if (hostPart.length > 200) {
			errors.push(`Sitio demasiado largo: ${hostPart.slice(0, 40)}…`);
			continue;
		}
		const cleaned = hostPart.trim().replace(/^\*\./, "");
		if (!cleaned) continue;
		const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
			? cleaned
			: `https://${cleaned}`;
		let host;
		try {
			host = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
		} catch {
			errors.push(`Sitio no válido: ${hostPart.trim()}`);
			continue;
		}
		if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) {
			errors.push(`Sitio no válido: ${hostPart.trim()}`);
			continue;
		}
		hosts.push(host);
		if (message) messages[host] = message;
	}
	return { hosts: [...new Set(hosts)], messages, errors };
}

function cleanSchedule(value) {
	if (!value || typeof value !== "object") return null;
	if (!value.enabled) return null;
	const days = Array.isArray(value.days)
		? [...new Set(value.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
		: [];
	const start = String(value.start || "");
	const end = String(value.end || "");
	const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
	if (!days.length || !validTime.test(start) || !validTime.test(end)) {
		return null;
	}
	return { enabled: true, days: days.sort(), start, end };
}

function normalizeRules(input) {
	const source = input && typeof input === "object" ? input : {};
	const rules = {
		...DEFAULT_GROUP_RULES,
		blockedSites: Array.isArray(source.blockedSites)
			? source.blockedSites.map(String).filter(Boolean).slice(0, 100)
			: [],
		siteMessages:
			source.siteMessages && typeof source.siteMessages === "object"
				? { ...source.siteMessages }
				: {},
		allowedSites: Array.isArray(source.allowedSites)
			? source.allowedSites.map(String).filter(Boolean).slice(0, 100)
			: [],
		accessMode: ["", "blacklist", "allowlist"].includes(source.accessMode)
			? source.accessMode
			: "",
		allowlistMessage: String(source.allowlistMessage || "").slice(0, 300),
		schedule: cleanSchedule(source.schedule),
		bandwidthKbps: Math.max(0, Math.min(100000, Number(source.bandwidthKbps) || 0)),
		maxStreams: Math.max(0, Math.min(128, Number(source.maxStreams) || 0)),
		maxConnections: Math.max(0, Math.min(10, Number(source.maxConnections) || 0)),
	};
	if (rules.maxStreams > 0 && rules.maxStreams < 8) rules.maxStreams = 8;
	if (rules.bandwidthKbps > 0 && rules.bandwidthKbps < 256) rules.bandwidthKbps = 256;
	return rules;
}

function load() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	if (!fs.existsSync(FILE)) {
		save();
		return;
	}
	try {
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		db = {
			groups: Array.isArray(data.groups)
				? data.groups
						.filter(
							(group) =>
								group &&
								typeof group.id === "string" &&
								typeof group.name === "string",
						)
						.map((group) => ({
							...group,
							rules: normalizeRules(group.rules),
						}))
				: [],
		};
	} catch (err) {
		console.error("No se pudo cargar groups.json:", err.message);
		db = { groups: [] };
	}
}

export function listGroups() {
	return [...db.groups].sort((a, b) =>
		String(a.name).localeCompare(String(b.name), "es"),
	);
}

export function getGroup(id) {
	return db.groups.find((group) => group.id === String(id || "")) || null;
}

export function groupRules(group) {
	return group?.rules || DEFAULT_GROUP_RULES;
}

export function createGroup(name, by = "") {
	const clean = cleanName(name);
	if (!clean) return { error: "group-invalid" };
	if (db.groups.length >= MAX_GROUPS) return { error: "group-limit" };
	if (
		db.groups.some(
			(group) => String(group.name).toLowerCase() === clean.toLowerCase(),
		)
	) {
		return { error: "group-exists" };
	}
	const group = {
		id: crypto.randomBytes(8).toString("hex"),
		name: clean,
		createdAt: new Date().toISOString(),
		createdBy: String(by || "").slice(0, 64),
		rules: { ...DEFAULT_GROUP_RULES },
	};
	db.groups.push(group);
	save();
	return { group: { ...group } };
}

export function updateGroupRules(id, input, by = "") {
	const group = db.groups.find((item) => item.id === String(id || ""));
	if (!group) return { error: "group-notfound" };
	const errors = [];
	const blocked = parseSites(input.blockedSites, "bloqueados");
	const allowed = parseSites(input.allowedSites, "permitidos");
	errors.push(...blocked.errors, ...allowed.errors);
	if (errors.length) return { error: "sites-invalid" };
	const accessMode = ["", "blacklist", "allowlist"].includes(input.accessMode)
		? input.accessMode
		: "";
	const days = input.days === undefined
		? []
		: Array.isArray(input.days)
			? input.days
			: [input.days];
	const schedule = cleanSchedule({
		enabled: input.scheduleEnabled === true || input.scheduleEnabled === "on" || input.scheduleEnabled === "1",
		days,
		start: input.start,
		end: input.end,
	});
	if (input.scheduleEnabled && !schedule) {
		return { error: "schedule-invalid" };
	}
	const bandwidthKbps = Math.max(0, Math.min(100000, Number.parseInt(input.bandwidthKbps, 10) || 0));
	const maxStreams = Math.max(0, Math.min(128, Number.parseInt(input.maxStreams, 10) || 0));
	const maxConnections = Math.max(0, Math.min(10, Number.parseInt(input.maxConnections, 10) || 0));
	if (bandwidthKbps > 0 && bandwidthKbps < 256) return { error: "limit-invalid" };
	if (maxStreams > 0 && maxStreams < 8) return { error: "limit-invalid" };
	if (maxConnections > 0 && maxConnections < 1) return { error: "limit-invalid" };
	group.rules = {
		accessMode,
		blockedSites: blocked.hosts,
		siteMessages: blocked.messages,
		allowedSites: allowed.hosts,
		allowlistMessage: String(input.allowlistMessage || "").slice(0, 300),
		schedule,
		bandwidthKbps,
		maxStreams,
		maxConnections,
	};
	group.rulesUpdatedAt = new Date().toISOString();
	group.rulesUpdatedBy = String(by || "").slice(0, 64);
	save();
	return { group: { ...group } };
}

export function deleteGroup(id) {
	const index = db.groups.findIndex((group) => group.id === String(id || ""));
	if (index < 0) return { error: "group-notfound" };
	const [removed] = db.groups.splice(index, 1);
	save();
	return { group: { ...removed } };
}

load();
