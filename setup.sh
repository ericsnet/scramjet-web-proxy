#!/usr/bin/env bash
# Configuración rápida del proxy.
# Uso: ./setup.sh [--yes] [--help]
# No interactivo: PROXY_SETUP_NONINTERACTIVE=1 y variables PROXY_SETUP_*.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

APP_PORT="${PROXY_SETUP_PORT:-3030}"
SERVICE="${PROXY_SETUP_SERVICE:-webproxy}"
NONINTERACTIVE="${PROXY_SETUP_NONINTERACTIVE:-0}"
NO_SYSTEMD="${PROXY_SETUP_NO_SYSTEMD:-0}"
FUNNEL_PORT="${PROXY_SETUP_FUNNEL_PORT:-8443}"
MODE="${PROXY_SETUP_MODE:-}"
ADMIN_USER="${PROXY_SETUP_ADMIN_USER:-admin}"
ADMIN_PASS="${PROXY_SETUP_ADMIN_PASSWORD:-}"
PUBLIC_HOST="${PROXY_SETUP_PUBLIC_HOST:-}"
CF_TOKEN="${PROXY_SETUP_CLOUDFLARE_TOKEN:-}"
KEEP_USERS=0
ADMIN_CREATED=0
URL=""

if [ "$EUID" -eq 0 ]; then
	SUDO=()
	RUN_USER="${SUDO_USER:-root}"
else
	command -v sudo >/dev/null 2>&1 || die "Este instalador necesita sudo. Ejecútalo con un usuario con sudo."
	SUDO=(sudo)
	RUN_USER="$(id -un)"
fi
RUN_GROUP="$(id -gn "$RUN_USER" 2>/dev/null || echo "$RUN_USER")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die() { printf '\nError: %s\n' "$*" >&2; exit 1; }

ask() {
	local prompt="$1" default="${2:-}" value
	if [ "$NONINTERACTIVE" = "1" ]; then
		printf '%s' "$default"
		return
	fi
	read -r -p "$prompt [${default}]: " value
	printf '%s' "${value:-$default}"
}

ask_secret() {
	local prompt="$1" value
	if [ "$NONINTERACTIVE" = "1" ]; then
		printf '%s' "${ADMIN_PASS:-}"
		return
	fi
	read -r -s -p "$prompt: " value
	printf '\n' >&2
	printf '%s' "$value"
}

as_user() {
	if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then
		sudo -u "$RUN_USER" -- "$@"
	else
		"$@"
	fi
}

systemctl_root() { "${SUDO[@]}" systemctl "$@"; }

require_systemd() {
	if [ "$NO_SYSTEMD" = "1" ]; then return 1; fi
	if ! command -v systemctl >/dev/null 2>&1; then
		die "No se encontró systemd. Ejecuta con PROXY_SETUP_NO_SYSTEMD=1 o arranca con npm start."
	fi
	return 0
}

help() {
	cat <<'EOF'
Configuración rápida del proxy.

Opciones:
  --yes       no hacer preguntas (usa variables PROXY_SETUP_*)
  --help      mostrar esta ayuda

Variables principales:
  PROXY_SETUP_MODE=local|tailscale|cloudflare|cloudflare-token|custom
  PROXY_SETUP_ADMIN_USER=admin
  PROXY_SETUP_ADMIN_PASSWORD=...
  PROXY_SETUP_PORT=3030
  PROXY_SETUP_FUNNEL_PORT=8443
  PROXY_SETUP_PUBLIC_HOST=proxy.example.com
  PROXY_SETUP_CLOUDFLARE_TOKEN=...
  PROXY_SETUP_NO_SYSTEMD=1   (pruebas; arranca con nohup)

Ejemplos:
  ./setup.sh
  ./setup.sh --yes
EOF
}

for arg in "$@"; do
	case "$arg" in
		--yes|-y) NONINTERACTIVE=1 ;;
		--help|-h) help; exit 0 ;;
		*) die "Opción desconocida: $arg" ;;
	esac
done

say "Configuración rápida del proxy"
info "Directorio: $DIR"
info "Usuario del servicio: $RUN_USER"
info "Puerto de la app: $APP_PORT"

command -v node >/dev/null 2>&1 || die "Node.js no está instalado. Instala Node 22 o superior."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Se necesita Node 22 o superior (tienes $(node -v))."
command -v npm >/dev/null 2>&1 || die "npm no está instalado."

