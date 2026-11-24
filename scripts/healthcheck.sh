#!/usr/bin/env bash
# Watchdog sencillo: si la app no responde, reinicia el servicio.
set -u
PORT="${PORT:-3030}"
CODE="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/healthz" || true)"
if [ "$CODE" != "200" ]; then
	logger -t webproxy-watchdog "healthz=${CODE:-sin respuesta}; reiniciando webproxy"
	systemctl restart webproxy
	exit 1
fi
exit 0
