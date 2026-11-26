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
- **Favoritos** por usuario, **historial propio**, autocompletado, atrás/adelante/recargar, **pestañas internas** y atajos de teclado.
- **Resumen de administración**: estado rápido de usuarios, sesiones, alertas, tráfico, copias y acciones rápidas.
- **Vigilancia en vivo**: usuarios conectados, última web visitada, destinos Wisp y actividad reciente, con actualización automática y botón **“Echar ahora”** en cada usuario. La presencia usa actividad humana, no el polling de fondo.
- **Límites de rendimiento por usuario**: ancho de banda (por defecto 8 Mbps), hasta 64 streams Wisp (64 por host) y conexiones simultáneas, con búfer de descarga. Los logs internos de Wisp quedan silenciados salvo errores; se puede depurar con `WISP_LOG_LEVEL=debug` en systemd.
- **Bloqueo de anuncios y rastreadores**: activado por defecto para acelerar webs pesadas como Poki y TikTok. Bloquea DoubleClick, Google Ads, Amazon Ads, PubMatic, Criteo, Prebid, telemetría de Poki y métricas de TikTok, sin tocar sus CDN, APIs ni el vídeo. Se puede desactivar en **Ajustes → Rendimiento**. La caché DNS de Wisp dura 10 minutos.
- **Carga diferida en Poki y TikTok**: las imágenes fuera de pantalla se marcan como `lazy` y `async` dentro del proxy, para que no se saturen los streams al abrir la página.
- **Panel de tráfico en tiempo real**: peticiones HTTP, usuarios/IPs, estados, rutas, sesiones, streams Wisp, destinos y bytes.
- **Escáner de seguridad pasivo**: detecta escaneo de rutas, inyección, enumeración de API, ráfagas, bots por comportamiento y bloqueos manuales por dispositivo, usuario o IP.
- **Chat interno entre usuarios** con sala general, chats privados 1:1, grupos, adjuntos (imágenes/PDF/texto), reacciones, encuestas, menciones y presencia por conversación. Para abrir chats privados o grupos hace falta ser amigos; el creador puede añadir a cualquiera.
- **Chat de clase automático**: cada grupo de usuarios tiene su propio canal interno, visible solo para sus miembros y sincronizado cuando alguien entra o sale del grupo.
- **Acuses de lectura en el chat**: los mensajes propios muestran **Visto / No visto** en privados y **Visto por N** en grupos; se actualiza cuando el otro miembro lee el canal.
- **Escala de privilegios con personas**: en Administración, cada rol muestra de forma compacta los usuarios que lo tienen (Usuario, Diseñador gráfico, Pentester, QA, Moderador, Administrador y Creador).
- **Bóveda de contraseñas privada**: cifrada en el navegador con AES-GCM y PBKDF2; el servidor solo guarda blobs cifrados y nunca recibe la contraseña maestra. Incluye generador, búsqueda, copia, bloqueo automático y **autocompletado/guardado en webs abiertas por el proxy**.
- **Botón de pánico**: abajo a la izquierda; activa durante 5 minutos la redirección automática de ese dispositivo a `classroom.google.com`.
- **Iconos de usuario**: cada cuenta puede subir su propio PNG/JPG/WebP desde Mi cuenta; se muestra en la barra, el chat y la lista de usuarios.
- **Avisos del chat**: notificaciones grandes abajo a la derecha con avatar, sonido breve y contador de mensajes nuevos al volver a entrar.
- **Interfaz en español, inglés y catalán**.
- Login con contraseñas hasheadas (scrypt) y sesiones persistentes.
- Escala de roles: **usuario → moderador → administrador → creador**. Moderador y administrador **sustituyen** al rol de usuario (no se acumulan con él) y son excluyentes entre sí. El creador es la cuenta propietaria: nadie más puede modificarla, bloquearla, borrarla ni ver su historial, sesiones o auditoría. Solo el creador puede crear, ascender, degradar, resetear o eliminar administradores; los administradores solo gestionan usuarios y moderadores.
- **Roles especialistas** que no sustituyen a los anteriores: **diseñador gráfico**, **pentester** y **QA / bugs**. Se pueden combinar entre sí y con los roles existentes; un usuario puede tener varios roles a la vez.
- **Grupos de usuarios**: crea grupos como `1A`, `1B` o `Profesores` y asigna cada usuario a uno. Se muestran como tarjetas con avatar cuadrado. Solo administradores y creador pueden crear o eliminar grupos; moderadores, administradores y creador pueden asignar usuarios existentes a un grupo. El creador también puede asignarse a sí mismo.
- **Onboarding de grupo**: en el primer inicio de sesión, si el usuario no tiene grupo, se le pide elegir su grupo de clase y curso; también puede omitirlo y un profesor asignarlo después. El personal (moderador, administrador y creador) no pasa por este paso.
- **Reglas por grupo**: sitios bloqueados o lista blanca, mensaje propio, horario y límites de ancho de banda/streams/conexiones. Las reglas globales y las del grupo se suman; el horario más restrictivo es el que manda.
- **Panel de grupo** en `/admin/groups/<id>`: miembros, estado en línea, sesiones, última web, actividad y reglas. Los moderadores pueden consultarlo; solo administradores y creador editan reglas.
- **Acciones masivas por grupo**: asignar a otro grupo, quitar del grupo, bloquear, desbloquear o echar a varios usuarios seleccionados, respetando los permisos de cada rol.
- **Reglas de grupo por usuario**: cada usuario puede tener activadas o desactivadas las reglas de su grupo (sitios, horario y límites). Se configura en su tarjeta de usuario o de forma masiva desde el panel del grupo; por defecto están activadas.
- Herramientas propias: `/design` (contraste WCAG, paleta y sistema visual), `/pentest` (cabeceras HTTP, JWT, URL y hashes) y `/qa` (banco de pruebas con estados y entorno). Solo el **creador** tiene acceso automático a todas; los administradores solo si además tienen el rol especialista correspondiente.
- **Informes comunes** en `/reports` para diseño, pentest y QA: título, tipo, gravedad, zona, URL, pasos, esperado y real. Cada informe tiene ficha propia en `/admin/reports/<id>` y el creador lo tria con estado y notas; al marcarlo como corregido o descartado se elimina.
- **Vista compacta de usuarios** en Administración: cada fila muestra el resumen y se despliega al pulsarla con toda la información y acciones.
- Los administradores pueden:
  - crear usuarios y resetear contraseñas,
  - bloquear cuentas (permanente o temporal) **con mensaje personalizado**,
  - **echar a un usuario al instante** (cierra sus sesiones y pestañas abiertas) y revocar sesiones,
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
   `/wisp/`. La plantilla incluye una página 503 local con reconexión automática
   (`public/error-503.html`), para que un reinicio de Node no muestre el error
   genérico de Apache.
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
  temporal/permanente con mensaje, **echar ahora**, notas, cambio obligatorio,
  sitios por usuario y horario de acceso.
