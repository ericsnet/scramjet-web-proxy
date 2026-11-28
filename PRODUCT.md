# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hoy lo usan principalmente alumnos y personal de un centro educativo: alumnado en Chromebooks o móviles, profesorado que organiza grupos de clase y administradores que gestionan cuentas, reglas y supervisión. La meta declarada es que pueda usarlo cualquier tipo de persona, no solo un centro.

## Product Purpose

Proxy web autoalojado que permite navegar a través del servidor y, alrededor de esa navegación, ofrece cuentas, roles, grupos, chat interno, supervisión, auditoría, invitaciones y bóveda de contraseñas. El éxito es que el proxy y todo lo que lo rodea funcionen de forma fiable en el uso diario real.

## Positioning

Combina un proxy Scramjet autoalojado con controles de aula y administración en una sola aplicación Node: grupos y reglas por grupo, chat interno, vigilancia, auditoría, roles con creador protegido y bóveda cifrada. No depende de un servicio de proxy de terceros ni de una plataforma externa de gestión.

## Operating Context

- Se despliega en Linux, incluida Raspberry Pi, con Node.js 22 o superior.
- En producción vive detrás de HTTPS mediante Apache, Tailscale u otro reverse proxy; Scramjet necesita service workers.
- El uso típico ocurre en aulas y redes compartidas, con Chromebooks y móviles.
- Los administradores crean usuarios, grupos y reglas; los moderadores supervisan sesiones y actividad; el creador conserva el control último.
- El chat, la vigilancia y la auditoría son parte del trabajo diario, no extras.
- La interfaz está en español, catalán e inglés.

## Capabilities and Constraints

- Navegación proxificada con Scramjet y Wisp, incluyendo audio, vídeo, Range y streaming.
- Favoritos, historial propio, pestañas internas, atajos, lector y bóveda de contraseñas.
- Roles: usuario, diseñador gráfico, pentester, QA, moderador, administrador y creador.
- El creador está protegido frente a administradores y moderadores. Los permisos de cada rol son un límite estructural.
- Grupos de clase con reglas propias: sitios bloqueados o lista blanca, horarios, mensajes y límites de rendimiento.
- Chat con sala general, privados, grupos, canales de clase, adjuntos, audio, reacciones, encuestas, menciones, presencia, acuses de lectura y apodos privados.
- Invitaciones de un solo uso, con grupo, avatar opcional y cuenta nueva siempre como usuario normal.
- Supervisión en vivo, historial de actividad, auditoría, sesiones, solicitudes de desbloqueo y alertas de seguridad.
- Bloqueo de anuncios y rastreadores con listas reales y actualización automática.
- MFA, copias de seguridad, métricas Prometheus, cuarentena y mantenimiento.
- Restricción técnica: el proxy requiere HTTPS o localhost para funcionar correctamente.
- Restricción de producto: los datos y la administración viven en la instancia autoalojada; no se presupone un servicio central.
- Queda abierto qué audiencia adicional debe priorizarse fuera del centro y qué métricas concretas definen el éxito a largo plazo.

## Brand Commitments

- Nombre actual: Proxy Web. En títulos y páginas de acceso aparece también «Inici - Classroom».
- Se mantiene el logo actual y el tono directo, práctico y sin adornos.
- La interfaz debe seguir disponible en español, catalán e inglés.

## Evidence on Hand

- Código y documentación reales del proyecto en este repositorio, incluido `README.md`.
- Funciones verificadas en el código: proxy, roles, grupos, chat, vigilancia, auditoría, invitaciones, bóveda, adblock y ajustes.
- No hay testimonios, clientes, métricas de negocio, estudios de caso ni logos de terceros que puedan usarse como prueba. No deben inventarse.

## Product Principles

1. El proxy es el centro; todo lo demás existe para que navegar sea usable, seguro y operable.
2. La protección no es opcional: roles, creador protegido, auditoría y supervisión son parte de la estructura.
3. Autoalojado por defecto: funciona en Linux modesto y no depende de servicios de terceros.
4. Diseñado para uso real en aula, pero sin encerrar el producto en un solo tipo de centro.
5. Identidad y tono estables: nombre, logo y lenguaje directo se conservan.

## Accessibility & Inclusion

- Debe funcionar en Chromebooks, móviles y con teclado.
- La interfaz debe estar en español, catalán e inglés.
- No se ha fijado un nivel formal de WCAG; queda como decisión abierta.
