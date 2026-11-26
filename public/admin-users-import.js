(() => {
	const file = document.getElementById("users-import-file");
	const run = document.getElementById("users-import-run");
	const out = document.getElementById("users-import-result");
	if (!file || !run || !out) return;

	function parseCsv(text) {
		const rows = [];
		let row = [];
		let cell = "";
		let quoted = false;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			if (quoted) {
				if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
				else if (ch === '"') quoted = false;
				else cell += ch;
			} else if (ch === '"') quoted = true;
			else if (ch === ",") { row.push(cell); cell = ""; }
			else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
			else if (ch !== "\r") cell += ch;
		}
		row.push(cell);
		if (row.some((value) => value.trim())) rows.push(row);
		return rows;
	}

	run.addEventListener("click", async () => {
		out.style.display = "block";
		out.textContent = "Leyendo…";
		const selected = file.files?.[0];
		if (!selected) {
			out.textContent = "Selecciona un archivo CSV.";
			return;
		}
		if (selected.size > 512 * 1024) {
			out.textContent = "El CSV es demasiado grande (máximo 512 KB).";
			return;
		}
		const rows = parseCsv(await selected.text());
		if (!rows.length) {
			out.textContent = "El CSV está vacío.";
			return;
		}
		const header = rows[0].map((value) => value.trim().toLowerCase());
		const start = header[0] === "usuario" || header[0] === "username" ? 1 : 0;
		const users = rows.slice(start, start + 200).map((row) => ({
			username: row[0] || "",
			roles: String(row[1] || "user")
				.split(/[|+,]/)
				.map((value) => value.trim().toLowerCase())
				.filter(Boolean),
			password: row[2] || "",
		}));
		out.textContent = "Importando " + users.length + " usuarios…";
		try {
			const response = await fetch("/api/admin/users/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ users }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				out.textContent = "Error: " + (data.error || response.status);
				return;
			}
			const lines = [];
			if (data.created?.length) {
				lines.push("Creados:");
				for (const entry of data.created) {
					lines.push(`  ${entry.username} (${entry.role})${entry.password ? ` — contraseña temporal: ${entry.password}` : ""}`);
				}
			}
			if (data.errors?.length) {
				lines.push("", "Errores:");
				for (const error of data.errors) lines.push(`  ${error}`);
			}
			if (!lines.length) lines.push("No se creó ningún usuario.");
			out.textContent = lines.join("\n");
		} catch {
			out.textContent = "No se pudo importar el CSV.";
		}
	});
})();
