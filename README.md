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
- **Reproducción de audio y vídeo HTML5/MSE** con peticiones `Range`, búsqueda/seek, `blob:` y streaming progresivo sin cachear el archivo completo.
- **Favoritos** por usuario, **historial propio**, autocompletado, atrás/adelante/recargar, **pestañas internas**, **QR** y atajos de teclado.
- **Escáner de seguridad pasivo**: detecta escaneo de rutas, inyección, enumeración de API, ráfagas, bots por comportamiento, intercambio de cuentas e IPs baneadas manualmente.
- **Chat interno entre usuarios**, con texto plano, moderación y ajustes de capacidad, retención y ritmo.
- **Avisos del chat**: pop-ups cuando alguien escribe y contador de mensajes nuevos al volver a entrar.
- **Interfaz en español, inglés y catalán**.
- Login con contraseñas hasheadas (scrypt) y sesiones persistentes.
- Roles `usuario`, `moderador`, `administrador` y `creador`. El **creador** es la cuenta propietaria: nadie más puede modificarla, bloquearla, borrarla ni ver su historial, sesiones o auditoría.
- **Vista compacta de usuarios** en Administración: cada fila muestra el resumen y se despliega al pulsarla con toda la información y acciones.
- Los administradores pueden:
  - crear usuarios y resetear contraseñas,
  - bloquear cuentas (permanente o temporal) **con mensaje personalizado**,
  - forzar logout y revocar sesiones,
  - ver actividad (URLs y búsquedas), auditoría, sesiones y **estadísticas**,
  - exigir cambio de contraseña y dejar notas internas,
  - configurar sesiones, actividad, mantenimiento, **cuarentena**, **chat interno**, buscador,
    portada, **lista blanca/negra**, **mensajes por sitio**,
    **categorías** adultas/apuestas/social, **sitios por usuario** y **horarios**,
  - aprobar **peticiones de desbloqueo**,
  - crear/restaurar copias y consultar métricas.
- Los **moderadores** pueden ver usuarios, sesiones, actividad, auditoría y
  solicitudes, y bloquear o cerrar sesiones; no pueden cambiar ajustes ni gestionar admins.
- El **creador** tiene acceso completo y su cuenta queda fuera del alcance de
  administradores y moderadores.
- Bloqueo real de dominios en la capa Wisp, con listas globales, categorías y por usuario.
- **Modo cuarentena**: rechaza nuevas conexiones, cierra las abiertas y registra los intentos rechazados.
- Copias automáticas diarias locales, métricas Prometheus, CI, watchdog y despliegue con Docker + Caddy.
- Protección CSRF, límite de intentos por IP, cookies `HttpOnly` y
  `Secure`, y cierre de conexiones al bloquear o revocar sesiones.
- Los administradores están exentos de las restricciones configurables.

## Requisitos

- Node.js 22 o superior.
- npm.
- Un dominio o túnel con HTTPS para producción.
- Opcional: Apache/Nginx como reverse proxy y systemd para el servicio.

## Configuración rápida (recomendada)

```bash
git clone https://github.com/ericsnet/scramjet-web-proxy.git
cd scramjet-web-proxy
./setup.sh
```

El asistente:

1. comprueba Node/npm e instala dependencias;
2. crea el administrador (o conserva los usuarios existentes);
3. pregunta cómo publicar: **Tailscale Funnel**, **Cloudflare Tunnel rápido**,
   **Cloudflare con token/dominio**, **solo local** o **reverse proxy propio**;
4. instala y arranca el servicio systemd;
5. espera a que responda y te muestra la **URL final** y las credenciales.

Modo no interactivo (útil para automatizar):

```bash
PROXY_SETUP_NONINTERACTIVE=1 \
PROXY_SETUP_MODE=cloudflare \
PROXY_SETUP_ADMIN_USER=admin \
PROXY_SETUP_ADMIN_PASSWORD='CAMBIAME-1234' \
./setup.sh --yes
```

Modos: `local`, `tailscale`, `cloudflare`, `cloudflare-token`, `custom`.
Para Cloudflare con dominio: `PROXY_SETUP_PUBLIC_HOST=proxy.example.com` y
`PROXY_SETUP_CLOUDFLARE_TOKEN=...`.

## Instalación manual

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
- **Sesiones**: IP, navegador, fechas, revocación individual, **cierre por
  inactividad** configurable y botón **“cerrar todas las demás”**.
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

### Cuarentena

Botón rápido en `/admin` y ajuste en `Ajustes`:

- rechaza nuevas peticiones de webs y APIs para usuarios no administradores;
- cierra inmediatamente las conexiones Wisp abiertas (los admins se mantienen);
- registra los intentos rechazados con usuario, IP, navegador, destino y detalle;
- muestra los últimos intentos en el panel `/admin` con límite anti-flood;
- los intentos visibles se eliminan automáticamente **10 minutos después de la primera vista**;
- solo un administrador puede activarla o desactivarla.

### Escáner de seguridad

