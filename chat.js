import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { getSettings } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "chat.json");
const UPLOAD_DIR = path.join(DATA_DIR, "chat-uploads");
const GENERAL = "general";
const MAX_FILE = 5 * 1024 * 1024;
const MAX_CHANNEL_MEMBERS = 50;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const SEARCH_LIMIT = 50;
const REACTIONS = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
const MIME_EXT = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"application/pdf": ".pdf",
	"text/plain": ".txt",
	"audio/webm": ".webm",
	"audio/ogg": ".ogg",
	"audio/mp4": ".m4a",
	"audio/mpeg": ".mp3",
	"audio/wav": ".wav",
	"audio/x-wav": ".wav",
};

let messages = [];
let channels = [];
let reads = {};
let uploads = {};
let nextSeq = 1;
let generation = 1;
let revision = 1;
let lastPost = new Map();
let saveTimer = null;
let dirty = false;

function generalChannel() {
	return {
		id: GENERAL,
		name: "General",
		type: "public",
		members: [],
		createdBy: "sistema",
		createdAt: new Date().toISOString(),
	};
}

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(
			tmp,
			JSON.stringify({ messages, channels, reads, uploads, nextSeq, generation, revision }, null, 2),
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

function channelFor(username, channelId) {
	const wanted = String(channelId || GENERAL);
	const channel = channels.find((item) => item.id === wanted);
	if (!channel) return null;
	if (channel.type === "public") return channel;
	const lower = String(username || "").toLowerCase();
	return channel.members.some((member) => member.toLowerCase() === lower) ? channel : null;
}

export function getChatSeen(message, username) {
	if (!message || !message.channelId) return null;
	const channel = channels.find((item) => item.id === message.channelId);
	if (!channel || channel.type === "public") return null;
	const author = String(message.username || "").toLowerCase();
	if (author !== String(username || "").toLowerCase()) return null;
	const others = (channel.members || []).filter(
		(member) => String(member).toLowerCase() !== author,
	);
	if (!others.length) return null;
	const readers = others.filter(
		(member) =>
			(reads[String(member).toLowerCase()]?.[channel.id] || 0) >= message.seq,
	);
	return {
		count: readers.length,
		total: others.length,
		all: readers.length >= others.length,
	};
}

export function getChannelReadSeqs(channelId) {
	const wanted = String(channelId || GENERAL);
	const out = {};
	for (const [name, values] of Object.entries(reads)) {
		const seq = Number(values?.[wanted]) || 0;
		if (seq > 0) out[name] = seq;
	}
	return out;
}

function channelMessages(channelId) {
	return messages.filter((message) => message.channelId === channelId);
}

function trimMessages() {
	const settings = getSettings();
	const cutoff = Date.now() - Math.max(1, settings.chatRetentionDays) * 24 * 60 * 60 * 1000;
	const before = messages.length;
	messages = messages.filter((message) => {
		const at = new Date(message.at).getTime();
		if (Number.isFinite(at) && at < cutoff) {
			removeFile(message);
			return false;
		}
		return true;
	});
	const max = Math.max(100, settings.chatMaxMessages);
	if (messages.length > max) {
		for (const message of messages.slice(0, messages.length - max)) removeFile(message);
		messages = messages.slice(-max);
	}
	const referenced = new Set(
		messages.map((message) => message.attachment?.id).filter(Boolean),
	);
	for (const [id, upload] of Object.entries(uploads)) {
		if (referenced.has(id)) continue;
		if (Date.now() - new Date(upload.createdAt).getTime() > 60 * 60 * 1000) {
			try { fs.rmSync(path.join(UPLOAD_DIR, `${id}.bin`), { force: true }); } catch {}
			delete uploads[id];
		}
	}
	return messages.length !== before;
}

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) {
			channels = [generalChannel()];
			return;
		}
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		generation = Math.max(1, Number(data.generation) || 1);
		revision = Math.max(1, Number(data.revision) || 1);
		channels = Array.isArray(data.channels) ? data.channels : [];
		if (!channels.some((channel) => channel.id === GENERAL)) channels.unshift(generalChannel());
		messages = (Array.isArray(data.messages) ? data.messages : [])
			.filter(
				(message) =>
					message &&
					typeof message.id === "string" &&
					Number.isInteger(message.seq) &&
					message.seq > 0 &&
					typeof message.username === "string" &&
					typeof message.text === "string" &&
					Number.isFinite(new Date(message.at).getTime()),
			)
			.map((message) => ({
				id: message.id.slice(0, 64),
				seq: message.seq,
				channelId: typeof message.channelId === "string" ? message.channelId : GENERAL,
				username: message.username.slice(0, 32),
				text: message.text.slice(0, 2000),
				at: message.at,
				reactions: message.reactions && typeof message.reactions === "object" ? message.reactions : {},
				attachment: message.attachment || null,
				poll: message.poll || null,
				mentions: Array.isArray(message.mentions) ? message.mentions.slice(0, 20) : [],
			}))
			.sort((a, b) => a.seq - b.seq);
		reads = {};
		if (data.reads && typeof data.reads === "object") {
			for (const [name, value] of Object.entries(data.reads)) {
				reads[name.toLowerCase()] =
					typeof value === "object" && value !== null ? value : { [GENERAL]: Number(value) || 0 };
			}
		}
		uploads = data.uploads && typeof data.uploads === "object" ? data.uploads : {};
		nextSeq = Math.max(
			Number(data.nextSeq) || 1,
			messages.length ? messages[messages.length - 1].seq + 1 : 1,
		);
		if (trimMessages()) dirty = true;
	} catch (err) {
		console.error("No se pudo cargar chat.json:", err.message);
		messages = [];
		channels = [generalChannel()];
		reads = {};
		uploads = {};
		nextSeq = 1;
		generation = 1;
		revision = 1;
	}
}