- **Sesiones**: IP, navegador, fechas, revocación individual inmediata, **cierre por
  inactividad** configurable y botón **“cerrar todas las demás”**. Al echar a un usuario,
  todas sus pestañas abiertas reciben el cierre por SSE y vuelven al login al instante.
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
- Cada alerta incluye **Ver movimientos**: método, ruta, estado, riesgo, motivos, navegador y dispositivo de cada petición registrada.
- El bloqueo automático por intercambio de cuentas está desactivado; solo se generan alertas por patrones claros y nunca se bloquea una cuenta por compartir IP o dispositivo.
- Desde `/admin/security` puedes banear o desbanear la IP (bot o hacking) y descartar alertas.
- Emergencia si te bloqueas a ti mismo: `npm run security:unban -- 1.2.3.4` y reinicia `webproxy`.
- El creador y los administradores ven el resumen en Administración.

### Chat interno

- Pop-ups en cualquier página cuando otro usuario escribe.
- Contador de no leídos sobre el icono flotante.
- Al volver a abrir el proxy: “Tienes X mensajes nuevos…”.
- El puntero de lectura se guarda por usuario en `data/chat.json`.
- Sala general, chats privados 1:1 y grupos con miembros.
- Adjuntos de hasta 5 MB (imágenes, PDF y texto) servidos con comprobación de
  pertenencia al canal, nunca desde una carpeta pública.
