import crypto from "node:crypto";
import { getMfa, setMfa, clearMfa, getUser } from "./auth.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ISSUER = "Inici Classroom";
const PERIOD = 30;
const DIGITS = 6;

function base32Encode(buffer) {
	let bits = 0;
	let value = 0;
	let output = "";
	for (const byte of buffer) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
	return output;
}

function base32Decode(input) {
	const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
	let bits = 0;
	let value = 0;
	const output = [];
	for (const char of clean) {
		const index = ALPHABET.indexOf(char);
		if (index < 0) continue;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			output.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(output);
}

function hotp(secret, counter) {
	const key = base32Decode(secret);
	if (!key.length) return "";
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64BE(BigInt(counter));
	const digest = crypto.createHmac("sha1", key).update(buffer).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	const binary =
		((digest[offset] & 0x7f) << 24) |
		((digest[offset + 1] & 0xff) << 16) |
		((digest[offset + 2] & 0xff) << 8) |
		(digest[offset + 3] & 0xff);
	return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function normalizeCode(code) {
	return String(code || "").replace(/[\s-]/g, "").trim();
}

export function currentTotp(secret) {
	return hotp(secret, Math.floor(Date.now() / 1000 / PERIOD));
}

export function verifyTotp(secret, code, window = 1) {
	const clean = normalizeCode(code);
	if (!/^\d{6}$/.test(clean)) return false;
	const counter = Math.floor(Date.now() / 1000 / PERIOD);
	for (let offset = -window; offset <= window; offset++) {
		const expected = hotp(secret, counter + offset);
		if (
			expected.length === clean.length &&
			crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))
		) {
			return true;
		}
	}
	return false;
}

function hashRecovery(code) {
	return crypto.createHash("sha256").update(normalizeCode(code).toLowerCase()).digest("hex");
}

function generateRecoveryCodes(count = 8) {
	const codes = [];
	for (let i = 0; i < count; i++) {
		const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
		codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
	}
	return codes;
}

function otpauthUri(username, secret) {
	const label = encodeURIComponent(`${ISSUER}:${username}`);
	const params = new URLSearchParams({
		secret,
		issuer: ISSUER,
		algorithm: "SHA1",
		digits: String(DIGITS),
		period: String(PERIOD),
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}

export function enrollmentInfo(username) {
	const mfa = getMfa(username);
	if (!mfa?.pendingSecret) return null;
	return {
		secret: mfa.pendingSecret,
		uri: otpauthUri(username, mfa.pendingSecret),
	};
}

export function mfaStatus(username) {
	const mfa = getMfa(username);
	return {
		enabled: !!mfa?.enabled,
		enabledAt: mfa?.enabledAt || "",
		recoveryRemaining: Array.isArray(mfa?.recovery)
			? mfa.recovery.filter((entry) => !entry.usedAt).length
			: 0,
	};
}

export function startEnrollment(username) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	const existing = getMfa(username);
	if (existing?.enabled) return { error: "enabled" };
	const secret = base32Encode(crypto.randomBytes(20));
	setMfa(username, {
		enabled: false,
		secret: "",
		pendingSecret: secret,
		pendingCreatedAt: new Date().toISOString(),
		recovery: existing?.recovery || [],
		enabledAt: "",
		lastUsedAt: "",
	});
	return { secret, uri: otpauthUri(user.username, secret) };
}

export function confirmEnrollment(username, code) {
	const mfa = getMfa(username);
	if (!mfa?.pendingSecret) return { error: "notstarted" };
	if (!verifyTotp(mfa.pendingSecret, code)) return { error: "invalid-code" };
	const codes = generateRecoveryCodes();
	setMfa(username, {
		enabled: true,
		secret: mfa.pendingSecret,
		pendingSecret: "",
		pendingCreatedAt: "",
		recovery: codes.map((value) => ({ hash: hashRecovery(value), usedAt: null })),
		enabledAt: new Date().toISOString(),
		lastUsedAt: "",
	});
	return { codes };
}

export function disableMfa(username) {
	clearMfa(username);
	return { ok: true };
}

export function verifySecondFactor(username, code) {
	const mfa = getMfa(username);
	if (!mfa?.enabled) return { error: "notenabled" };
	if (verifyTotp(mfa.secret, code)) {
		mfa.lastUsedAt = new Date().toISOString();
		setMfa(username, mfa);
		return { ok: true, method: "totp" };
	}
	const normalized = normalizeCode(code).toLowerCase();
	if (normalized) {
		const hash = hashRecovery(normalized);
		const entry = (mfa.recovery || []).find(
			(item) => !item.usedAt && item.hash === hash,
		);
		if (entry) {
			entry.usedAt = new Date().toISOString();
			mfa.lastUsedAt = new Date().toISOString();
			setMfa(username, mfa);
			return { ok: true, method: "recovery" };
		}
	}
	return { error: "invalid-code" };
}

export function regenerateRecoveryCodes(username) {
	const mfa = getMfa(username);
	if (!mfa?.enabled) return { error: "notenabled" };
	const codes = generateRecoveryCodes();
	mfa.recovery = codes.map((value) => ({ hash: hashRecovery(value), usedAt: null }));
	setMfa(username, mfa);
	return { codes };
}

export function isMfaEnabled(username) {
	return !!getMfa(username)?.enabled;
}