function cleanText(value) {
	return String(value ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function removeFile(message) {
	if (!message?.attachment?.id) return;
	try { fs.rmSync(path.join(UPLOAD_DIR, `${message.attachment.id}.bin`), { force: true }); } catch {}
}

function mentionsIn(text) {
	return [...new Set([...String(text).matchAll(/@([A-Za-z0-9._-]{3,32})/g)].map((m) => m[1]))];
}

export function listChatChannels(username) {
	const lower = String(username || "").toLowerCase();
	return channels
		.filter(
			(channel) =>
				channel.type === "public" ||
				channel.members.some((member) => member.toLowerCase() === lower),
		)
		.map((channel) => {
			const channelMessages = messages.filter((message) => message.channelId === channel.id);
			const last = channelMessages[channelMessages.length - 1];
			const read = Number(reads[lower]?.[channel.id]) || 0;
			const unread = channelMessages.filter(
				(message) =>
					message.seq > read &&
					message.username.toLowerCase() !== lower,
			).length;
			return {
				id: channel.id,
				name:
					channel.type === "dm"
						? channel.members.find((member) => member.toLowerCase() !== lower) || "Privado"
						: channel.name,
				type: channel.type,
				members: channel.members,
				latestSeq: last?.seq || 0,
				lastAt: last?.at || null,
				readSeq: read,
				unread,
			};
		})
		.sort((a, b) => {
			const rank = (channel) =>
				channel.type === "class" ? 0 : channel.id === GENERAL ? 1 : 2;
			const difference = rank(a) - rank(b);
			if (difference) return difference;
			if (a.type === "class" && b.type === "class") {
				return String(a.name).localeCompare(String(b.name), "es");
			}
			return new Date(b.lastAt || 0) - new Date(a.lastAt || 0);
		});
}

function removeChannelMessages(channelId) {
	for (const message of messages.filter((item) => item.channelId === channelId)) {
		removeFile(message);
	}
	messages = messages.filter((item) => item.channelId !== channelId);
	for (const value of Object.values(reads)) {
		if (value && typeof value === "object") delete value[channelId];
	}
}

export function syncClassChannels(groups = []) {
	const list = Array.isArray(groups) ? groups : [];
	const wanted = new Set();
	let changed = false;
	for (const group of list) {
		const groupId = String(group?.id || "").trim();
		if (!groupId) continue;
		const channelId = `class-${groupId}`;
		wanted.add(channelId);
		const name = String(group.name || "Grupo").trim().slice(0, 40) || "Grupo";
		const members = [
			...new Map(
				(Array.isArray(group.members) ? group.members : [])
					.map((member) => String(member || "").trim())
					.filter(Boolean)
					.map((member) => [member.toLowerCase(), member]),
			).values(),
		];
		let channel = channels.find(
			(item) => item.id === channelId || (item.type === "class" && item.groupId === groupId),
		);
		if (!channel) {
			channel = {
				id: channelId,
				name,
				type: "class",
				groupId,
				members,
				createdBy: "sistema",
				createdAt: new Date().toISOString(),
			};
			channels.push(channel);
			changed = true;
			continue;
		}
		const previousMembers = (channel.members || []).map((member) => String(member).toLowerCase()).sort().join(",");
		const nextMembers = members.map((member) => member.toLowerCase()).sort().join(",");
		if (channel.name !== name) {
			channel.name = name;
			changed = true;
		}
		if (channel.groupId !== groupId) {
			channel.groupId = groupId;
			changed = true;
		}
		if (channel.type !== "class") {
			channel.type = "class";
			changed = true;
		}
		if (previousMembers !== nextMembers) {
			channel.members = members;
			changed = true;
		}
	}
	for (const channel of [...channels]) {
		if (channel.type !== "class" || wanted.has(channel.id)) continue;
		removeChannelMessages(channel.id);
		channels = channels.filter((item) => item.id !== channel.id);
		changed = true;
	}
	if (changed) {
		dirty = true;
		saveNow();
	}
	return { channels: channels.filter((channel) => channel.type === "class").map((channel) => ({ ...channel })) };
}

export function createGroupChannel(username, name, members) {
	const cleanName = String(name || "").trim().slice(0, 40);
	if (cleanName.length < 2) return { error: "invalid-name" };
	const unique = new Map();
	unique.set(String(username).toLowerCase(), String(username));
	for (const member of Array.isArray(members) ? members : [members]) {
		const value = String(member || "").trim();
		if (value && value.toLowerCase() !== String(username).toLowerCase()) {
			unique.set(value.toLowerCase(), value);
		}
	}
	if (unique.size < 2) return { error: "invalid-members" };
	if (unique.size > MAX_CHANNEL_MEMBERS) return { error: "too-many-members" };
	const channel = {
		id: `g-${crypto.randomBytes(6).toString("hex")}`,
		name: cleanName,
		type: "group",
		members: [...unique.values()],
		createdBy: username,
		createdAt: new Date().toISOString(),
	};
	channels.push(channel);
	dirty = true;
	saveNow();
	return { channel };
}

export function getOrCreateDmChannel(username, other) {
	const a = String(username || "").trim();
	const b = String(other || "").trim();
	if (!a || !b || a.toLowerCase() === b.toLowerCase()) return { error: "invalid-user" };
	const pair = [a, b].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
	const existing = channels.find(
		(channel) =>
			channel.type === "dm" &&
			channel.members.length === 2 &&
			channel.members.some((m) => m.toLowerCase() === pair[0].toLowerCase()) &&
			channel.members.some((m) => m.toLowerCase() === pair[1].toLowerCase()),
	);
	if (existing) return { channel: existing };
	const channel = {
		id: `dm-${crypto.createHash("sha1").update(pair.map((v) => v.toLowerCase()).join(":")).digest("hex").slice(0, 16)}`,
		name: "",
		type: "dm",
		members: pair,
		createdBy: a,
		createdAt: new Date().toISOString(),
	};
	channels.push(channel);
	dirty = true;
	saveNow();
	return { channel };
}

export function postChatMessage(
	username,
	value,
	{ channelId = GENERAL, attachmentId = "", replyTo = "" } = {},
) {
	const settings = getSettings();
	if (!settings.chatEnabled) return { error: "disabled" };
	const channel = channelFor(username, channelId);
	if (!channel) return { error: "channel" };
	const text = cleanText(value);
	if (typeof value !== "string" && value) return { error: "empty" };
	if (!text && !attachmentId) return { error: "empty" };
	if ([...text].length > settings.chatMaxLength) return { error: "too_long" };
	const now = Date.now();
	const key = String(username).toLowerCase();
	const entry = lastPost.get(key) || { last: 0, times: [] };
	entry.times = entry.times.filter((t) => now - t < 60_000);
	const slowMs = Math.max(0, Number(settings.chatSlowModeSeconds) || 0) * 1000;
	if (entry.last && now - entry.last < slowMs) {
		return { error: "slow", retryAfter: Math.max(1, Math.ceil((slowMs - (now - entry.last)) / 1000)) };
	}
	if (entry.times.length >= settings.chatMaxPerMinute) {
		return { error: "rate", retryAfter: 60 };
	}
	let attachment = null;
	if (attachmentId) {
		const upload = uploads[String(attachmentId)];
		if (!upload || upload.owner.toLowerCase() !== String(username).toLowerCase()) {
			return { error: "invalid-attachment" };
		}
		attachment = { id: upload.id, name: upload.name, type: upload.type, size: upload.size };
		if (upload.duration) attachment.duration = upload.duration;
		delete uploads[String(attachmentId)];
	}
	let reply = null;
	if (replyTo) {
		const original = messages.find(
			(item) => item.id === String(replyTo) && item.channelId === channel.id,
		);
		if (original) {
			reply = {
				id: original.id,
				username: original.username,
				text: String(original.text || "").slice(0, 140),
				attachment: original.attachment
					? { type: original.attachment.type, name: original.attachment.name }
					: null,
			};
		}
	}
	const message = {
		id: crypto.randomBytes(8).toString("hex"),
		seq: nextSeq++,
		channelId: channel.id,
		username: String(username).slice(0, 32),
		text,
		at: new Date(now).toISOString(),
		reactions: {},
		attachment,
		poll: null,
		mentions: mentionsIn(text),
		replyTo: reply,
		pinned: false,
		pinnedBy: "",
		pinnedAt: null,
		editedAt: null,
		editedBy: "",
	};
	messages.push(message);
	entry.last = now;
	entry.times.push(now);
	lastPost.set(key, entry);
	revision += 1;
	trimMessages();
	scheduleSave();
	return { message: { ...message } };
}

export function postChatPoll(username, { channelId = GENERAL, question, options } = {}) {
	const settings = getSettings();
	if (!settings.chatEnabled) return { error: "disabled" };
	const channel = channelFor(username, channelId);
	if (!channel) return { error: "channel" };
	const text = cleanText(question);
	const choices = (Array.isArray(options) ? options : [])
		.map((option) => cleanText(option).slice(0, 80))
		.filter(Boolean)
		.slice(0, 6);
	if (!text || text.length > 120 || choices.length < 2) return { error: "invalid-poll" };
	const now = Date.now();
	const key = String(username).toLowerCase();
	const entry = lastPost.get(key) || { last: 0, times: [] };
	entry.times = entry.times.filter((t) => now - t < 60_000);
	const slowMs = Math.max(0, Number(settings.chatSlowModeSeconds) || 0) * 1000;
	if (entry.last && now - entry.last < slowMs) {
		return { error: "slow", retryAfter: Math.max(1, Math.ceil((slowMs - (now - entry.last)) / 1000)) };
	}
	if (entry.times.length >= settings.chatMaxPerMinute) return { error: "rate", retryAfter: 60 };
	const message = {
		id: crypto.randomBytes(8).toString("hex"),
		seq: nextSeq++,
		channelId: channel.id,
		username: String(username).slice(0, 32),
		text,
		at: new Date(now).toISOString(),
		reactions: {},
		attachment: null,
		poll: { question: text, options: choices.map((choice) => ({ text: choice, votes: [] })) },
		mentions: [],
		replyTo: null,
		pinned: false,
		pinnedBy: "",
		pinnedAt: null,
		editedAt: null,
		editedBy: "",
	};
	entry.last = now;
	entry.times.push(now);
	lastPost.set(key, entry);
	messages.push(message);
	revision += 1;
	trimMessages();
	scheduleSave();
	return { message: { ...message } };
}

export function votePoll(username, messageId, optionIndex, channelId) {
	const message = messages.find((item) => item.id === messageId && item.channelId === channelId);
	if (!message?.poll) return { error: "notfound" };
	const channel = channelFor(username, channelId);
	if (!channel) return { error: "forbidden" };
	const index = Number(optionIndex);
	if (!Number.isInteger(index) || !message.poll.options[index]) return { error: "invalid-option" };
	const lower = String(username).toLowerCase();
	const already = message.poll.options[index].votes.some((v) => v.toLowerCase() === lower);
	for (const option of message.poll.options) {
		option.votes = option.votes.filter((v) => v.toLowerCase() !== lower);
	}
	if (!already) message.poll.options[index].votes.push(String(username));
	revision += 1;
	dirty = true;
	scheduleSave();
	return { message: { ...message } };
}

export function toggleReaction(username, messageId, emoji, channelId) {
	const message = messages.find((item) => item.id === messageId && item.channelId === channelId);
	if (!message) return { error: "notfound" };
	if (!channelFor(username, channelId)) return { error: "forbidden" };
	const value = String(emoji || "");
	if (!REACTIONS.has(value)) return { error: "invalid-reaction" };
	const lower = String(username).toLowerCase();
	message.reactions = message.reactions || {};
	const votes = Array.isArray(message.reactions[value]) ? message.reactions[value] : [];
	const exists = votes.some((v) => v.toLowerCase() === lower);
	message.reactions[value] = exists
		? votes.filter((v) => v.toLowerCase() !== lower)
		: [...votes, String(username)];
	if (!message.reactions[value].length) delete message.reactions[value];
	revision += 1;
	dirty = true;
	scheduleSave();
	return { message: { ...message } };
}

export function editChatMessage(
	username,
	messageId,
	value,
	{ channelId = GENERAL } = {},
) {
	const settings = getSettings();
	if (!settings.chatEnabled) return { error: "disabled" };
	const message = messages.find(
		(item) => item.id === String(messageId || "") && item.channelId === channelId,
	);
	if (!message) return { error: "notfound" };
	if (!channelFor(username, channelId)) return { error: "forbidden" };
	const own = String(message.username).toLowerCase() === String(username).toLowerCase();
	if (!own) return { error: "forbidden" };
	if (Date.now() - new Date(message.at).getTime() > EDIT_WINDOW_MS) {
		return { error: "edit_window" };
	}
	const text = cleanText(value);
	if (!text) return { error: "empty" };
	if ([...text].length > settings.chatMaxLength) return { error: "too_long" };
	message.text = text;
	message.mentions = mentionsIn(text);
	message.editedAt = new Date().toISOString();
	message.editedBy = String(username).slice(0, 32);
	revision += 1;
	dirty = true;
	scheduleSave();
	return { message: { ...message } };
}

export function pinChatMessage(username, messageId, channelId, pinned) {
	const message = messages.find(
		(item) => item.id === String(messageId || "") && item.channelId === channelId,
	);
	if (!message) return { error: "notfound" };
	if (!channelFor(username, channelId)) return { error: "forbidden" };
	message.pinned = !!pinned;
	message.pinnedBy = pinned ? String(username).slice(0, 32) : "";
	message.pinnedAt = pinned ? new Date().toISOString() : null;
	revision += 1;
	dirty = true;
	scheduleSave();
	return { message: { ...message } };
}

export function listChatPinned(username, channelId = GENERAL) {
	const channel = channelFor(username, channelId);
	if (!channel) return { error: "forbidden" };
	return {
		messages: messages
			.filter((message) => message.channelId === channel.id && message.pinned)
			.sort((a, b) => new Date(b.pinnedAt || 0) - new Date(a.pinnedAt || 0))
			.slice(0, 20)
			.map((message) => ({ ...message })),
	};
}

export function searchChat(
	username,
	{ query = "", channelId = "", limit = SEARCH_LIMIT } = {},
) {
	const needle = String(query || "").trim().toLowerCase();
	if (needle.length < 2) return { messages: [] };
	const visible = new Set(
		channels
			.filter(
				(channel) =>
					channel.type === "public" ||
					channel.members.some(
						(member) =>
							member.toLowerCase() === String(username || "").toLowerCase(),
					),
			)
			.map((channel) => channel.id),
	);
	if (channelId && !visible.has(channelId)) return { error: "forbidden" };
	const max = Math.min(100, Math.max(1, Number(limit) || SEARCH_LIMIT));
	const found = messages
		.filter((message) => {
			if (!visible.has(message.channelId)) return false;
			if (channelId && message.channelId !== channelId) return false;
			const text = String(message.text || "").toLowerCase();
			const author = String(message.username || "").toLowerCase();
			return text.includes(needle) || author.includes(needle);
		})
		.sort((a, b) => b.seq - a.seq)
		.slice(0, max);
	return { messages: found.map((message) => ({ ...message })) };
}

export function saveChatUpload(
	username,
	buffer,
	{ name = "archivo", type = "", duration = 0 } = {},
) {
	if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: "empty" };
	if (buffer.length > MAX_FILE) return { error: "too_large" };
	const mime = String(type || "").toLowerCase().split(";")[0].trim();
	if (!MIME_EXT[mime]) return { error: "invalid-type" };
	if (mime.startsWith("image/")) {
		const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
		const jpg = buffer[0] === 0xff && buffer[1] === 0xd8;
		const gif = buffer.subarray(0, 6).toString() === "GIF89a" || buffer.subarray(0, 6).toString() === "GIF87a";
		const webp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
		if (!png && !jpg && !gif && !webp) return { error: "invalid-type" };
	}
	if (mime.startsWith("audio/")) {
		const head = buffer.subarray(0, 12);
		const webm = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
		const ogg = head.subarray(0, 4).toString() === "OggS";
		const mp4 = head.subarray(4, 8).toString() === "ftyp";
		const mp3 =
			head.subarray(0, 3).toString() === "ID3" ||
			(buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
		const wav = head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WAVE";
		if (!webm && !ogg && !mp4 && !mp3 && !wav) return { error: "invalid-type" };
	}
	if (mime === "application/pdf" && buffer.subarray(0, 4).toString() !== "%PDF") return { error: "invalid-type" };
	const settings = getSettings();
	const maxTotal = Math.max(16, Number(settings.chatUploadMaxTotalMB) || 256) * 1024 * 1024;
	const maxUser = Math.max(8, Number(settings.chatUploadMaxPerUserMB) || 50) * 1024 * 1024;
	let totalBytes = 0;
	let userBytes = 0;
	for (const upload of Object.values(uploads)) {
		const size = Math.max(0, Number(upload.size) || 0);
		totalBytes += size;
		if (String(upload.owner || "").toLowerCase() === String(username || "").toLowerCase()) userBytes += size;
	}
	if (totalBytes + buffer.length > maxTotal) return { error: "quota" };
	if (userBytes + buffer.length > maxUser) return { error: "user_quota" };
	try {
		const stat = fs.statfsSync(DATA_DIR);
		if (stat.bavail * stat.bsize < 512 * 1024 * 1024) return { error: "disk" };
	} catch {}
	const id = crypto.randomBytes(16).toString("hex");
	fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
	fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.bin`), buffer, { mode: 0o600 });
	const seconds = Math.max(0, Math.min(300, Math.round(Number(duration) || 0)));
	const upload = {
		id,
		owner: String(username).slice(0, 32),
		name: String(name || "archivo").replace(/[^\w.\- ()]/g, "").slice(0, 120) || "archivo",
		type: mime,
		size: buffer.length,
		createdAt: new Date().toISOString(),
	};
	if (mime.startsWith("audio/") && seconds) upload.duration = seconds;
	uploads[id] = upload;
	dirty = true;
	scheduleSave();
	return { upload };
}

export function getChatAttachment(id) {
	const clean = String(id || "");
	if (!/^[a-f0-9]{32}$/.test(clean)) return null;
	const full = path.join(UPLOAD_DIR, `${clean}.bin`);
	if (!fs.existsSync(full)) return null;
	return { path: full };
}

export function listChat({
	username,
	channelId = GENERAL,
	after = 0,
	before = 0,
	limit = 200,
} = {}) {
	const channel = channelFor(username, channelId);
	if (!channel) return { error: "forbidden" };
	if (trimMessages()) scheduleSave();
	const afterSeq = Math.max(0, Number.parseInt(after, 10) || 0);
	const beforeSeq = Math.max(0, Number.parseInt(before, 10) || 0);
	const max = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 200));
	const all = messages.filter((message) => message.channelId === channel.id);
	const oldestSeq = all.length ? all[0].seq : nextSeq;
	const selected = beforeSeq
		? all.filter((message) => message.seq < beforeSeq).slice(-max)
		: all.filter((message) => message.seq > afterSeq).slice(0, max);
	const lower = String(username || "").toLowerCase();
	const pinned = all.filter((message) => message.pinned);
	return {
		channelId: channel.id,
		messages: selected.map((message) => ({ ...message })),
		pinned: pinned
			.sort((a, b) => new Date(b.pinnedAt || 0) - new Date(a.pinnedAt || 0))
			.slice(0, 20)
			.map((message) => ({ ...message })),
		latestSeq: all.length ? all[all.length - 1].seq : nextSeq - 1,
		oldestSeq: selected.length ? selected[0].seq : oldestSeq,
		readSeq: Number(reads[lower]?.[channel.id]) || 0,
		hasMore: beforeSeq
			? selected.length === max && all.some((message) => message.seq < selected[0].seq)
			: all.some(
					(message) =>
						message.seq >
						(selected.length ? selected[selected.length - 1].seq : afterSeq),
				),
		generation,
		revision,
		reset: !beforeSeq && afterSeq > 0 && afterSeq < oldestSeq - 1,
	};
}

export function getChatMessage(id) {
	return messages.find((message) => message.id === String(id || "")) || null;
}

export function deleteChatMessage(id) {
	const index = messages.findIndex((message) => message.id === String(id || ""));
	if (index === -1) return null;
	const [removed] = messages.splice(index, 1);
	removeFile(removed);
	generation += 1;
	revision += 1;
	dirty = true;
	saveNow();
	return { ...removed };
}

export function deleteChatMessagesByUser(username) {
	const wanted = String(username || "").toLowerCase();
	const before = messages.length;
	for (const message of messages) {
		if (message.username.toLowerCase() === wanted) removeFile(message);
	}
	messages = messages.filter((message) => message.username.toLowerCase() !== wanted);
	delete reads[wanted];
	lastPost.delete(wanted);
	if (messages.length !== before) {
		generation += 1;
		revision += 1;
		dirty = true;
		saveNow();
	}
	return before - messages.length;
}

export function clearChat() {
	for (const message of messages) removeFile(message);
	messages = [];
	reads = {};
	uploads = {};
	generation += 1;
	revision += 1;
	lastPost.clear();
	dirty = true;
	saveNow();
}

export function listChatNotifications(username, { after = 0, limit = 10 } = {}) {
	const lower = String(username || "").toLowerCase();
	const visible = new Set(
		channels
			.filter(
				(channel) =>
					channel.type === "public" ||
					channel.members.some((member) => member.toLowerCase() === lower),
			)
			.map((channel) => channel.id),
	);
	const afterSeq = Math.max(0, Number.parseInt(after, 10) || 0);
	const max = Math.min(20, Math.max(1, Number.parseInt(limit, 10) || 10));
	const found = messages
		.filter(
			(message) =>
				message.seq > afterSeq &&
				visible.has(message.channelId) &&
				String(message.username).toLowerCase() !== lower,
		)
		.slice(-max);
	return {
		messages: found.map((message) => ({ ...message })),
		latestSeq: messages.length ? messages[messages.length - 1].seq : 0,
		unread: getChatUnread(username).unread,
	};
}

export function getChatUnread(username) {
	const lower = String(username || "").toLowerCase();
	let unread = 0;
	const perChannel = [];
	for (const channel of listChatChannels(username)) {
		if (channel.unread) perChannel.push(channel);
		unread += channel.unread;
	}
	return {
		unread,
		read: 0,
		latestSeq: messages.length ? messages[messages.length - 1].seq : nextSeq - 1,
		channels: perChannel,
	};
}

export function markChatRead(username, channelId = GENERAL, seq = 0) {
	const lower = String(username || "").toLowerCase();
	if (!channelFor(username, channelId)) return { error: "forbidden" };
	const value = Math.max(0, Number.parseInt(seq, 10) || 0);
	reads[lower] = reads[lower] || {};
	if ((reads[lower][channelId] || 0) < value) {
		reads[lower][channelId] = value;
		dirty = true;
		scheduleSave();
	}
	return { ok: true };
}

export function exportChat() {
	return {
		generation,
		revision,
		messages: messages.map((message) => ({ ...message })),
		channels: channels.map((channel) => ({ ...channel })),
		reads: JSON.parse(JSON.stringify(reads)),
		uploads: JSON.parse(JSON.stringify(uploads)),
	};
}

export function flushChat() {
	saveNow();
}

load();
setInterval(() => {
	if (trimMessages()) scheduleSave();
}, 10 * 60 * 1000).unref();

export function isChannelMember(username, channelId) {
	return !!channelFor(username, channelId);
}

export function getChatAttachmentMessage(attachmentId) {
	const id = String(attachmentId || "");
	return messages.find((message) => message.attachment?.id === id) || null;
}
