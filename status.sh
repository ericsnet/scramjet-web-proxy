#!/bin/bash
# Estado del proxy web. Define PROXY_URL para comprobar el acceso público:
#   PROXY_URL="https://proxy.example.com" ./status.sh
cd "$(dirname "$0")" || exit 1

URL="${PROXY_URL:-}"

echo "=== App (Node) ==="
if systemctl is-active --quiet webproxy; then
	echo "webproxy: activo"
else
	echo "webproxy: PARADO"
fi
printf 'healthz local: '
curl -s -m 5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3030/healthz || echo "sin respuesta"

echo
echo "=== Apache / reverse proxy ==="
if systemctl is-active --quiet apache2 2>/dev/null; then
	echo "apache2: activo"
else
	echo "apache2: no activo o no instalado"
fi

echo
echo "=== Acceso público ==="
if [ -n "$URL" ]; then
	printf 'login (esperado 200): '
	curl -s -m 10 -o /dev/null -w '%{http_code}\n' "$URL/login" || echo "sin respuesta"
	printf 'raíz sin sesión (esperado 303): '
	curl -s -m 10 -o /dev/null -w '%{http_code}\n' "$URL/" || echo "sin respuesta"
else
	echo "PROXY_URL no definido; se omite la comprobación pública."
fi

echo
echo "=== Usuarios ==="
node -e '
const users = require("./data/users.json").users;
for (const [name, u] of Object.entries(users)) {
	const states = [];
	if (u.blocked) states.push("bloqueado");
	else if (u.blockedUntil) states.push(`bloqueado hasta ${u.blockedUntil.slice(0, 16).replace("T", " ")}`);
	if (u.mustChangePassword) states.push("cambio obligatorio");
	console.log(` - ${name}: ${u.role === "admin" ? "administrador" : "usuario"}${states.length ? ` (${states.join(", ")})` : ""}`);
}
' 2>/dev/null || echo "No se pudo leer data/users.json"
printf 'registros de actividad: '
node -e 'console.log((require("./data/activity.json").entries || []).length)' 2>/dev/null || echo "0"
printf 'eventos de auditoría: '
node -e 'console.log((require("./data/audit.json").events || []).length)' 2>/dev/null || echo "0"
printf 'sesiones guardadas: '
node -e 'console.log((require("./data/sessions.json").sessions || []).length)' 2>/dev/null || echo "0"

echo
echo "=== Ajustes ==="
node -e '
const s = require("./data/settings.json");
const days = s.sessionHours % 24 === 0 ? ` (${s.sessionHours / 24} días)` : "";
console.log(` - mantenimiento: ${s.maintenanceMode ? "SÍ" : "no"}`);
console.log(` - sesión: ${s.sessionHours} h${days}, máximo ${s.maxSessionsPerUser} por usuario (admins exentos)`);
console.log(` - actividad: ${s.activityEnabled ? "activada" : "desactivada"} (${s.activityPerUser}/usuario)`);
console.log(` - buscador: ${s.defaultSearchEngine}`);
console.log(` - sitios prohibidos: ${(s.blockedSites || []).length}`);
' 2>/dev/null || echo "No se pudo leer data/settings.json"

if command -v tailscale >/dev/null 2>&1; then
	echo
	echo "=== Tailscale Funnel ==="
	tailscale funnel status 2>&1 | sed -n '1,20p'
fi

echo
echo "Logs: sudo journalctl -u webproxy -f"
