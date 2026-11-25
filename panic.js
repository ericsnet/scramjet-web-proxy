import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "panic.json");
const DURATION_MS = 5 * 60 * 1000;
const CLASSROOM_URL = "https://classroom.google.com/";

let devices = new Map();
let dirty = false;
let timer = null;

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		const now = Date.now();
		const active = [...devices.entries()].filter(([, until]) => until > now);
		fs.writeFileSync(
			tmp,
			JSON.stringify({ devices: active }, null, 2),
			{ mode: 0o600 },
		);
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (error) {
		console.error("No se pudo guardar panic.json:", error.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (timer) return;
	timer = setTimeout(() => {
		timer = null;
		saveNow();
	}, 500);
	timer.unref?.();
}

function load() {
	try {
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		const now = Date.now();
		devices = new Map(
			(Array.isArray(data.devices) ? data.devices : [])
				.filter(
					([device, until]) =>
						/^[a-f0-9]{16,64}$/i.test(String(device || "")) &&
						Number(until) > now,
				)
				.map(([device, until]) => [String(device), Number(until)]),
		);
	} catch (error) {
		console.error("No se pudo cargar panic.json:", error.message);
		devices = new Map();
	}
}

load();

export function panicUntil(device) {
	const key = String(device || "");
	if (!key) return 0;
	const until = devices.get(key) || 0;
	if (until <= Date.now()) {
		if (devices.delete(key)) scheduleSave();
		return 0;
	}
	return until;
}

export function activatePanic(device, durationMs = DURATION_MS) {
	const key = String(device || "");
	if (!key) return 0;
	const until = Date.now() + Math.max(1000, Number(durationMs) || DURATION_MS);
	devices.set(key, until);
	dirty = true;
	saveNow();
	return until;
}

export function clearPanic(device) {
	const key = String(device || "");
	if (!devices.delete(key)) return false;
	dirty = true;
	saveNow();
	return true;
}

export function flushPanic() {
	saveNow();
}

export { CLASSROOM_URL, DURATION_MS };
