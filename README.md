# Scramjet Web Proxy

Proxy web autoalojado con **Scramjet + Wisp**, pensado para ejecutarse en
cualquier servidor Linux con Node.js. Incluye login por sesión, roles,
historial de actividad, auditoría, bloqueo de sitios y un panel de
administración.

> Este proyecto es el motor web; el proxy solo funciona correctamente bajo
> **HTTPS** (o `localhost`), porque Scramjet usa service workers. Detrás de un
> reverse proxy con TLS o de un túnel como Tailscale Funnel/Cloudflare Tunnel.

## Funciones

- Navegación web a través del servidor con Scramjet y transporte libcurl/Wisp.
- **Favoritos** por usuario, **historial propio**, autocompletado, atrás/adelante/recargar y atajos de teclado.
- Login con contraseñas hasheadas (scrypt) y sesiones persistentes.
- Roles `admin`, `moderador` y `usuario`.
- Los administradores pueden:
  - crear usuarios y resetear contraseñas,
  - bloquear cuentas (permanente o temporal) **con mensaje personalizado**,
  - forzar logout y revocar sesiones,
  - ver actividad (URLs y búsquedas), auditoría y sesiones activas,
  - exigir cambio de contraseña y dejar notas internas,
  - configurar sesiones, actividad, mantenimiento, buscador, portada,
    **modo lista blanca/negra**, **sitios por usuario** y **horarios**,
  - crear/restaurar copias y consultar métricas.
- Los **moderadores** pueden ver usuarios, sesiones, actividad y auditoría, y
  bloquear o cerrar sesiones; no pueden cambiar ajustes ni gestionar admins.
- Bloqueo real de dominios en la capa Wisp, con listas globales y por usuario.
- Copias automáticas diarias locales, métricas Prometheus y despliegue con
  Docker + Caddy.
- Protección CSRF, límite de intentos por usuario e IP, cookies `HttpOnly` y
  `Secure`, y cierre de conexiones al bloquear o revocar sesiones.
- Los administradores están exentos de las restricciones configurables.

## Requisitos

- Node.js 22 o superior.
- npm.
- Un dominio o túnel con HTTPS para producción.
- Opcional: Apache/Nginx como reverse proxy y systemd para el servicio.

## Instalación

```bash
git clone https://github.com/ericsnet/scramjet-web-proxy.git
cd scramjet-web-proxy
npm install
```

`npm install` ejecuta `scripts/patch-wisp.mjs`, que añade al servidor Wisp la
excepción de administradores para la lista de sitios prohibidos.

### Crear los usuarios iniciales

El proyecto no incluye contraseñas. Crea `data/users.json` con la variable
`PROXY_INITIAL_USERS` (solo la primera vez):

```bash
PROXY_INITIAL_USERS='{
  "admin": {"role": "admin", "password": "CAMBIAME-1234"},
  "usuario": {"role": "user", "password": "CAMBIAME-5678"}
}' node --input-type=module -e 'await import("./auth.js")'
```

Después, los usuarios se gestionan desde `/admin`. Las contraseñas quedan solo
como hashes en `data/users.json`.

### Arrancar

```bash
npm start
# escucha en http://127.0.0.1:3030
```

Para desarrollo en local, `http://localhost:3030` es un origen seguro y los
service workers funcionan. Para acceso por IP o dominio hace falta HTTPS.

## Docker (rápido)

```bash
cp .env.example .env
# edita DOMAIN=tu-dominio.com
mkdir -p data backups
chown -R 1000:1000 data backups
docker compose up -d --build
```

Caddy obtiene el certificado HTTPS y reenvía WebSocket. Los datos y copias
quedan en `data/` y `backups/`. Más detalles en `deploy/README.md`.

## Producción

1. Copia el proyecto a `/opt/web-proxy` (o la ruta que uses).
2. Instala dependencias y crea los usuarios.
3. Usa `deploy/webproxy.service` como plantilla de systemd.
4. Publica el puerto 3030 detrás de un reverse proxy HTTPS. Ejemplo de Apache
   en `deploy/apache-webproxy.conf`; el proxy debe reenviar WebSocket en
   `/wisp/`.
5. Ajusta `PROXY_URL` para `status.sh`:

```bash
PROXY_URL="https://proxy.example.com" ./status.sh
```

### Tailscale Funnel (ejemplo)

Tailscale Funnel solo permite los puertos 443, 8443 y 10000:

```bash
sudo tailscale funnel --bg --yes --https=8443 http://127.0.0.1:8082
```

La URL será `https://TU-NODO.tailXXXX.ts.net:8443`.

