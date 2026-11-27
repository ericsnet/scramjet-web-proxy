(() => {
	const form = document.getElementById("invite-form");
	if (!form) return;
	const input = document.getElementById("invite-avatar");
	const message = document.getElementById("invite-avatar-msg");
	const preview = document.getElementById("invite-avatar-preview");
	const submit = document.getElementById("invite-submit");
	let uploading = false;

	const show = (text, ok = false) => {
		if (!message) return;
		message.textContent = text;
		message.className = ok ? "hint" : "msg error";
	};

	input?.addEventListener("change", async () => {
		const file = input.files?.[0];
		if (!file) {
			if (preview) {
				preview.classList.remove("visible");
				preview.removeAttribute("src");
			}
			show("PNG, JPG o WebP · máximo 2 MB");
			return;
		}
		if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
			input.value = "";
			show("La foto debe ser PNG, JPG o WebP.");
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			input.value = "";
			show("La foto no puede superar 2 MB.");
			return;
		}
		const token = form.querySelector('input[name="token"]')?.value || "";
		const csrf = form.querySelector('input[name="csrf"]')?.value || "";
		uploading = true;
		if (submit) submit.disabled = true;
		show("Subiendo foto…", true);
		try {
			const response = await fetch("/api/invite/avatar", {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": file.type,
					"X-Invite-Token": token,
					"X-CSRF-Token": csrf,
					Accept: "application/json",
				},
				body: file,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.message || "No se pudo subir la foto.");
			}
			if (preview) {
				preview.src = URL.createObjectURL(file);
				preview.classList.add("visible");
			}
			show("Foto lista. Se aplicará al crear la cuenta.", true);
		} catch (error) {
			input.value = "";
			if (preview) {
				preview.classList.remove("visible");
				preview.removeAttribute("src");
			}
			show(error.message || "No se pudo subir la foto.");
		} finally {
			uploading = false;
			if (submit) submit.disabled = false;
		}
	});

	form.addEventListener("submit", (event) => {
		if (!uploading) return;
		event.preventDefault();
		show("Espera a que termine de subir la foto.");
	});
})();
