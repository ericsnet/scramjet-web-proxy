import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "schedules.json");

let db = { jobs: [] };

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function load() {
	try {
		if (!fs.existsSync(FILE)) {
			save();
			return;
		}
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		db = { jobs: Array.isArray(data.jobs) ? data.jobs : [] };
	} catch {
		db = { jobs: [] };
		save();
	}
}

function parseDate(value) {
	const date = new Date(String(value || ""));
	return Number.isFinite(date.getTime()) ? date : null;
}

export function listSchedules() {
	return db.jobs
		.slice()
		.sort((a, b) => new Date(a.start) - new Date(b.start))
		.map((job) => ({ ...job }));
}

export function addSchedule({ type = "", start = "", end = "", message = "", by = "" } = {}) {
	const kind = type === "quarantine" ? "quarantine" : type === "maintenance" ? "maintenance" : "";
	if (!kind) return { error: "invalid-type" };
	const from = parseDate(start);
	const to = parseDate(end);
	if (!from || !to || to <= from) return { error: "invalid-range" };
	if (db.jobs.length >= 50) return { error: "limit" };
	const job = {
		id: crypto.randomBytes(8).toString("hex"),
		type: kind,
		start: from.toISOString(),
		end: to.toISOString(),
		message: String(message || "").trim().slice(0, 300),
		createdBy: String(by || "").slice(0, 64),
		createdAt: new Date().toISOString(),
	};
	db.jobs.push(job);
	save();
	return { job: { ...job } };
}

export function deleteSchedule(id) {
	const before = db.jobs.length;
	db.jobs = db.jobs.filter((job) => job.id !== String(id || ""));
	if (db.jobs.length === before) return { error: "notfound" };
	save();
	return { ok: true };
}

export function activeJob(type, now = Date.now()) {
	const kind = type === "quarantine" ? "quarantine" : "maintenance";
	return (
		db.jobs.find((job) => {
			if (job.type !== kind) return false;
			const start = new Date(job.start).getTime();
			const end = new Date(job.end).getTime();
			return start <= now && now < end;
		}) || null
	);
}

load();
