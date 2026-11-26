(() => {
	const list = document.getElementById("qa-tests");
	const form = document.getElementById("qa-add-form");
	const newTitle = document.getElementById("qa-new-title");
	const reset = document.getElementById("qa-reset");
	const exportButton = document.getElementById("qa-export");
	const envBox = document.getElementById("qa-env");
	const copyEnv = document.getElementById("qa-copy-env");
	if (!list) return;

	const KEY = "pw_qa_tests_v1";
	const DEFAULTS = [
		{ id: "auth-login", group: "Autenticación", title: "Login, logout y sesión" },
		{ id: "auth-mfa", group: "Autenticación", title: "MFA: activar, entrar, recuperar y desactivar" },
		{ id: "proxy-basic", group: "Proxy", title: "Abrir webs normales y volver atrás" },
		{ id: "proxy-media", group: "Proxy", title: "Vídeo/audio, búsqueda y pantalla completa" },
		{ id: "proxy-block", group: "Proxy", title: "Sitio bloqueado y solicitud de desbloqueo" },
		{ id: "user-data", group: "Usuario", title: "Favoritos, historial, bóveda y cuenta" },
		{ id: "chat-basic", group: "Chat", title: "Enviar, responder, editar y borrar mensaje" },
		{ id: "chat-files", group: "Chat", title: "Adjuntar imagen/PDF/audio, grabar voz, pegar y arrastrar" },
		{ id: "chat-mod", group: "Chat", title: "Fijar, buscar y moderar mensajes" },
		{ id: "admin-users", group: "Administración", title: "Crear usuario, roles múltiples y bloquear" },
		{ id: "admin-settings", group: "Administración", title: "Ajustes, mantenimiento y cuarentena" },
		{ id: "admin-reports", group: "Administración", title: "Crear informe y verlo en su ficha" },
		{ id: "mobile", group: "Responsive", title: "Móvil: teclado, scroll, modales y menús" },
		{ id: "i18n", group: "Idiomas", title: "Español, inglés y catalán" },
	];
	const STATUS = {
		pending: "Pendiente",
		pass: "Pasa",
		fail: "Falla",
		blocked: "Bloqueado",
	};
	let state = { states: {}, custom: [] };

	const load = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
			state = {
				states: parsed.states && typeof parsed.states === "object" ? parsed.states : {},
				custom: Array.isArray(parsed.custom) ? parsed.custom : [],
			};
		} catch {
			state = { states: {}, custom: [] };
		}
	};
	const save = () => {
		try {
			localStorage.setItem(KEY, JSON.stringify(state));
		} catch {}
	};
	const tests = () => [...DEFAULTS, ...state.custom];
	const statusOf = (id) => state.states[id]?.status || "pending";
	const noteOf = (id) => state.states[id]?.note || "";

	function render() {
		list.textContent = "";
		const items = tests();
		for (const test of items) {
			const row = document.createElement("div");
			row.className = "qa-test";
			const info = document.createElement("div");
			info.className = "qa-test-info";
			const title = document.createElement("strong");
			title.textContent = test.title;
			const group = document.createElement("small");
			group.textContent = test.group;
			info.append(title, group);
			const statusWrap = document.createElement("div");
			statusWrap.className = "qa-status-buttons";
			for (const [value, label] of Object.entries(STATUS)) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = `small qa-status ${value}${statusOf(test.id) === value ? " active" : ""}`;
				button.textContent = label;
				button.addEventListener("click", () => {
					state.states[test.id] = { status: value, note: noteOf(test.id) };
					save();
					render();
				});
				statusWrap.appendChild(button);
			}
			const note = document.createElement("input");
			note.className = "qa-note";
			note.maxLength = 500;
			note.placeholder = "Nota del caso…";
			note.value = noteOf(test.id);
			note.addEventListener("input", () => {
				const current = state.states[test.id] || { status: "pending", note: "" };
				state.states[test.id] = { ...current, note: note.value };
				save();
			});
			row.append(info, statusWrap, note);
			list.appendChild(row);
		}
	}

	form?.addEventListener("submit", (event) => {
		event.preventDefault();
		const title = newTitle?.value.trim();
		if (!title) return;
		state.custom.push({
			id: `custom-${Date.now().toString(36)}`,
			group: "Personal",
			title,
		});
		newTitle.value = "";
		save();
		render();
	});
	reset?.addEventListener("click", () => {
		if (!confirm("¿Restablecer el banco de pruebas? Se borrarán estados y casos personalizados.")) return;
		state = { states: {}, custom: [] };
		save();
		render();
	});
	exportButton?.addEventListener("click", () => {
		const payload = {
			exportedAt: new Date().toISOString(),
			tests: tests().map((test) => ({
				...test,
				status: statusOf(test.id),
				note: noteOf(test.id),
			})),
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `qa-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	});

	const environment = () => [
		`URL: ${location.href}`,
		`User-Agent: ${navigator.userAgent}`,
		`Plataforma: ${navigator.platform || "—"}`,
		`Idioma: ${navigator.language}`,
		`Zona horaria: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
		`Pantalla: ${screen.width}×${screen.height} @${devicePixelRatio}x`,
		`Ventana: ${innerWidth}×${innerHeight}`,
		`Online: ${navigator.onLine ? "sí" : "no"}`,
		`Núcleos: ${navigator.hardwareConcurrency || "—"}`,
		`Memoria: ${navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "—"}`,
	].join("\n");
	if (envBox) envBox.textContent = environment();
	copyEnv?.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(environment());
			copyEnv.textContent = "Copiado";
			setTimeout(() => { copyEnv.textContent = "Copiar entorno"; }, 1200);
		} catch {
			copyEnv.textContent = "No se pudo copiar";
		}
	});

	load();
	render();
})();
