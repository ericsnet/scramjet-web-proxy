import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "groups.json");
const MAX_GROUPS = 100;
const MAX_NAME = 40;

let db = { groups: [] };

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
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
				? data.groups.filter(
						(group) =>
							group &&
							typeof group.id === "string" &&
							typeof group.name === "string",
					)
				: [],
		};
	} catch (err) {
		console.error("No se pudo cargar groups.json:", err.message);
		db = { groups: [] };
	}
}

function cleanName(value) {
	return String(value || "").trim().slice(0, MAX_NAME);
}

export function listGroups() {
	return [...db.groups].sort((a, b) =>
		String(a.name).localeCompare(String(b.name), "es"),
	);
}

export function getGroup(id) {
	return db.groups.find((group) => group.id === String(id || "")) || null;
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
	};
	db.groups.push(group);
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
