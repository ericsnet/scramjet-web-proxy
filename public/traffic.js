(() => {
	const requestsBody = document.getElementById("traffic-requests");
	if (!requestsBody) return;
	let stopped = false;
	let inFlight = false;
	let sparkSamples = [];
	let sparkSeeded = false;

	const $ = (id) => document.getElementById(id);
	const bytes = (value) => {
		let n = Number(value) || 0;
		if (n < 1024) return `${n} B`;
		const units = ["KB", "MB", "GB", "TB"];
		let i = 0;
		n /= 1024;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
	};
	const statusClass = (status) => `badge status-${Math.floor((Number(status) || 0) / 100)}xx`;
	const cell = (text, className = "") => {
		const td = document.createElement("td");
		if (className) td.className = className;
		td.textContent = text;
		return td;
	};
	const emptyRow = (columns, text) => {
		const tr = document.createElement("tr");
		const td = document.createElement("td");
		td.colSpan = columns;
		td.className = "empty";
		td.textContent = text;
		tr.appendChild(td);
		return tr;
	};
	const renderRequests = (items) => {
		requestsBody.textContent = "";
		if (!items?.length) {
			requestsBody.appendChild(emptyRow(5, "Esperando tráfico…"));
			return;
		}
		for (const item of items) {
			const tr = document.createElement("tr");
			tr.appendChild(cell(String(item.at || "").slice(11, 19), "mono"));
			const status = document.createElement("td");
			const badge = document.createElement("span");
			badge.className = statusClass(item.status);
			badge.textContent = String(item.status || "");
			status.appendChild(badge);
			tr.appendChild(status);
			tr.appendChild(cell(`${item.method || ""} ${item.path || ""}`, "mono"));
			tr.appendChild(cell(`${item.ms || 0} ms`));
			tr.appendChild(cell(item.user || item.ip || "—"));
			requestsBody.appendChild(tr);
		}
	};
	const renderHosts = (items) => {
		const body = $("traffic-hosts");
		if (!body) return;
		body.textContent = "";
		if (!items?.length) {
			body.appendChild(emptyRow(5, "Sin conexiones Wisp."));
			return;
		}
		for (const item of items) {
			const tr = document.createElement("tr");
			tr.appendChild(cell(item.host, "mono"));
			tr.appendChild(cell(String(item.active || 0)));
			tr.appendChild(cell(String(item.opened || 0)));
			tr.appendChild(cell(bytes(item.bytesOut || 0)));
			tr.appendChild(cell((item.users || []).slice(0, 3).join(", ") || "—"));
			body.appendChild(tr);
		}
	};
	const renderStreams = (items) => {
		const body = $("traffic-active-streams");
		if (!body) return;
		body.textContent = "";
		if (!items?.length) {
			body.appendChild(emptyRow(4, "Sin streams activos."));
			return;
		}
		for (const item of items) {
			const tr = document.createElement("tr");
			tr.appendChild(cell(`${item.host}:${item.port}`, "mono"));
			tr.appendChild(cell(item.type || "TCP"));
			tr.appendChild(cell(item.username || "—"));
			tr.appendChild(cell(bytes((item.bytesIn || 0) + (item.bytesOut || 0))));
			body.appendChild(tr);
		}
	};
	const renderSparkline = (value) => {
		const box = $("traffic-sparkline");
		if (!box) return;
		if (!sparkSeeded) {
			sparkSamples = Array(39).fill(0);
			sparkSeeded = true;
		}
		const number = Math.max(0, Number(value) || 0);
		sparkSamples.push(number);
		if (sparkSamples.length > 40) sparkSamples.shift();
		const max = Math.max(1, ...sparkSamples);
		box.textContent = "";
		for (const sample of sparkSamples) {
			const bar = document.createElement("i");
			bar.className = "traffic-spark";
			bar.style.height = `${Math.max(3, Math.round((sample / max) * 112))}px`;
			bar.title = `${sample} peticiones/s`;
			box.appendChild(bar);
		}
		if ($("traffic-spark-max")) $("traffic-spark-max").textContent = `máx. ${max}/s`;
	};
	const renderStatus = (counts = {}) => {
		const box = $("traffic-status-bars");
		if (!box) return;
		const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0) || 1;
		box.textContent = "";
		for (const code of ["2xx", "3xx", "4xx", "5xx"]) {
			const row = document.createElement("div");
			row.className = "traffic-bar-row";
			const label = document.createElement("span");
			label.textContent = code;
			const track = document.createElement("div");
			track.className = "traffic-bar";
			const fill = document.createElement("i");
			fill.className = `bar-${code}`;
			fill.style.width = `${Math.round(((Number(counts[code]) || 0) / total) * 100)}%`;
			track.appendChild(fill);
			const count = document.createElement("b");
			count.textContent = String(counts[code] || 0);
			row.append(label, track, count);
			box.appendChild(row);
		}
	};
	const renderTopPaths = (paths = []) => {
		const box = $("traffic-top-paths");
		if (!box) return;
		box.textContent = "";
		if (!paths.length) {
			const empty = document.createElement("p");
			empty.className = "empty";
			empty.textContent = "Sin datos todavía.";
			box.appendChild(empty);
			return;
		}
		const max = Number(paths[0]?.count) || 1;
		for (const item of paths.slice(0, 6)) {
			const row = document.createElement("div");
			row.className = "traffic-bar-row";
			const label = document.createElement("span");
			label.className = "mono";
			label.textContent = item.path;
			const track = document.createElement("div");
			track.className = "traffic-bar";
			const fill = document.createElement("i");
			fill.className = "bar-path";
			fill.style.width = `${Math.round(((Number(item.count) || 0) / max) * 100)}%`;
			track.appendChild(fill);
			const count = document.createElement("b");
			count.textContent = String(item.count || 0);
			row.append(label, track, count);
			box.appendChild(row);
		}
	};
	const update = (data) => {
		const http = data.http || {};
		const wisp = data.wisp || {};
		if ($("traffic-rps")) $("traffic-rps").textContent = String(http.requestsPerSecond || 0);
		if ($("traffic-minute")) $("traffic-minute").textContent = String(http.lastMinute || 0);
		if ($("traffic-users")) $("traffic-users").textContent = String(http.activeUsers || 0);
		if ($("traffic-sessions")) $("traffic-sessions").textContent = String(data.sessions || 0);
		if ($("traffic-streams-count")) $("traffic-streams-count").textContent = String(wisp.activeStreams || 0);
		if ($("traffic-bytes")) $("traffic-bytes").textContent = bytes((wisp.bytesIn || 0) + (wisp.bytesOut || 0));
		if ($("traffic-alerts")) $("traffic-alerts").textContent = String(data.security?.open || 0);
		if ($("traffic-updated")) {
			$("traffic-updated").textContent = `Actualizado: ${new Date(data.generatedAt || Date.now()).toLocaleTimeString("es-ES")}`;
		}
		renderSparkline(http.requestsPerSecond || 0);
		renderStatus(http.statusCounts || {});
		renderTopPaths(http.topPaths || []);
		renderRequests((http.recent || []).slice(0, 20));
		renderHosts(wisp.hosts || []);
		renderStreams(wisp.streams || []);
	};
	async function refresh() {
		if (stopped || inFlight || document.hidden) return;
		inFlight = true;
		try {
			const response = await fetch("/api/admin/traffic", {
				cache: "no-store",
				headers: { Accept: "application/json" },
			});
			if (response.status === 401) {
				stopped = true;
				location.href = "/login?next=%2Fadmin%2Ftraffic";
				return;
			}
			if (!response.ok) return;
			update(await response.json());
		} catch {
		} finally {
			inFlight = false;
		}
	}
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refresh();
	});
	refresh();
	setInterval(refresh, 2500);
})();
