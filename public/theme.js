(() => {
	if (window.__pwTheme) return;
	window.__pwTheme = true;

	const root = document.documentElement;
	const buttons = () => document.querySelectorAll("[data-theme-toggle]");

	function current() {
		return root.dataset.theme === "light" ? "light" : "dark";
	}

	function store(theme) {
		root.dataset.theme = theme;
		try {
			document.cookie = `pw_theme=${theme}; Path=/; SameSite=Lax; Max-Age=31536000`;
			localStorage.setItem("pw-theme", theme);
		} catch {}
		for (const button of buttons()) {
			button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
			button.title = theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro";
		}
	}

	function save(theme) {
		store(theme);
		const authenticated = Boolean(
			document.querySelector('form[action="/logout"], a[href="/logout"]'),
		);
		if (!authenticated) return;
		fetch("/api/account/theme", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({ theme }),
			cache: "no-store",
		}).catch(() => {});
	}

	store(current());

	document.addEventListener("click", (event) => {
		const button = event.target.closest?.("[data-theme-toggle]");
		if (!button) return;
		event.preventDefault();
		save(current() === "light" ? "dark" : "light");
	});

	for (const button of buttons()) {
		button.setAttribute("aria-pressed", current() === "light" ? "true" : "false");
	}
})();