- Reacciones, encuestas con voto y menciones.
- Texto plano: no se interpreta HTML ni Markdown; todo se escapa en servidor y
  se pinta con `textContent` en el navegador.
- Límite de longitud, espera entre mensajes, máximo por minuto, retención por
  días y número máximo de mensajes almacenados.
- Título y mensaje de bienvenida personalizables; se puede activar/desactivar y
  mostrar u ocultar el número de usuarios conectados.
- Cada usuario puede borrar sus propios mensajes si el administrador lo permite.
  **Los moderadores no pueden borrar mensajes**; pueden editar solo los suyos
  recientes y fijar. **Nadie puede editar el mensaje de otra persona**, ni
  siquiera administradores o creador. Solo administradores y creador pueden
  borrar cualquiera o vaciar la sala.
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

### Endurecimiento tras la auditoría

- Las cuentas de administración y moderación **no navegan por el proxy** por defecto. El contenido proxificado comparte origen con la aplicación; hasta aislarlo en otro dominio, una web maliciosa podría actuar con la sesión de esa cuenta. Se puede permitir en Ajustes, pero no es recomendable.
- Wisp bloquea IPs literales, UDP, puertos sensibles y limita streams por conexión y por host.
- Las subidas del chat tienen límite por minuto, cuota total, cuota por usuario y comprobación de espacio libre.
- El identificador de dispositivo es aleatorio y va en cookie `__Host-`; los bloqueos de dispositivo se refuerzan con usuario e IP.
- El login ya no bloquea la cuenta solo por nombre de usuario: el límite es por IP y por IP+cuenta, y se limpia al acertar.
- Apache fuerza `X-Forwarded-Proto: https` y `mod_remoteip` restaura la IP real detrás de Funnel.
- El servicio de `:443` usa bcrypt y tiene fail2ban para fallos de autenticación básica.

### Verificación en dos pasos (MFA local)

- Cada usuario puede activar **TOTP** desde `Mi cuenta` con cualquier app de autenticación (Google Authenticator, Aegis, 1Password, etc.). No usa email, SMS ni servicios externos.
- Al activarla se generan **códigos de recuperación** de un solo uso, que se muestran una única vez y se guardan hasheados.
- El login pide el código después de la contraseña. Si se pierde el dispositivo, se puede usar un código de recuperación.
- Los administradores pueden resetear la MFA de un usuario desde su ficha.
- Si te quedas fuera, desde el servidor: `npm run mfa:reset -- usuario`.
- En Ajustes se puede exigir MFA a administradores y moderadores. Actívalo después de configurar tu propia MFA.
- La **auditoría está encadenada con SHA-256**: cada evento incluye el hash del anterior. El panel avisa si alguien ha modificado `data/audit.json`. Si haces una limpieza manual, reconstruye la cadena con `npm run audit:rebuild`.

> Pendiente: aislar el contenido proxificado en un origen distinto (subdominio o puerto dedicado) para eliminar por completo el riesgo same-origin. Mientras tanto, usa una cuenta de alumno para navegar.

- `data/users.json`: usuarios, hashes y estado.
- `data/sessions.json`: sesiones con tokens hasheados.
- `data/login-attempts.json`: contadores persistentes de intentos de login por cuenta, IP y cuenta+IP.
- `data/settings.json`: ajustes.
- `data/activity.json`: historial de actividad.
- `data/audit.json`: auditoría.
- `data/bookmarks.json`: favoritos por usuario.
- `data/chat.json`: mensajes, canales y lecturas del chat interno.
- `data/chat-uploads/`: adjuntos privados del chat.
- `data/friends.json`: amistades y solicitudes pendientes; no se incluye en las copias.
- `data/panic.json`: dispositivos con modo pánico activo y su caducidad.
- `data/avatars/`: iconos de usuario validados por contenido y servidos solo con sesión iniciada.
- `data/security.json`: alertas, bloqueos e historial reciente de logins.
- `/var/backups/proxy/`: copias cifradas (`BACKUP_DIR`; en Docker `backups/`).
- Clave de cifrado: `BACKUP_KEY_FILE` (`/etc/webproxy/backup.key` en producción).

