# Deployment examples

Estos archivos son plantillas genéricas. Ajusta rutas, usuario, dominio y
puertos antes de usarlas.

## Docker Compose (recomendado para el repo)

El `docker-compose.yml` de la raíz levanta la app y **Caddy** con HTTPS
automático:

```bash
cp .env.example .env
# edita DOMAIN=tu-dominio.com
mkdir -p data backups
chown -R 1000:1000 data backups

# crea los usuarios iniciales (solo la primera vez)
docker compose run --rm -e PROXY_INITIAL_USERS='{"admin":{"role":"admin","password":"CAMBIAME-1234"}}' \
  proxy node --input-type=module -e 'await import("./auth.js")'

docker compose up -d
```

La app escucha en `3030` dentro de la red de Docker; Caddy publica 80/443 y
reenvía `/wisp/` con WebSocket.

## systemd + Apache

- `webproxy.service`: unidad systemd para `/opt/web-proxy` y usuario `proxy`.
- `apache-webproxy.conf`: reverse proxy HTTPS/WebSocket en el puerto local 8082.

```bash
sudo useradd --system --home /opt/web-proxy --shell /usr/sbin/nologin proxy
sudo mkdir -p /opt/web-proxy
sudo chown -R proxy:proxy /opt/web-proxy
# copia el proyecto en /opt/web-proxy y ejecuta npm install como proxy
sudo cp deploy/webproxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now webproxy
```

Para Apache:

```bash
sudo cp deploy/apache-webproxy.conf /etc/apache2/sites-available/webproxy.conf
sudo cp public/error-503.html /var/www/html/webproxy-503.html
sudo a2ensite webproxy
sudo apache2ctl configtest
sudo systemctl reload apache2
```

`apache-webproxy.conf` usa esa página local como `ErrorDocument 503`, de modo
que si la app Node se reinicia se ve una pantalla de “Servicio no disponible”
con reconexión automática en lugar del 503 genérico de Apache.

El proxy debe publicarse por HTTPS (reverse proxy con TLS, Tailscale Funnel,
Cloudflare Tunnel, etc.). Los service workers solo funcionan en HTTPS o
`localhost`.
