import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "templates.json");

const SEED = {
	block: [
		{
			id: "seed-uso",
			label: "Uso indebido",
			text: "Tu cuenta está bloqueada por uso indebido. Habla con tu tutor o con el administrador.",
		},
		{
			id: "seed-horario",
			label: "Fuera de horario",
			text: "El acceso está fuera del horario permitido. Vuelve a intentarlo dentro de tu horario.",
		},
		{
			id: "seed-tutor",
			label: "Contacta con tu tutor",
			text: "Contacta con tu tutor para revisar el acceso a tu cuenta.",
		},
	],
	notes: [
		{
			id: "seed-revisar",
			label: "Revisar con el tutor",
			text: "Pendiente de revisar con el tutor.",
		},
	],
};

let db = { block: [], notes: [] };

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function load() {
	try {
		if (!fs.existsSync(FILE)) {
			db = JSON.parse(JSON.stringify(SEED));
			save();
			return;
		}
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		db = {
			block: Array.isArray(data.block) ? data.block : [],
			notes: Array.isArray(data.notes) ? data.notes : [],
		};
	} catch {
		db = JSON.parse(JSON.stringify(SEED));
		save();
	}
}

export function listTemplates(kind = "block") {
	const key = kind === "notes" ? "notes" : "block";
	return db[key].map((entry) => ({ ...entry }));
}

export function addTemplate(kind, { label = "", text = "" } = {}) {
	const key = kind === "notes" ? "notes" : "block";
	const cleanLabel = String(label || "").trim().slice(0, 60);
	const cleanText = String(text || "").trim().slice(0, 500);
	if (!cleanLabel || !cleanText) return { error: "empty" };
	if (db[key].length >= 50) return { error: "limit" };
	if (db[key].some((entry) => entry.label.toLowerCase() === cleanLabel.toLowerCase())) {
		return { error: "exists" };
	}
	const entry = { id: crypto.randomBytes(8).toString("hex"), label: cleanLabel, text: cleanText };
	db[key].push(entry);
	save();
	return { template: { ...entry } };
}

export function deleteTemplate(kind, id) {
	const key = kind === "notes" ? "notes" : "block";
	const before = db[key].length;
	db[key] = db[key].filter((entry) => entry.id !== String(id || ""));
	if (db[key].length === before) return { error: "notfound" };
	save();
	return { ok: true };
}

load();