if [ ! -d node_modules ]; then
	say "Instalando dependencias"
	as_user npm install
else
	info "Dependencias ya instaladas"
	as_user node scripts/patch-wisp.mjs >/dev/null 2>&1 || true
fi

mkdir -p data backups
if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then
	chown -R "$RUN_USER:$RUN_GROUP" data backups
fi
chmod 700 data backups || true

if [ -f data/users.json ]; then
	if [ "$NONINTERACTIVE" = "0" ]; then
		KEEP="$(ask 'Ya existen usuarios. ¿Mantenerlos? (s/n)' 's')"
	else
		KEEP="s"
	fi
	case "$KEEP" in
		s|S|y|Y) KEEP_USERS=1 ;;
		*) KEEP_USERS=0 ;;
	esac
fi

if [ "$KEEP_USERS" = "0" ]; then
	say "Creando administrador"
	ADMIN_USER="${PROXY_SETUP_ADMIN_USER:-$(ask 'Usuario administrador' 'admin')}"
	if [ -n "$ADMIN_PASS" ]; then
		PASS="$ADMIN_PASS"
	else
		P1="$(ask_secret 'Contraseña del administrador (vacío = generar)')"
		if [ -z "$P1" ]; then
			PASS="$(node -e 'const c=require("crypto");const a="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";console.log([...c.randomBytes(18)].map(b=>a[b%a.length]).join(""))')"
			info "Contraseña generada."
		else
			P2="$(ask_secret 'Repite la contraseña')"
			[ "$P1" = "$P2" ] || die "Las contraseñas no coinciden."
			PASS="$P1"
		fi
	fi
	[ "${#PASS}" -ge 8 ] || die "La contraseña debe tener al menos 8 caracteres."
	ADMIN_JSON="$(node -e 'const [u,p]=process.argv.slice(1);console.log(JSON.stringify({[u]:{role:"admin",password:p}}))' "$ADMIN_USER" "$PASS")"
	if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then
		sudo -u "$RUN_USER" env PROXY_INITIAL_USERS="$ADMIN_JSON" node --input-type=module -e 'await import("./auth.js")'
	else
		PROXY_INITIAL_USERS="$ADMIN_JSON" node --input-type=module -e 'await import("./auth.js")'
	fi
	ADMIN_CREATED=1
else
	info "Se mantienen los usuarios existentes."
fi

if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then
	chown -R "$RUN_USER:$RUN_GROUP" data backups
fi

if [ -z "$MODE" ]; then
	say "¿Cómo quieres publicar el proxy?"
	info "1) Tailscale Funnel (URL fija)"
	info "2) Cloudflare Tunnel rápido (URL temporal)"
	info "3) Cloudflare Tunnel con token y dominio propio"
	info "4) Solo local (http://localhost:$APP_PORT)"
	info "5) Ya tengo un reverse proxy/dominio"
	DEFAULT_MODE="4"
	command -v tailscale >/dev/null 2>&1 && DEFAULT_MODE="1"
	CHOICE="$(ask 'Elige una opción' "$DEFAULT_MODE")"
	case "$CHOICE" in
		1) MODE="tailscale" ;;
		2) MODE="cloudflare" ;;
		3) MODE="cloudflare-token" ;;
		4) MODE="local" ;;
		5) MODE="custom" ;;
		*) die "Opción no válida." ;;
	esac
fi

TUNNEL_UNIT="/etc/systemd/system/${SERVICE}-tunnel.service"
TUNNEL_LOG="$DIR/data/tunnel.log"

install_cloudflared() {
	if command -v cloudflared >/dev/null 2>&1; then return; fi
	say "cloudflared no está instalado"
	if [ "$NONINTERACTIVE" = "0" ]; then
		INSTALL="$(ask '¿Instalar cloudflared ahora? (s/n)' 's')"
		[ "$INSTALL" = "s" ] || die "Instala cloudflared y vuelve a ejecutar."
	fi
	case "$(uname -m)" in
		x86_64|amd64) ARCH="amd64" ;;
		aarch64|arm64) ARCH="arm64" ;;
		armv7l) ARCH="arm" ;;
		*) die "Arquitectura no soportada para cloudflared." ;;
	esac
	TMP="$(mktemp -d)"
	URL_DEB="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
	curl -fsSL "$URL_DEB" -o "$TMP/cloudflared.deb"
	if command -v dpkg >/dev/null 2>&1; then
		"${SUDO[@]}" dpkg -i "$TMP/cloudflared.deb"
	else
		URL_BIN="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}"
		curl -fsSL "$URL_BIN" -o "$TMP/cloudflared"
		"${SUDO[@]}" install -m 755 "$TMP/cloudflared" /usr/local/bin/cloudflared
	fi
	rm -rf "$TMP"
	command -v cloudflared >/dev/null 2>&1 || die "No se pudo instalar cloudflared."
}

