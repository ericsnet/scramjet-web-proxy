import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "reports.json");
const MAX_REPORTS = 1000;

const TYPES = new Set(["bug", "security", "design"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const STATUSES = new Set(["open", "triaged", "in_progress", "fixed", "dismissed"]);

let db = { reports: [] };

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
		db = { reports: Array.isArray(data.reports) ? data.reports : [] };
	} catch {
		db = { reports: [] };
		save();
	}
}

function text(value, max) {
	return String(value || "").trim().slice(0, max);
}

export function createReport(username, input = {}) {
	const title = text(input.title, 140);
	const description = text(input.description, 4000);
	if (!title || !description) return { error: "empty" };
	const type = TYPES.has(String(input.type)) ? String(input.type) : "bug";
	const severity = SEVERITIES.has(String(input.severity)) ? String(input.severity) : "medium";
	const report = {
		id: crypto.randomBytes(8).toString("hex"),
		title,
		type,
		severity,
		area: text(input.area, 120),
		url: text(input.url, 500),
		description,
		steps: text(input.steps, 4000),
		expected: text(input.expected, 1000),
		actual: text(input.actual, 1000),
		browser: text(input.browser, 200),
		createdBy: String(username || "").slice(0, 32),
		createdAt: new Date().toISOString(),
		status: "open",
		adminNote: "",
		updatedAt: "",
		updatedBy: "",
	};
	db.reports.push(report);
	if (db.reports.length > MAX_REPORTS) {
		db.reports = db.reports.slice(-MAX_REPORTS);
	}
	save();
	return { report };
}

export function listReports({ username = "", status = "", limit = 200 } = {}) {
	const wanted = String(username || "").toLowerCase();
	const wantedStatus = STATUSES.has(String(status)) ? String(status) : "";
	return db.reports
		.filter(
			(report) =>
				(!wanted || String(report.createdBy).toLowerCase() === wanted) &&
				(!wantedStatus || report.status === wantedStatus),
		)
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
		.slice(0, Math.min(1000, Math.max(1, Number(limit) || 200)))
		.map((report) => ({ ...report }));
}

export function getReport(id) {
	const report = db.reports.find((item) => item.id === String(id || ""));
	return report ? { ...report } : null;
}

export function updateReport(id, { status = "", adminNote = "", by = "" } = {}) {
	const report = db.reports.find((item) => item.id === String(id || ""));
	if (!report) return { error: "notfound" };
	if (status) {
		if (!STATUSES.has(String(status))) return { error: "invalid-status" };
		report.status = String(status);
	}
	report.adminNote = text(adminNote, 2000);
	report.updatedAt = new Date().toISOString();
	report.updatedBy = String(by || "").slice(0, 64);
	save();
	return { report: { ...report } };
}

export function countOpenReports() {
	return db.reports.filter((report) => report.status === "open").length;
}

export function flushReports() {
	save();
}

load();
