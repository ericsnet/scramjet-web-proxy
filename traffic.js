import { normalizeIp } from "./ip.js";

const MAX_EVENTS = 300;
const SKIP_PATH =
	/^\/(?:scramjet|controller|libcurl|favicon|page-i18n\.js|chat-notify\.js|chat\.js|index\.js|index\.css|sw\.js|healthz|robots\.txt|admin\/error-preview|account-icon\.js|monitor\.js|session-guard\.js|password-manager\.(?:js|css)|error-503\.html|avatar)/;

const events = [];
const streams = new Map();
const hosts = new Map();
const users = new Map();
let openedTotal = 0;
let bytesIn = 0;
let bytesOut = 0;

function clientIp(req) {
	return normalizeIp(String(req.ip || req.socket?.remoteAddress || "").slice(0, 64));
}

function hostEntry(host) {
	const key = String(host || "desconocido").slice(0, 200);
	if (!hosts.has(key)) {
		hosts.set(key, {
			host: key,
			active: 0,
			opened: 0,
			bytesIn: 0,
			bytesOut: 0,
			lastAt: null,
			users: new Set(),
		});
	}
	return hosts.get(key);
}

function userEntry(username) {
	const key = String(username || "anónimo").slice(0, 64);
	if (!users.has(key)) {
		users.set(key, {
			username: key,
			active: 0,
			opened: 0,
			bytesIn: 0,
			bytesOut: 0,
			lastAt: null,
		});
	}
	return users.get(key);
}

export function recordHttp(req, res, startedAt) {
	const pathname = String(req.path || req.originalUrl || "").split("?")[0];
	if (!pathname || SKIP_PATH.test(pathname)) return;
	// No registrar el propio polling del panel ni su JavaScript.
	if (pathname === "/api/session/events" || pathname === "/api/admin/traffic" || pathname === "/api/admin/monitor" || pathname === "/api/chat/notifications" || pathname === "/traffic.js" || pathname === "/monitor.js") return;
	const now = Date.now();
	const entry = {
		at: new Date(now).toISOString(),
		method: String(req.method || "").slice(0, 10),
		path: pathname.slice(0, 240),
		status: Number(res.statusCode) || 0,
		ms: Math.max(0, now - Number(startedAt || now)),
		ip: clientIp(req),
		user: req.user?.username || "",
	};
	events.push(entry);
	if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function wispOpen(connection, streamId, streamType, hostname, port) {
	const key = `${connection?.conn_id || "?"}:${streamId}`;
	const host = hostEntry(hostname);
	const user = userEntry(connection?.username || "anónimo");
	const now = new Date().toISOString();
	streams.set(key, {
		key,
		host: host.host,
		port: Number(port) || 0,
		type: Number(streamType) === 2 ? "UDP" : "TCP",
		username: user.username,
		openedAt: now,
		bytesIn: 0,
		bytesOut: 0,
	});
	host.active += 1;
	host.opened += 1;
	host.lastAt = now;
	host.users.add(user.username);
	user.active += 1;
	user.opened += 1;
	user.lastAt = now;
	openedTotal += 1;
}

export function wispClose(connection, streamId) {
	const key = `${connection?.conn_id || "?"}:${streamId}`;
	const stream = streams.get(key);
	if (!stream) return;
	streams.delete(key);
	const host = hostEntry(stream.host);
	const user = userEntry(stream.username);
	host.active = Math.max(0, host.active - 1);
	host.bytesIn += stream.bytesIn;
	host.bytesOut += stream.bytesOut;
	user.active = Math.max(0, user.active - 1);
	user.bytesIn += stream.bytesIn;
	user.bytesOut += stream.bytesOut;
}

export function wispBytes(connection, streamId, direction, amount) {
	const key = `${connection?.conn_id || "?"}:${streamId}`;
	const bytes = Math.max(0, Number(amount) || 0);
	if (!bytes) return;
	const stream = streams.get(key);
	if (stream) {
		if (direction === "in") stream.bytesIn += bytes;
		else stream.bytesOut += bytes;
	}
	if (direction === "in") bytesIn += bytes;
	else bytesOut += bytes;
}

export function trafficSnapshot() {
	const now = Date.now();
	const recent60 = events.filter(
		(event) => now - new Date(event.at).getTime() <= 60_000,
	);
	const ipUsers = new Set();
	const ipCounts = new Map();
	const statusCounts = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
	const pathCounts = new Map();
	for (const event of recent60) {
		if (event.ip) {
			ipCounts.set(event.ip, (ipCounts.get(event.ip) || 0) + 1);
			if (event.user) ipUsers.add(event.user);
		}
		const bucket = `${Math.floor(event.status / 100)}xx`;
		if (bucket in statusCounts) statusCounts[bucket] += 1;
		pathCounts.set(event.path, (pathCounts.get(event.path) || 0) + 1);
	}
	const activeStreams = [...streams.values()].map((stream) => ({ ...stream }));
	const topHosts = [...hosts.values()]
		.map((host) => ({
			...host,
			users: [...host.users],
		}))
		.sort((a, b) => b.active - a.active || b.opened - a.opened || b.bytesOut - a.bytesOut)
		.slice(0, 20);
	const topUsers = [...users.values()]
		.sort((a, b) => b.active - a.active || b.opened - a.opened)
		.slice(0, 20);
	const recent = events.slice(-60).reverse();
	return {
		generatedAt: new Date().toISOString(),
		http: {
			totalSeen: events.length,
			lastMinute: recent60.length,
			requestsPerSecond: Math.round((recent60.length / 60) * 10) / 10,
			activeUsers: ipUsers.size,
			activeIps: ipCounts.size,
			statusCounts,
			topPaths: [...pathCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10)
				.map(([pathname, count]) => ({ path: pathname, count })),
			recent,
		},
		wisp: {
			activeStreams: streams.size,
			openedTotal,
			bytesIn,
			bytesOut,
			streams: activeStreams.slice(0, 50),
			hosts: topHosts,
			users: topUsers,
		},
	};
}

export function flushTraffic() {
	/* El panel es en memoria; no hay datos que persistir. */
}