case "$MODE" in
	tailscale)
		say "Configurando Tailscale Funnel"
		command -v tailscale >/dev/null 2>&1 || die "tailscale no está instalado."
		tailscale status >/dev/null 2>&1 || die "Tailscale no está conectado. Ejecuta 'tailscale up'."
		if [ "$NONINTERACTIVE" = "0" ]; then
			FUNNEL_PORT="$(ask 'Puerto público de Funnel (443/8443/10000)' "$FUNNEL_PORT")"
		fi
		case "$FUNNEL_PORT" in
			443|8443|10000) ;;
			*) die "Funnel solo permite 443, 8443 o 10000." ;;
		esac
		"${SUDO[@]}" tailscale funnel --bg --yes --https="$FUNNEL_PORT" "http://127.0.0.1:$APP_PORT"
		DNS="$(tailscale status --json 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log((j.Self.DNSName||"").replace(/\.$/,""))}catch{}})')"
		[ -n "$DNS" ] || die "No se pudo obtener el nombre DNS de Tailscale."
		if [ "$FUNNEL_PORT" = "443" ]; then
			URL="https://$DNS"
		else
			URL="https://$DNS:$FUNNEL_PORT"
		fi
		;;
	cloudflare)
		say "Configurando Cloudflare Tunnel rápido"
		install_cloudflared
		: > "$TUNNEL_LOG"
		if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then chown "$RUN_USER:$RUN_GROUP" "$TUNNEL_LOG"; fi
		if require_systemd; then
			UNIT="$(mktemp)"
			cat > "$UNIT" <<EOF
[Unit]
Description=Cloudflare quick tunnel for webproxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
ExecStart=$(command -v cloudflared) --no-autoupdate tunnel --url http://127.0.0.1:$APP_PORT
StandardOutput=append:$TUNNEL_LOG
StandardError=append:$TUNNEL_LOG
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
			"${SUDO[@]}" cp "$UNIT" "$TUNNEL_UNIT"
			rm -f "$UNIT"
			systemctl_root daemon-reload
			systemctl_root enable --now "${SERVICE}-tunnel.service"
			systemctl_root restart "${SERVICE}-tunnel.service"
		else
			info "Arrancando cloudflared con nohup"
			HOST=127.0.0.1 PORT="$APP_PORT" nohup cloudflared --no-autoupdate tunnel --url "http://127.0.0.1:$APP_PORT" >> "$TUNNEL_LOG" 2>&1 &
			echo $! > data/tunnel.pid
		fi
		info "Esperando URL de Cloudflare..."
		for _ in $(seq 1 30); do
			URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1 || true)"
			[ -n "$URL" ] && break
			sleep 1
		done
		[ -n "$URL" ] || die "No se pudo obtener la URL del túnel. Revisa $TUNNEL_LOG"
		info "URL temporal. Cambiará si reinicias el túnel."
		;;
	cloudflare-token)
		say "Configurando Cloudflare Tunnel con token"
		install_cloudflared
		if [ -z "$CF_TOKEN" ]; then
			CF_TOKEN="$(ask_secret 'Token del túnel de Cloudflare')"
		fi
		[ -n "$CF_TOKEN" ] || die "Falta el token."
		PUBLIC_HOST="${PUBLIC_HOST:-$(ask 'Dominio público (ej. proxy.example.com)' '')}"
		[ -n "$PUBLIC_HOST" ] || die "Falta el dominio público."
		PUBLIC_HOST="${PUBLIC_HOST#https://}"
		PUBLIC_HOST="${PUBLIC_HOST#http://}"
		PUBLIC_HOST="${PUBLIC_HOST%%/*}"
		"${SUDO[@]}" mkdir -p /etc/webproxy
		printf 'TUNNEL_TOKEN=%s\n' "$CF_TOKEN" | "${SUDO[@]}" tee /etc/webproxy/cloudflared.env >/dev/null
		"${SUDO[@]}" chmod 600 /etc/webproxy/cloudflared.env
		if require_systemd; then
			UNIT="$(mktemp)"
			cat > "$UNIT" <<EOF
