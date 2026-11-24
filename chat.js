import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { getSettings } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "chat.json");

let messages = [];
let nextSeq = 1;
let generation = 1;
let reads = {}; // usuario en minúsculas -> última secuencia leída
let saveTimer = null;
let dirty = false;
const lastPost = new Map(); // usuario -> { last, times[] }

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(
			tmp,
			JSON.stringify({ messages, nextSeq, generation, reads }, null, 2),
			{ mode: 0o600 },
		);
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (err) {
		console.error("No se pudo guardar chat.json:", err.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveNow();
	}, 800);
	saveTimer.unref?.();
}

function trimMessages() {
	const settings = getSettings();
	const cutoff = Date.now() - Math.max(1, settings.chatRetentionDays) * 24 * 60 * 60 * 1000;
	const before = messages.length;
	messages = messages.filter((m) => {
		const at = new Date(m.at).getTime();
		return Number.isFinite(at) && at >= cutoff;
	});
	const max = Math.max(100, settings.chatMaxMessages);
	if (messages.length > max) messages = messages.slice(-max);
	return messages.length !== before;
}

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		generation = Math.max(1, Number(data.generation) || 1);
		if (data.reads && typeof data.reads === "object" && !Array.isArray(data.reads)) {
			reads = {};
			for (const [name, seq] of Object.entries(data.reads)) {
				const value = Number(seq);
				if (typeof name === "string" && Number.isFinite(value) && value >= 0) {
					reads[name.toLowerCase()] = Math.floor(value);
				}
			}
		}
		const entries = Array.isArray(data.messages) ? data.messages : [];
		messages = entries
			.filter(
				(m) =>
					m &&
					typeof m.id === "string" &&
					Number.isInteger(m.seq) &&
					m.seq > 0 &&
					typeof m.username === "string" &&
					m.username.length > 0 &&
					m.username.length <= 32 &&
					typeof m.text === "string" &&
					m.text.length > 0 &&
					Number.isFinite(new Date(m.at).getTime()),
			)
			.map((m) => ({
				id: m.id.slice(0, 64),
				seq: m.seq,
				username: m.username.slice(0, 32),
				text: m.text.slice(0, 2000),
				at: m.at,
			}))
			.sort((a, b) => a.seq - b.seq);
		nextSeq = Math.max(
			Number(data.nextSeq) || 1,
			messages.length ? messages[messages.length - 1].seq + 1 : 1,
		);
		if (trimMessages()) dirty = true;
	} catch (err) {
		console.error("No se pudo cargar chat.json:", err.message);
		messages = [];
		nextSeq = 1;
		generation = 1;
		reads = {};
	}
}

function cleanText(value) {
	return String(value ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function postChatMessage(username, value) {
	const settings = getSettings();
	if (!settings.chatEnabled) return { error: "disabled" };
	if (typeof value !== "string") return { error: "empty" };
	const text = cleanText(value);
	if (!text) return { error: "empty" };
	if ([...text].length > settings.chatMaxLength) return { error: "too_long" };

	const now = Date.now();
	const key = String(username).toLowerCase();
	const entry = lastPost.get(key) || { last: 0, times: [] };
	entry.times = entry.times.filter((t) => now - t < 60_000);
	const slowMs = Math.max(0, Number(settings.chatSlowModeSeconds) || 0) * 1000;
	if (entry.last && now - entry.last < slowMs) {
		return {
			error: "slow",
			retryAfter: Math.max(1, Math.ceil((slowMs - (now - entry.last)) / 1000)),
		};
	}
	if (entry.times.length >= settings.chatMaxPerMinute) {
		return { error: "rate", retryAfter: 60 };
	}

	const message = {
		id: crypto.randomBytes(8).toString("hex"),
		seq: nextSeq++,
		username: String(username).slice(0, 32),
		text,
		at: new Date(now).toISOString(),
	};
	messages.push(message);
	entry.last = now;
	entry.times.push(now);
	lastPost.set(key, entry);
	trimMessages();
	scheduleSave();
	return { message: { ...message } };
}

export function listChat({ after = 0, limit = 200 } = {}) {
	if (trimMessages()) scheduleSave();
	const afterSeq = Math.max(0, Number.parseInt(after, 10) || 0);
	const max = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 200));
	const oldestSeq = messages.length ? messages[0].seq : nextSeq;
	const matching = messages.filter((m) => m.seq > afterSeq);
	return {
		messages: matching.slice(0, max).map((m) => ({ ...m })),
		latestSeq: messages.length ? messages[messages.length - 1].seq : nextSeq - 1,
		oldestSeq,
		generation,
		reset: afterSeq > 0 && afterSeq < oldestSeq - 1,
	};
}

export function getChatMessage(id) {
	const wanted = String(id || "");
	return messages.find((m) => m.id === wanted) || null;
}

export function deleteChatMessage(id) {
	const wanted = String(id || "");
	const index = messages.findIndex((m) => m.id === wanted);
	if (index === -1) return null;
	const [removed] = messages.splice(index, 1);
	generation += 1;
	dirty = true;
	saveNow();
	return { ...removed };
}

export function deleteChatMessagesByUser(username) {
	const wanted = String(username || "").toLowerCase();
	const before = messages.length;
	messages = messages.filter((m) => m.username.toLowerCase() !== wanted);
	delete reads[wanted];
	lastPost.delete(wanted);
	if (messages.length !== before) {
		generation += 1;
		dirty = true;
		saveNow();
	}
	return before - messages.length;
}

export function clearChat() {
	messages = [];
	reads = {};
	generation += 1;
	lastPost.clear();
	dirty = true;
	saveNow();
}

export function getChatUnread(username) {
	const wanted = String(username || "").toLowerCase();
	const read = Number(reads[wanted]) || 0;
	const latestSeq = messages.length ? messages[messages.length - 1].seq : nextSeq - 1;
	let unread = 0;
	for (const message of messages) {
		if (message.seq > read && message.username.toLowerCase() !== wanted) unread++;
	}
	return { unread, read, latestSeq };
}

export function markChatRead(username, seq) {
	const wanted = String(username || "").toLowerCase();
	const value = Math.max(0, Number.parseInt(seq, 10) || 0);
	if (!wanted) return { error: "invalid" };
	if ((reads[wanted] || 0) < value) {
		reads[wanted] = value;
		dirty = true;
		scheduleSave();
	}
	return { ok: true };
}

export function exportChat() {
	return {
		generation,
		messages: messages.map((m) => ({ ...m })),
		reads: { ...reads },
	};
}

export function flushChat() {
	saveNow();
}

load();
setInterval(() => {
	if (trimMessages()) scheduleSave();
}, 10 * 60 * 1000).unref();