Todo se guarda con permisos `600`. **No subas `data/` ni `backups/` a Git**:
contienen datos personales. El `.gitignore` ya los excluye.

Medidas de seguridad incluidas:

- nombres de usuario normalizados (Unicode NFKC, espacios y mayúsculas) antes de
  autenticar y aplicar políticas;
- `trust proxy` limitado a loopback: la IP real se toma de `req.ip` y no se confía en `X-Forwarded-For` de conexiones directas;
- verificación de contraseñas con `scrypt` asíncrono para no bloquear el event loop;
- límite de 60 intentos por minuto y IP, 10 intentos por cuenta+IP cada 15 minutos, bloqueo por cuenta tras 8 fallos y error de login genérico;
- los contadores de intentos se guardan en `data/login-attempts.json` y sobreviven a reinicios;
- validación de `Origin`/`Referer` con HTTPS obligatorio y token CSRF en el login, con cookie `__Host-pw_csrf` bajo HTTPS;
- `Host` restringido al dominio canónico (salvo `/healthz` local);
- IPv4 e IPv6 del mismo dispositivo se unifican en las alertas y se muestra la IPv4;
- cookie de dispositivo firmada con HMAC y `__Host-pw_device` bajo HTTPS, usada para diagnóstico y bloqueos opcionales;
- `/api/navigate-check` bloquea loopback, RFC1918, CGNAT, link-local, ULA y
  direcciones IPv4 mapeadas en IPv6, resolviendo DNS;
- Wisp aplica además su propia comprobación de IPs privadas, incluidas IPv4 embebidas en NAT64 (`64:ff9b::/96`, `64:ff9b:1::/48`) y RFC 6145 (`::ffff:0:0/96`);
- chat interno con autenticación obligatoria, CSRF, límites por usuario, texto
  plano sin HTML, canal explícito y autorización por rol para moderar;
- `media-src` permite audio/vídeo propio, `blob:` (MSE) y `data:`;
- tiempo de proxy ampliado para reproducciones largas;
- audio y vídeo se sirven en streaming: no se cachea el archivo completo antes de
  reproducirlo y se respetan las peticiones `Range`;
- cabeceras HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` y `Permissions-Policy` en el proxy inverso.

Las copias se guardan cifradas con AES-256-GCM fuera del web root
(`/var/backups/proxy` en producción), con permisos `600`. Incluyen usuarios sin
contraseñas, hashes, notas, IPs ni mensajes de bloqueo, y no incluyen actividad,
auditoría, chat, amistades ni iconos de usuario. La clave se guarda en `BACKUP_KEY_FILE` (por defecto
`/etc/webproxy/backup.key`) y la ruta con `BACKUP_DIR`.

La descarga exige contraseña y auditoría; la restauración también exige
contraseña y confirmación. Al restaurar se conservan las contraseñas actuales
de las cuentas existentes. Protege la clave de cifrado: sin ella no se pueden
restaurar las copias.

## Desarrollo

```bash
npm start
```

Archivos principales:

| Ruta | Contenido |
| --- | --- |
| `server.js` | Express: rutas, auth, sesiones, ajustes, auditoría, Wisp |
| `auth.js` | Usuarios, hashes, sesiones persistentes, bloqueos, horarios y límites |
| `avatars.js` | Validación y almacenamiento privado de iconos de usuario |
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
| `friends.js` | Amistades, solicitudes y permisos de chat privado |
| `panic.js` | Estado temporal del botón de pánico por dispositivo |
| `security.js` | Detección pasiva, alertas y bloqueos |
| `traffic.js` | Búfer de tráfico HTTP y conexiones Wisp para el panel en vivo |
| `public/traffic.js` | Actualización del panel de tráfico |
| `public/monitor.js` | Actualización del panel de vigilancia |
| `roles.js` | Jerarquía y permisos de usuario/moderador/administrador/creador |
| `public/chat.js` | Actualización y envío de mensajes en el navegador |
| `public/account-icon.js` | Subida del icono desde Mi cuenta |
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