- Observa todas las peticiones y llamadas a la API sin bloquearlas automáticamente.
- Genera alertas con IP, usuario, motivos, puntuación y última petición.
- Detecta bots por intervalos, user-agent y patrones de uso; no usa captcha.
- Detecta **intercambio de cuentas** por varias cuentas en la misma IP o una cuenta desde varias IPs y bloquea temporalmente la cuenta implicada.
- Desde `/admin/security` puedes banear o desbanear la IP y descartar alertas.
- El creador y los administradores ven el resumen en Administración.

### Chat interno

- Pop-ups en cualquier página cuando otro usuario escribe.
- Contador de no leídos sobre el icono flotante.
- Al volver a abrir el proxy: “Tienes X mensajes nuevos…”.
- El puntero de lectura se guarda por usuario en `data/chat.json`.
- Sala única para todos los usuarios autenticados, con actualización automática.
- Texto plano: no se interpreta HTML ni Markdown; todo se escapa en servidor y
  se pinta con `textContent` en el navegador.
- Límite de longitud, espera entre mensajes, máximo por minuto, retención por
  días y número máximo de mensajes almacenados.
- Título y mensaje de bienvenida personalizables; se puede activar/desactivar y
  mostrar u ocultar el número de usuarios conectados.
- Cada usuario puede borrar sus propios mensajes si el administrador lo permite.
  Administradores y moderadores pueden borrar cualquiera y vaciar la sala.
- Los mensajes se eliminan al borrar la cuenta del autor y se incluyen en las
  copias de seguridad.

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
- `data/chat.json`: mensajes del chat interno.
- `data/security.json`: alertas, IPs baneadas e historial reciente de logins para detección de intercambio de cuentas.
- `backups/`: copias automáticas.

Todo se guarda con permisos `600`. **No subas `data/` ni `backups/` a Git**:
contienen datos personales. El `.gitignore` ya los excluye.

Medidas de seguridad incluidas:

- nombres de usuario normalizados (Unicode NFKC, espacios y mayúsculas) antes de
  autenticar y aplicar políticas;
- límite de intentos por IP, sin bloquear la cuenta (evita *lockout* DoS);
- validación de `Origin`/`Referer` con HTTPS obligatorio (salvo localhost);
- `/api/navigate-check` bloquea loopback, RFC1918, CGNAT, link-local, ULA y
  direcciones IPv4 mapeadas en IPv6, resolviendo DNS;
- Wisp aplica además su propia comprobación de IPs privadas antes de conectar;
- chat interno con autenticación obligatoria, CSRF, límites por usuario, texto
  plano sin HTML y autorización por rol para moderar;
- `media-src` permite audio/vídeo propio, `blob:` (MSE) y `data:`;
- tiempo de proxy ampliado para reproducciones largas;
- audio y vídeo se sirven en streaming: no se cachea el archivo completo antes de
  reproducirlo y se respetan las peticiones `Range`;
- cabeceras HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` y `Permissions-Policy` en el proxy inverso.

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
| `categories.js` | Descarga y bloqueo por categorías |
| `requests.js` | Peticiones de desbloqueo |
| `backup.js` | Copias automáticas, listado y restauración |
| `metrics.js` | Contadores Prometheus |
| `net-guard.js` | Detección de destinos privados para `navigate-check` |
| `chat.js` | Almacén, límites y retención del chat interno |
| `security.js` | Detección pasiva, alertas, bans y account-swapping |
| `public/chat.js` | Actualización y envío de mensajes en el navegador |
| `public/chat-notify.js` | Avisos, pop-ups y contador de no leídos |
| `public/page-i18n.js` | Traducciones de interfaz |
| `.github/workflows/ci.yml` | Comprobación de sintaxis en CI |
| `pages.js` | Páginas de login, cuenta y administración |
| `public/` | Interfaz del proxy |
| `sw.js` | Service worker de Scramjet |
| `Dockerfile`, `docker-compose.yml`, `Caddyfile` | Despliegue con Docker + Caddy |
| `deploy/webproxy-watchdog.*` | Watchdog systemd cada minuto |
| `setup.sh` | Asistente de configuración rápida (admin, túnel, systemd, URL) |
| `scripts/patch-wisp.mjs` | Excepción de admins y listas por usuario en Wisp |

## Versiones fijadas

La combinación “latest” de npm puede ser incompatible. Este proyecto fija:

- `@mercuryworkshop/scramjet` 2.1.0
- `@mercuryworkshop/scramjet-controller` 0.1.0
- `@mercuryworkshop/scramjet-utils` 0.0.3
- `@mercuryworkshop/libcurl-transport` 2.0.6
- `@mercuryworkshop/wisp-js` 0.5.3

No actualices esas versiones por separado sin probar la combinación completa. La caché HTTP de Scramjet no se usa: se prioriza compatibilidad y streaming.

## Limitaciones

- No incluye 2FA ni filtrado de contenido más allá de dominios.
- Algunas webs (login de Google, Cloudflare, bancos, DRM) no funcionan a través
  de un proxy web. El contenido protegido con DRM (Netflix, Disney+, etc.) no se
  puede reproducir.
- El motor Scramjet puede fallar con redirecciones anidadas en webs concretas;
  el proxy intenta recuperarse y vuelve al inicio con aviso.
- El tráfico sale por la IP del servidor: úsalo con login y no compartas la URL.

## Licencia

AGPL-3.0-only. Consulta `LICENSE`.
