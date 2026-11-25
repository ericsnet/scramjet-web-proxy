import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "friends.json");
const MAX_PENDING = 20;

let state = { requests: [], friends: [] };
let saveTimer = null;
let dirty = false;

function lower(value) {
	return String(value || "").trim().toLowerCase();
}

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (error) {
		console.error("No se pudo guardar friends.json:", error.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveNow();
	}, 500);
	saveTimer.unref?.();
}

function load() {
	try {
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		const seen = new Set();
		state.friends = [];
		for (const pair of Array.isArray(data.friends) ? data.friends : []) {
			const a = String(pair?.a || "").trim();
			const b = String(pair?.b || "").trim();
			if (!a || !b || lower(a) === lower(b)) continue;
			const key = [lower(a), lower(b)].sort().join(":");
			if (seen.has(key)) continue;
			seen.add(key);
			state.friends.push({
				a,
				b,
				since: pair.since || new Date().toISOString(),
			});
		}
		const requestSeen = new Set();
		state.requests = [];
		for (const request of Array.isArray(data.requests) ? data.requests : []) {
			const from = String(request?.from || "").trim();
			const to = String(request?.to || "").trim();
			if (!from || !to || lower(from) === lower(to)) continue;
			const key = `${lower(from)}:${lower(to)}`;
			if (requestSeen.has(key)) continue;
			if (state.friends.some((pair) => samePair(pair, from, to))) continue;
			requestSeen.add(key);
			state.requests.push({
				id: request.id || crypto.randomBytes(6).toString("hex"),
				from,
				to,
				at: request.at || new Date().toISOString(),
			});
		}
	} catch (error) {
		console.error("No se pudo cargar friends.json:", error.message);
		state = { requests: [], friends: [] };
	}
}

function samePair(pair, a, b) {
	return (
		(lower(pair.a) === lower(a) && lower(pair.b) === lower(b)) ||
		(lower(pair.a) === lower(b) && lower(pair.b) === lower(a))
	);
}

export function areFriends(a, b) {
	return state.friends.some((pair) => samePair(pair, a, b));
}

export function getFriendState(username) {
	const me = lower(username);
	const friends = state.friends
		.filter((pair) => lower(pair.a) === me || lower(pair.b) === me)
		.map((pair) => (lower(pair.a) === me ? pair.b : pair.a));
	const incoming = state.requests
		.filter((request) => lower(request.to) === me)
		.map((request) => request.from);
	const outgoing = state.requests
		.filter((request) => lower(request.from) === me)
		.map((request) => request.to);
	return { friends, incoming, outgoing };
}

export function sendFriendRequest(from, to) {
	const source = String(from || "").trim();
	const target = String(to || "").trim();
	if (!source || !target || lower(source) === lower(target)) {
		return { error: "invalid-user" };
	}
	if (areFriends(source, target)) return { error: "already_friends" };
	if (state.requests.some((request) => lower(request.from) === lower(source) && lower(request.to) === lower(target))) {
		return { error: "pending" };
	}
	const reverse = state.requests.find(
		(request) => lower(request.from) === lower(target) && lower(request.to) === lower(source),
	);
	if (reverse) {
		state.requests = state.requests.filter((request) => request !== reverse);
		state.friends.push({ a: source, b: target, since: new Date().toISOString() });
		dirty = true;
		saveNow();
		return { ok: true, accepted: true };
	}
	const pending = state.requests.filter((request) => lower(request.from) === lower(source)).length;
	if (pending >= MAX_PENDING) return { error: "limit" };
	state.requests.push({
		id: crypto.randomBytes(6).toString("hex"),
		from: source,
		to: target,
		at: new Date().toISOString(),
	});
	dirty = true;
	saveNow();
	return { ok: true, request: { from: source, to: target } };
}

function makeFriends(a, b) {
	if (areFriends(a, b)) return;
	state.friends.push({ a, b, since: new Date().toISOString() });
}

export function acceptFriendRequest(username, from) {
	const me = lower(username);
	const other = lower(from);
	const request = state.requests.find(
		(entry) => lower(entry.to) === me && lower(entry.from) === other,
	);
	if (!request) return { error: "notfound" };
	state.requests = state.requests.filter((entry) => entry !== request);
	makeFriends(request.from, request.to);
	dirty = true;
	saveNow();
	return { ok: true };
}

export function rejectFriendRequest(username, from) {
	const me = lower(username);
	const other = lower(from);
	const request = state.requests.find(
		(entry) => lower(entry.to) === me && lower(entry.from) === other,
	);
	if (!request) return { error: "notfound" };
	state.requests = state.requests.filter((entry) => entry !== request);
	dirty = true;
	saveNow();
	return { ok: true };
}

export function cancelFriendRequest(username, to) {
	const me = lower(username);
	const other = lower(to);
	const request = state.requests.find(
		(entry) => lower(entry.from) === me && lower(entry.to) === other,
	);
	if (!request) return { error: "notfound" };
	state.requests = state.requests.filter((entry) => entry !== request);
	dirty = true;
	saveNow();
	return { ok: true };
}

export function removeFriend(username, other) {
	const me = lower(username);
	const target = lower(other);
	const before = state.friends.length;
	state.friends = state.friends.filter(
		(pair) =>
			!(
				(lower(pair.a) === me && lower(pair.b) === target) ||
				(lower(pair.b) === me && lower(pair.a) === target)
			),
	);
	if (state.friends.length === before) return { error: "notfound" };
	dirty = true;
	saveNow();
	return { ok: true };
}

export function flushFriends() {
	saveNow();
}

load();
setInterval(() => {
	if (dirty) saveNow();
}, 30_000).unref();
