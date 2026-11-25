const SUPPORTED_ADDITIONS = [
	"milk",
	"sugar",
	"cream",
	"syrup",
	"sweetener",
	"honey",
	"chocolate",
	"cinnamon",
	"vanilla",
	"caramel",
];

const ALLOW = "BREW, WHEN, GET, OPTIONS";

function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function safePage(title, heading, message, extra = "") {
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#e6edf5;font-family:Inter,system-ui,sans-serif;padding:24px}
main{max-width:620px;text-align:center;border:1px solid #243244;border-radius:18px;background:#111821;padding:36px 28px;box-shadow:0 24px 70px rgba(0,0,0,.4)}
h1{font-size:clamp(30px,6vw,52px);margin:0 0 12px;letter-spacing:-.04em}
p{color:#94a7bd;line-height:1.6;margin:0 auto 18px;max-width:500px}
pre{text-align:left;background:#0b121b;border:1px solid #243244;border-radius:10px;padding:14px;color:#bfdbfe;overflow:auto;font-size:12px;line-height:1.55}
code{color:#fde68a}
.badge{display:inline-block;border:1px solid #6b5312;background:#271c06;color:#fcd34d;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700;margin-bottom:14px}
a{color:#60a5fa}
</style>
</head>
<body><main>
<span class="badge">HTCPCP/1.0 · RFC 2324</span>
<h1>${heading}</h1>
<p>${message}</p>
${extra}
</main></body></html>`;
}

function coffeePage(req) {
	return safePage(
		"☕ HTCPCP/1.0",
		"☕ Has encontrado la cafetera",
		"Este servidor habla HTCPCP/1.0. La tetera está al otro lado, en <code>/teapot</code>.",
		`<pre>POST /coffee HTTP/1.1
Host: ${escapeHtml(req.headers.host || "localhost")}
X-HTCPCP-Method: BREW
Content-Type: message/coffeepot
Accept-Additions: milk, sugar

start</pre>
<p>Prueba también <code>WHEN</code>, o pide una tetera en <code>/teapot</code> para recibir un <code>418</code>.</p>`,
	);
}

function errorPage(status, title, message, extra = "") {
	return safePage(`${status} · ${title}`, `${status}`, message, extra);
}

function sendCoffee(res, status, body) {
	return res
		.status(status)
		.type("message/coffeepot")
		.set("Cache-Control", "no-store")
		.send(body);
}

function requestAdditions(req) {
	return String(req.get("accept-additions") || "")
		.split(/[,;]/)
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

function isTeapot(req) {
	return (
		req.path === "/teapot" ||
		String(req.get("x-pot-type") || "").toLowerCase() === "teapot" ||
		String(req.get("pot-0") || "").toLowerCase() === "teapot"
	);
}

export function handleHtcpcp(req, res) {
	res.set("Cache-Control", "no-store");
	res.set("X-Pot-0", "HTCPCP/1.0");
	const method = String(
		req.get("x-htcpcp-method") || req.get("x-http-method-override") || req.method || "",
	).toUpperCase();

	if (method === "OPTIONS") {
		res.set("Allow", ALLOW);
		return res.status(204).end();
	}

	if (isTeapot(req)) {
		return res
			.status(418)
			.type("text/html")
			.send(
				errorPage(
					418,
					"I'm a teapot",
					"Esta cafetera es en realidad una tetera. RFC 2324, sección 2.3.2.",
					'<pre>BREW /coffee HTTP/1.1\nContent-Type: message/coffeepot\n\nstart</pre><p>La tetera no puede preparar café.</p>',
				),
			);
	}

	if (method === "GET") {
		if (String(req.get("accept") || "").includes("text/html")) {
			return res.type("text/html").send(coffeePage(req));
		}
		return sendCoffee(res, 200, "ready\n");
	}

	if (method === "WHEN") {
		return sendCoffee(res, 200, "ready\n");
	}

	if (method === "BREW") {
		const additions = requestAdditions(req);
		const unsupported = additions.filter((item) => !SUPPORTED_ADDITIONS.includes(item));
		if (unsupported.length) {
			res.set("Accept-Additions", SUPPORTED_ADDITIONS.join(", "));
			return res
				.status(406)
				.type("text/html")
				.send(
					errorPage(
						406,
						"Not Acceptable",
						`La cafetera no acepta: <code>${unsupported.map(escapeHtml).join(", ")}</code>.`,
						`<p>Adiciones disponibles: <code>${SUPPORTED_ADDITIONS.join(", ")}</code>.</p>`,
					),
				);
		}
		const contentType = String(req.get("content-type") || "")
			.split(";")[0]
			.trim()
			.toLowerCase();
		if (contentType !== "message/coffeepot") {
			return res
				.status(400)
				.type("text/html")
				.send(
					errorPage(
						400,
						"Bad Request",
						"HTCPCP exige <code>Content-Type: message/coffeepot</code>.",
					),
				);
		}
		const body = String(req.body || "").trim().toLowerCase();
		if (!["start", "stop"].includes(body)) {
			return res
				.status(400)
				.type("text/html")
				.send(
					errorPage(
						400,
						"Bad Request",
						"El cuerpo de <code>message/coffeepot</code> debe ser <code>start</code> o <code>stop</code>.",
					),
				);
		}
		return sendCoffee(res, 200, body === "stop" ? "stopped\n" : "brewing\n");
	}

	res.set("Allow", ALLOW);
	return res
		.status(405)
		.type("text/html")
		.send(
			errorPage(
				405,
				"Method Not Allowed",
				"Método no permitido por HTCPCP/1.0.",
				`<p>Métodos: <code>${ALLOW}</code>.</p>`,
			),
		);
}

export const HTCPCP_ALLOW = ALLOW;
export const HTCPCP_ADDITIONS = SUPPORTED_ADDITIONS;
