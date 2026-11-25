(() => {
	if (window.__pwGlobalSearch) return;
	window.__pwGlobalSearch = true;

	const style = document.createElement("style");
	style.textContent = `
	.pw-search-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.62);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 24px}
	.pw-search-backdrop[hidden]{display:none!important}
	.pw-search-box{width:min(680px,100%);background:#0f172a;border:1px solid #243449;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.55);overflow:hidden}
	.pw-search-input{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid #243449;background:#111c2e;color:#e5edf7;font:inherit;font-size:16px;padding:16px 18px;outline:none}
	.pw-search-results{max-height:min(58vh,520px);overflow:auto;padding:8px}
	.pw-search-group{padding:8px 10px 4px;color:#8298af;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
	.pw-search-item{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:10px;color:#e5edf7;text-decoration:none;cursor:pointer}
	.pw-search-item:hover,.pw-search-item.active{background:rgba(59,130,246,.18)}
	.pw-search-icon{width:22px;text-align:center;color:#93c5fd}
	.pw-search-main{min-width:0;flex:1}
	.pw-search-main strong{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.pw-search-main small{display:block;color:#8298af;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
	.pw-search-empty{padding:28px 16px;text-align:center;color:#8298af;font-size:13px}
	.pw-search-hint{padding:8px 12px;border-top:1px solid #243449;color:#8298af;font-size:11px;display:flex;gap:14px;justify-content:space-between}
	`;
	document.head.appendChild(style);

	const backdrop = document.createElement("div");
	backdrop.className = "pw-search-backdrop";
	backdrop.hidden = true;
	backdrop.innerHTML = `
		<div class="pw-search-box" role="dialog" aria-modal="true" aria-label="Buscador global">
			<input class="pw-search-input" type="search" placeholder="Buscar favoritos, historial, secciones…" autocomplete="off" spellcheck="false">
			<div class="pw-search-results"></div>
			<div class="pw-search-hint"><span>↑ ↓ para mover · Enter para abrir · Esc para cerrar</span><span>Ctrl K</span></div>
		</div>`;
	document.body.appendChild(backdrop);

	const input = backdrop.querySelector(".pw-search-input");
	const results = backdrop.querySelector(".pw-search-results");
	let items = [];
	let active = -1;
	let timer = null;
	let requestId = 0;
	let config = null;

	function hide() {
		backdrop.hidden = true;
		backdrop.style.display = "none";
		input.value = "";
		results.replaceChildren();
		items = [];
		active = -1;
	}

	function show() {
		backdrop.hidden = false;
		backdrop.style.display = "flex";
		input.focus();
		input.select();
		if (!input.value.trim()) render([], "Escribe al menos 2 caracteres.");
	}

	function searchUrl(query) {
		const engine = String(config?.defaultSearchEngine || "duckduckgo");
		if (engine === "google") return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
		if (engine === "bing") return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
		return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
	}

	function gotoUrl(url, query) {
		const target = url || searchUrl(query || "");
		return `/?goto=${encodeURIComponent(target)}&gid=search-${Date.now().toString(36)}`;
	}

	function makeItem({ icon, title, subtitle, href }) {
		const item = document.createElement("a");
		item.className = "pw-search-item";
		item.href = href;
		const iconEl = document.createElement("span");
		iconEl.className = "pw-search-icon";
		iconEl.textContent = icon;
		const main = document.createElement("span");
		main.className = "pw-search-main";
		const strong = document.createElement("strong");
		strong.textContent = title;
		main.appendChild(strong);
		if (subtitle) {
			const small = document.createElement("small");
			small.textContent = subtitle;
			main.appendChild(small);
		}
		item.append(iconEl, main);
		item.addEventListener("click", () => {
			hide();
		});
		return item;
	}

	function render(data, emptyText) {
		results.replaceChildren();
		items = [];
		const groups = [
			["Favoritos", data.bookmarks || [], "☆", (entry) => ({
				title: entry.label || entry.url,
				subtitle: entry.url,
				href: gotoUrl(entry.url),
			})],
			["Historial", data.history || [], "🕘", (entry) => ({
				title: entry.label || entry.url || entry.query,
				subtitle: entry.at ? new Date(entry.at).toLocaleString() : "",
				href: gotoUrl(entry.url, entry.query),
			})],
			["Secciones", data.sections || [], "→", (entry) => ({
				title: entry.label,
				subtitle: entry.href,
				href: entry.href,
			})],
		];
		for (const [label, list, icon, mapper] of groups) {
			if (!list.length) continue;
			const heading = document.createElement("div");
			heading.className = "pw-search-group";
			heading.textContent = label;
			results.appendChild(heading);
			for (const entry of list) {
				const mapped = mapper(entry);
				const item = makeItem({ icon, ...mapped });
				item.addEventListener("mouseenter", () => setActive(items.indexOf(item)));
				results.appendChild(item);
				items.push(item);
			}
		}
		if (!items.length) {
			const empty = document.createElement("div");
			empty.className = "pw-search-empty";
			empty.textContent = emptyText || "Sin resultados.";
			results.appendChild(empty);
		}
		setActive(items.length ? 0 : -1);
	}

	function setActive(index) {
		items.forEach((item, i) => item.classList.toggle("active", i === index));
		active = index;
		if (items[index]) items[index].scrollIntoView({ block: "nearest" });
	}

	function navigateActive() {
		if (active >= 0 && items[active]) items[active].click();
	}

	async function runSearch() {
		const query = input.value.trim();
		if (query.length < 2) {
			render([], "Escribe al menos 2 caracteres.");
			return;
		}
		const id = ++requestId;
		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
				cache: "no-store",
				headers: { Accept: "application/json" },
			});
			if (id !== requestId) return;
			if (!response.ok) {
				render([], response.status === 401 ? "Inicia sesión para buscar." : "No se pudo buscar.");
				return;
			}
			render(await response.json(), "Sin resultados.");
		} catch {
			if (id === requestId) render([], "No se pudo buscar.");
		}
	}

	input.addEventListener("input", () => {
		clearTimeout(timer);
		timer = setTimeout(runSearch, 160);
	});

	input.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			if (items.length) setActive((active + 1) % items.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			if (items.length) setActive((active - 1 + items.length) % items.length);
		} else if (event.key === "Enter") {
			event.preventDefault();
			navigateActive();
		} else if (event.key === "Escape") {
			event.preventDefault();
			hide();
		}
	});

	backdrop.addEventListener("mousedown", (event) => {
		if (event.target === backdrop) hide();
	});

	window.addEventListener("keydown", (event) => {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			if (backdrop.hidden) show();
			else hide();
		}
		if (event.key === "Escape" && !backdrop.hidden) hide();
	});

	const authenticated = Boolean(
		document.querySelector('form[action="/logout"], a[href="/logout"]'),
	);
	if (authenticated) {
		fetch("/api/config", { cache: "no-store" })
			.then((response) => (response.ok ? response.json() : null))
			.then((data) => { config = data; })
			.catch(() => {});
	}
})();
