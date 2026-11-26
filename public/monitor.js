(() => {
	const usersBox = document.getElementById("monitor-users");
	if (!usersBox) return;
	const currentUser = String(usersBox.dataset.currentUser || "").toLowerCase();
	let inFlight = false;
	let stopped = false;

	const esc = (value) =>
		String(value ?? "")
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#39;");
	const roleLabel = (role) =>
		role === "creator" ? "creador" : role === "admin" ? "administrador" : role === "moderator" ? "moderador" : "usuario";
	const fullDate = (value) => {
		try {
			return new Date(value).toLocaleString("es-ES", {
				dateStyle: "short",
				timeStyle: "medium",
				timeZone: "Europe/Madrid",
			});
		} catch {
			return String(value || "");
		}
	};
	const avatar = (entry) => {
		const name = String(entry.username || "?");
		const initial = name.slice(0, 1).toUpperCase();
		const image = entry.icon?.url
			? `<img src="${esc(entry.icon.url)}" alt="" loading="lazy">`
			: initial;
		return `<span class="user-avatar" style="background:hsl(${((name.charCodeAt(0) || 0) * 31) % 360} 42% 32%)">${image}</span>`;
	};
	const renderUser = (entry) => {
		const current = entry.current;
		const canKick = String(entry.username || "").toLowerCase() !== currentUser;
		const streams = (entry.streams || [])
			.map(
				(stream) =>
					`<span class="monitor-stream" title="${esc(stream.host)}:${esc(stream.port)}">${esc(stream.host)}:${esc(stream.port)}</span>`,
			)
			.join("");
		return `<div class="monitor-user">
  <div class="monitor-user-head">
    ${avatar(entry)}
    <div class="monitor-user-title">
      <strong><a class="profile-link" href="/u/${encodeURIComponent(entry.username)}">${esc(entry.username)}</a></strong>
      <span class="badge role-${esc(entry.role)}">${esc(roleLabel(entry.role))}</span>
      <span class="badge ${entry.online ? "monitor-online" : "monitor-offline"}">${entry.online ? "en línea" : "inactivo"}</span>
    </div>
    <span class="monitor-time" title="Última actividad">${esc(fullDate(entry.lastActiveAt || entry.lastSeenAt))}</span>
  </div>
  <div class="monitor-current">
    <span class="monitor-label">Última web</span>
    ${
			current
				? `<span class="monitor-url" title="${esc(current.url || current.query)}">${esc(current.url || "Solo búsqueda")}</span>${current.query ? `<span class="monitor-query">Búsqueda: ${esc(current.query)}</span>` : ""}`
				: '<span class="monitor-url">Sin navegación registrada</span>'
		}
  </div>
  <div class="monitor-meta"><span>${esc((entry.ips || []).join(" · ") || "IP desconocida")}</span><span>${esc(entry.sessions)} sesión${entry.sessions === 1 ? "" : "es"}</span><span title="${esc(entry.userAgent || "")}">${esc((entry.userAgent || "").slice(0, 60))}</span></div>
  ${streams ? `<div class="monitor-streams">${streams}</div>` : ""}
  <div class="monitor-actions">
    <a class="small" href="/admin/activity?user=${encodeURIComponent(entry.username)}">Ver historial</a>
    ${canKick ? `<button class="small danger" type="button" data-kick="${esc(entry.username)}" title="Cierra sus sesiones y pestañas al instante">Echar ahora</button>` : ""}
  </div>
</div>`;
	};
	const renderRecent = (entry) =>
		`<tr>
  <td class="mono">${esc(fullDate(entry.at))}</td>
  <td><strong><a class="profile-link" href="/u/${encodeURIComponent(entry.username)}">${esc(entry.username)}</a></strong></td>
  <td class="mono">${esc(entry.url || "—")}${entry.query ? `<br><span class="muted">Búsqueda: ${esc(entry.query)}</span>` : ""}</td>
</tr>`;

	const update = (data) => {
		const users = Array.isArray(data.users) ? data.users : [];
		const recent = Array.isArray(data.recent) ? data.recent : [];
		const stats = data.stats || {};
		usersBox.innerHTML =
			users.map(renderUser).join("") ||
			'<p class="empty">No hay sesiones activas.</p>';
		const count = document.getElementById("monitor-user-count");
		if (count) count.textContent = String(users.length);
		const map = {
			"monitor-online": stats.online || 0,
			"monitor-sessions": stats.sessions || 0,
			"monitor-streams": stats.streams || 0,
			"monitor-recent": stats.recent || 0,
		};
		for (const [id, value] of Object.entries(map)) {
			const el = document.getElementById(id);
			if (el) el.textContent = String(value);
		}
		const body = document.getElementById("monitor-recent-body");
		if (body) {
			body.innerHTML =
				recent.map(renderRecent).join("") ||
				'<tr><td colspan="3" class="empty">Sin actividad reciente.</td></tr>';
		}
		const updated = document.getElementById("monitor-updated");
		if (updated) updated.textContent = `Actualizado: ${fullDate(data.generatedAt)}`;
	};

	async function refresh() {
		if (inFlight || stopped || document.hidden) return;
		inFlight = true;
		try {
			const response = await fetch("/api/admin/monitor", {
				cache: "no-store",
				headers: { Accept: "application/json" },
			});
			if (response.status === 401) {
				stopped = true;
				location.href = "/login?next=%2Fadmin%2Fmonitor";
				return;
			}
			if (!response.ok) return;
			update(await response.json());
		} catch {
		} finally {
			inFlight = false;
		}
	}

	usersBox.addEventListener("click", async (event) => {
		const button = event.target.closest("[data-kick]");
		if (!button) return;
		const username = button.getAttribute("data-kick");
		if (!username) return;
		if (!confirm(`¿Echar a ${username} ahora? Se cerrarán todas sus sesiones y pestañas inmediatamente.`)) return;
		const original = button.textContent;
		button.disabled = true;
		button.textContent = "Echando…";
		try {
			const response = await fetch(`/api/admin/users/${encodeURIComponent(username)}/logout`, {
				method: "POST",
				cache: "no-store",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded",
				},
			});
			if (!response.ok) throw new Error("kick failed");
			button.textContent = "Echado";
		} catch {
			button.disabled = false;
			button.textContent = original;
			alert("No se pudo echar al usuario.");
		}
		setTimeout(refresh, 350);
	});

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refresh();
	});
	refresh();
	setInterval(refresh, 3000);
})();
