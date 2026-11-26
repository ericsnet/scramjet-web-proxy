(() => {
	if (window.__sessionGuardLoaded) return;
	window.__sessionGuardLoaded = true;

	let source = null;
	let leaving = false;
	let checking = false;

	function leave(reason = "forced") {
		if (leaving) return;
		leaving = true;
		try {
			source?.close();
		} catch {}
		const overlay = document.createElement("div");
		overlay.setAttribute("role", "alert");
		overlay.style.cssText =
			"position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;" +
			"background:#0b1220;color:#dbeafe;font:600 16px/1.4 system-ui,sans-serif;text-align:center;padding:24px";
		overlay.textContent = "Sesión cerrada. Volviendo al inicio de sesión…";
		try {
			document.body.appendChild(overlay);
		} catch {}
		const params = new URLSearchParams({ kicked: reason || "forced" });
		location.replace(`/login?${params.toString()}`);
	}

	function connect() {
		if (!("EventSource" in window)) return;
		try {
			source = new EventSource("/api/session/events");
		} catch {
			return;
		}
		source.addEventListener("session-end", (event) => {
			let reason = "forced";
			try {
				reason = JSON.parse(event.data)?.reason || reason;
			} catch {}
			leave(reason);
		});
	}

	async function verify() {
		if (leaving || checking || document.visibilityState === "hidden") return;
		checking = true;
		try {
			const response = await fetch("/api/me", {
				cache: "no-store",
				headers: { Accept: "application/json" },
			});
			if (response.status === 401) leave("expired");
			else if (response.status === 403) leave("banned");
		} catch {}
		checking = false;
	}

	connect();
	document.addEventListener("visibilitychange", verify);
	window.addEventListener("focus", verify);
})();