### Reverse proxy

Requisitos importantes:

- HTTPS con certificado válido.
- Reenviar `Upgrade` y `Connection` para `/wisp/`.
- `Cache-Control: no-store` para `/sw.js`.
- No cachear el HTML de login.

## Configuración

Todo se gestiona desde `/admin`:

- **Usuarios**: crear, rol (`admin`/`moderador`/`usuario`), contraseña, bloqueo
  temporal/permanente con mensaje, forzar logout, notas, cambio obligatorio,
  sitios por usuario y horario de acceso.
- **Sesiones**: IP, navegador, fechas y revocación.
- **Actividad**: URLs y búsquedas introducidas, exportación CSV.
- **Auditoría**: logins, acciones de administración y exportación CSV.
- **Ajustes**: sesión, actividad, mantenimiento, buscador, portada, enlaces
  rápidos, lista negra/blanca, zona horaria, copias y token de métricas.
- **Sistema**: salud, servicios, Funnel, copias automáticas y restauración.

### Sitios y horarios

- **Lista negra** (por defecto): se permite todo salvo los dominios indicados.
- **Lista blanca**: solo se permiten los dominios indicados.
- Se bloquea el dominio completo y sus subdominios, en el servidor Wisp.
- Cada usuario puede tener **dominios prohibidos adicionales**.
- Cada usuario puede tener **días y franjas horarias** de acceso.
- Los administradores están exentos de listas y horarios.

### Favoritos e historial

Cada usuario tiene favoritos propios, historial con búsqueda y atajos
(`Alt+←`, `Alt+→`, `Ctrl+R`, `Ctrl+L`, `/`). El administrador decide si el
usuario puede vaciar su propio historial.

### Copias y métricas

- Copia automática diaria sobre las 03:00 y retención configurable.
- Descarga y restauración desde `Sistema` (la restauración reinicia el servicio).
- `/metrics` se activa con un token en Ajustes y expone métricas Prometheus.

## Datos y seguridad

- `data/users.json`: usuarios, hashes y estado.
- `data/sessions.json`: sesiones con tokens hasheados.
- `data/settings.json`: ajustes.
- `data/activity.json`: historial de actividad.
- `data/audit.json`: auditoría.
- `data/bookmarks.json`: favoritos por usuario.
- `backups/`: copias automáticas.

Todo se guarda con permisos `600`. **No subas `data/` ni `backups/` a Git**:
contienen datos personales. El `.gitignore` ya los excluye.

Copia de seguridad desde `Sistema` o con el botón de descarga. Protege la copia:
incluye hashes, IPs y navegadores.

## Desarrollo

```bash
npm start
```

Archivos principales:

| Ruta | Contenido |
| --- | --- |
| `server.js` | Express: rutas, auth, sesiones, ajustes, auditoría, Wisp |
| `auth.js` | Usuarios, hashes, sesiones persistentes, bloqueos, horarios y límites |
| `settings.js` | Ajustes y validación |
| `activity.js` | Historial por usuario |
| `audit.js` | Auditoría y CSV |
| `bookmarks.js` | Favoritos por usuario |
| `backup.js` | Copias automáticas, listado y restauración |
| `metrics.js` | Contadores Prometheus |
| `pages.js` | Páginas de login, cuenta y administración |
| `public/` | Interfaz del proxy |
| `sw.js` | Service worker de Scramjet |
| `Dockerfile`, `docker-compose.yml`, `Caddyfile` | Despliegue con Docker + Caddy |
| `scripts/patch-wisp.mjs` | Excepción de admins y listas por usuario en Wisp |

## Versiones fijadas

La combinación “latest” de npm puede ser incompatible. Este proyecto fija:

- `@mercuryworkshop/scramjet` 2.0.67-alpha.1
- `@mercuryworkshop/scramjet-controller` 0.0.13
- `@mercuryworkshop/scramjet-utils` 0.0.3
- `@mercuryworkshop/libcurl-transport` 2.0.6
- `@mercuryworkshop/wisp-js` 0.5.3

No actualices esas versiones por separado sin probar la combinación completa.

## Limitaciones

- No incluye 2FA ni filtrado de contenido más allá de dominios.
- Algunas webs (login de Google, Cloudflare, bancos, DRM) no funcionan a través
  de un proxy web.
- El motor Scramjet puede fallar con redirecciones anidadas en webs concretas;
  el proxy intenta recuperarse y vuelve al inicio con aviso.
- El tráfico sale por la IP del servidor: úsalo con login y no compartas la URL.

## Licencia

AGPL-3.0-only. Consulta `LICENSE`.
