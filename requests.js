import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "requests.json");

let requests = [];

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify({ requests }, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		if (Array.isArray(data.requests)) requests = data.requests;
	} catch (err) {
		console.error("No se pudo cargar requests.json:", err.message);
	}
}

export function createRequest(username, host, reason) {
	const clean = String(host || "").toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
	if (!/^[a-z0-9.-]+$/.test(clean) || !clean.includes(".")) {
		return { error: "invalid-host" };
	}
	const pending = requests.find(
		(r) => r.status === "pending" && r.username === username && r.host === clean,
	);
	if (pending) return { error: "exists", request: pending };
	const request = {
		id: crypto.randomBytes(8).toString("hex"),
		username,
		host: clean,
		reason: String(reason || "").trim().slice(0, 500),
		status: "pending",
		createdAt: new Date().toISOString(),
		resolvedAt: null,
		resolvedBy: null,
	};
	requests.push(request);
	if (requests.length > 1000) requests = requests.slice(-1000);
	save();
	return { request };
}

export function listRequests({ status = "", username = "" } = {}) {
	return requests
		.filter((r) => (!status || r.status === status) && (!username || r.username === username))
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function countPendingRequests() {
	return requests.filter((r) => r.status === "pending").length;
}

export function resolveRequest(id, status, actor) {
	if (!["approved", "denied"].includes(status)) return { error: "invalid-status" };
	const request = requests.find((r) => r.id === id);
	if (!request) return { error: "notfound" };
	if (request.status !== "pending") return { error: "already" };
	request.status = status;
	request.resolvedAt = new Date().toISOString();
	request.resolvedBy = actor;
	save();
	return { request };
}

export function exportRequests() {
	return JSON.parse(JSON.stringify(requests));
}

load();
