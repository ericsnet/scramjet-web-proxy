(() => {
	const input = document.getElementById("account-icon-file");
	const pick = document.getElementById("account-icon-pick");
	const message = document.getElementById("account-icon-msg");
	if (!input || !pick) return;

	const show = (text, ok = false) => {
		if (!message) return;
		message.textContent = text;
		message.className = `msg ${ok ? "ok" : "error"}`;
	};

	pick.addEventListener("click", () => input.click());

	input.addEventListener("change", async () => {
		const file = input.files?.[0];
		if (!file) return;
		const contentType = ["image/png", "image/jpeg", "image/webp"].includes(file.type)
			? file.type
			: "application/octet-stream";
		if (file.size > 2 * 1024 * 1024) {
			show("La imagen supera el límite de 2 MB.");
			input.value = "";
			return;
		}
		show("Subiendo icono…", true);
		try {
			const response = await fetch("/api/account/icon", {
				method: "POST",
				headers: {
					"Content-Type": contentType,
					Accept: "application/json",
				},
				body: file,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				show(data.message || "No se pudo guardar el icono.");
				return;
			}
			show("Icono actualizado. Recargando…", true);
			setTimeout(() => location.reload(), 450);
		} catch {
			show("No se pudo conectar con el servidor.");
		} finally {
			input.value = "";
		}
	});
})();