[Unit]
Description=Cloudflare tunnel for webproxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
EnvironmentFile=/etc/webproxy/cloudflared.env
ExecStart=$(command -v cloudflared) --no-autoupdate tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
			"${SUDO[@]}" cp "$UNIT" "$TUNNEL_UNIT"
			rm -f "$UNIT"
			systemctl_root daemon-reload
			systemctl_root enable --now "${SERVICE}-tunnel.service"
			systemctl_root restart "${SERVICE}-tunnel.service"
		else
			nohup env TUNNEL_TOKEN="$CF_TOKEN" cloudflared --no-autoupdate tunnel run >> data/tunnel.log 2>&1 &
			echo $! > data/tunnel.pid
		fi
		URL="https://$PUBLIC_HOST"
		info "Asegúrate de que el hostname del dashboard apunta a http://localhost:$APP_PORT"
		;;
	local)
		URL="http://localhost:$APP_PORT"
		;;
	custom)
		URL="$(ask 'URL pública completa (ej. https://proxy.example.com)' "${PROXY_SETUP_PUBLIC_URL:-}")"
		[ -n "$URL" ] || die "Falta la URL pública."
		;;
	*)
		die "Modo no válido: $MODE"
		;;
esac

say "Configurando servicio de la aplicación"
if require_systemd; then
	UNIT="$(mktemp)"
	cat > "$UNIT" <<EOF
[Unit]
Description=Scramjet Web Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$DIR
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=$APP_PORT
ExecStart=$(command -v node) $DIR/server.js
Restart=always
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
	"${SUDO[@]}" cp "$UNIT" "/etc/systemd/system/${SERVICE}.service"
	rm -f "$UNIT"
	systemctl_root daemon-reload
	systemctl_root enable --now "${SERVICE}.service"
	systemctl_root restart "${SERVICE}.service"
else
	info "Arrancando la app con nohup en el puerto $APP_PORT"
	HOST=127.0.0.1 PORT="$APP_PORT" nohup node "$DIR/server.js" >> "$DIR/data/app.log" 2>&1 &
	echo $! > "$DIR/data/app.pid"
fi

info "Esperando a que arranque..."
for _ in $(seq 1 30); do
	CODE="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/healthz" || true)"
	[ "$CODE" = "200" ] && break
	sleep 1
done
[ "${CODE:-}" = "200" ] || die "La app no responde en http://127.0.0.1:${APP_PORT}/healthz"

if [ -n "$URL" ]; then
	printf '%s\n' "$URL" > "$DIR/data/public-url.txt"
	if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then
		chown "$RUN_USER:$RUN_GROUP" "$DIR/data/public-url.txt"
	fi
fi
printf '%s\n' "$APP_PORT" > "$DIR/data/app-port.txt"
if [ "$EUID" -eq 0 ] && [ "$RUN_USER" != "root" ]; then
	chown "$RUN_USER:$RUN_GROUP" "$DIR/data/app-port.txt"
fi

if [ "$NONINTERACTIVE" = "0" ]; then
	printf '\nComprobando la URL pública... '
	PUBLIC_CODE=""
	for _ in $(seq 1 15); do
		PUBLIC_CODE="$(curl -s -L -m 5 -o /dev/null -w '%{http_code}' "${URL}/login" || true)"
		[ "$PUBLIC_CODE" = "200" ] && break
		sleep 1
	done
	printf '%s\n' "${PUBLIC_CODE:-sin respuesta}"
fi

say "Listo"
info "URL: ${URL:-no configurada}"
if [ "$ADMIN_CREATED" = "1" ]; then
	info "Usuario: $ADMIN_USER"
	info "Contraseña: $PASS"
else
	info "Usa tus usuarios existentes."
fi
if require_systemd; then
	info "Servicio: systemctl status ${SERVICE}"
	info "Logs:    journalctl -u ${SERVICE} -f"
else
	info "App PID: $(cat "$DIR/data/app.pid" 2>/dev/null || echo '?')"
	info "Logs:    $DIR/data/app.log"
fi
info "Estado:  PROXY_URL=\"${URL}\" ./status.sh"
