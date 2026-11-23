# Deployment examples

Estos archivos son plantillas genéricas. Ajusta rutas, usuario, dominio y
puertos antes de usarlas.

- `webproxy.service`: unidad systemd para `/opt/web-proxy` y usuario `proxy`.
- `apache-webproxy.conf`: reverse proxy HTTPS/WebSocket en el puerto local 8082.

Pasos habituales:

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
sudo a2ensite webproxy
sudo apache2ctl configtest
sudo systemctl reload apache2
```

El proxy debe publicarse por HTTPS (reverse proxy con TLS, Tailscale Funnel,
Cloudflare Tunnel, etc.). Los service workers solo funcionan en HTTPS o
`localhost`.
