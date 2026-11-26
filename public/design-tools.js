(() => {
	const fg = document.getElementById("design-fg");
	const bg = document.getElementById("design-bg");
	const preview = document.getElementById("design-contrast-preview");
	const result = document.getElementById("design-contrast-result");
	if (!fg || !bg || !preview || !result) return;

	const rgb = (hex) => {
		const value = String(hex || "#000000").replace("#", "");
		const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
		return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
	};
	const channel = (value) => {
		const v = value / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const luminance = (color) => {
		const [r, g, b] = rgb(color).map(channel);
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const ratio = (a, b) => {
		const l1 = luminance(a);
		const l2 = luminance(b);
		return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
	};
	const updateContrast = () => {
		const value = ratio(fg.value, bg.value);
		preview.style.color = fg.value;
		preview.style.background = bg.value;
		const normalAA = value >= 4.5;
		const normalAAA = value >= 7;
		const largeAA = value >= 3;
		result.textContent = `Contraste ${value.toFixed(2)}:1 · AA normal ${normalAA ? "✓" : "✗"} · AAA normal ${normalAAA ? "✓" : "✗"} · AA texto grande ${largeAA ? "✓" : "✗"}`;
		result.className = `tool-result ${normalAA ? "ok" : "warn"}`;
	};
	fg.addEventListener("input", updateContrast);
	bg.addEventListener("input", updateContrast);
	updateContrast();

	const base = document.getElementById("design-palette-base");
	const output = document.getElementById("design-palette");
	const css = document.getElementById("design-palette-css");
	const copy = document.getElementById("design-palette-copy");
	if (!base || !output || !css) return;

	const mix = (hex, target, amount) => {
		const a = rgb(hex);
		const b = rgb(target);
		const values = a.map((value, i) => Math.round(value + (b[i] - value) * amount));
		return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
	};
	const renderPalette = () => {
		const colors = [
			mix(base.value, "#ffffff", 0.0),
			mix(base.value, "#ffffff", 0.18),
			mix(base.value, "#ffffff", 0.34),
			mix(base.value, "#ffffff", 0.5),
			mix(base.value, "#000000", 0.15),
			mix(base.value, "#000000", 0.3),
			mix(base.value, "#000000", 0.45),
			mix(base.value, "#000000", 0.6),
		];
		output.textContent = "";
		colors.forEach((color, index) => {
			const swatch = document.createElement("div");
			swatch.className = "design-swatch";
			const block = document.createElement("span");
			block.style.background = color;
			const name = document.createElement("strong");
			name.textContent = `--palette-${index + 1}`;
			const value = document.createElement("small");
			value.textContent = color;
			swatch.append(block, name, value);
			output.appendChild(swatch);
		});
		css.textContent = colors
			.map((color, index) => `--palette-${index + 1}: ${color};`)
			.join("\n");
	};
	base.addEventListener("input", renderPalette);
	copy?.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(`:root {\n${css.textContent.split("\n").map((line) => `  ${line}`).join("\n")}\n}`);
			copy.textContent = "Copiado";
			setTimeout(() => { copy.textContent = "Copiar CSS"; }, 1200);
		} catch {
			copy.textContent = "No se pudo copiar";
		}
	});
	renderPalette();
})();
