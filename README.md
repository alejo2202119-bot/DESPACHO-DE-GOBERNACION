# Despacho Digital — Gobernación del Estado Táchira

Sistema de gestión para el Despacho del Gobernador: correspondencia, dependencias,
presupuesto, control ciudadano y ayudas sociales.

## Estado del guardado — ya resuelto

Este proyecto se construyó y se probó originalmente **dentro del entorno de artifacts
de Claude.ai**, que le daba al HTML dos capacidades que **no existen en un navegador
normal ni en un servidor propio**. Ambas fueron auditadas en un navegador real (fuera
de Claude.ai) y confirmadas rotas; la primera ya se corrigió:

1. **Guardado — corregido.** `window.storage.get/set` (usado en `loadData()` y
   `persist()` de `js/app.js`) era `undefined` fuera de Claude.ai, así que nada se
   guardaba nunca — confirmado en auditoría real de navegador (cada llamada a
   `persist()` lanzaba `TypeError`, silenciado por el `try/catch`). Se reemplazó por
   `localStorage`: ahora todo se guarda de verdad y sobrevive recargas de página,
   **siempre que sea en el mismo navegador y la misma computadora** — los datos no
   se sincronizan entre distintos equipos. Si varias personas van a usar el sistema
   desde computadoras distintas y necesitan ver los mismos datos, hace falta un
   backend pequeño (Node/Express + SQLite, por ejemplo) con una base de datos
   compartida; no está implementado todavía porque implica que alguien lo aloje y lo
   mantenga corriendo (un VPS o similar), y esa decisión de infraestructura le
   corresponde a quien vaya a operar el sistema.

2. **IA del oficio — sigue pendiente, es de esperarse.** `fetch("https://api.anthropic.com/v1/messages")`
   sin API key (función `generarOficio` en `js/app.js`) — confirmado en la misma
   auditoría que falla fuera de Claude.ai (sin credenciales) y cae en el `catch`, que
   por diseño genera una plantilla básica editable en su lugar. Esto es intencional y
   no rompe nada; el botón "Generar oficio" sigue siendo útil tal cual. Para que
   redacte con IA real fuera de Claude.ai hace falta un backend propio que reciba la
   petición del navegador, llame a la API de Anthropic con una API key guardada del
   lado del servidor (nunca en el navegador) y devuelva el texto — mismo backend que
   resolvería el punto 1 si se decide construirlo.

Todo lo demás (generación de PDF con jsPDF, links de Telegram, el login, toda la
lógica de negocio) es JavaScript normal y funciona igual en cualquier navegador
moderno — confirmado botón por botón en las 9 secciones del menú.

## Qué NO debe volver

- **La "Agenda del Gobernador"** (módulo de actividades programadas con
  recordatorios) se eliminó a propósito. No se debe reintroducir.
- **WhatsApp** se eliminó a propósito — **solo Telegram**. No agregues botones,
  campos ni links de WhatsApp en ninguna parte del sistema.

## Datos obligatorios del ciudadano

El formulario de "Registrar petición ciudadana" (Control Ciudadano) exige **todos**
estos campos para poder guardar un caso — no son opcionales:

- Nombres
- Apellidos
- Cédula
- Correo electrónico
- Número telefónico
- Dirección de habitación

Están validados en el handler de `form-peticion` en `js/app.js` (busca
`if(!nombres || !apellidos || !cedula || !correo || !telefono || !direccion...)`).
Si tocas ese formulario, mantén esa validación — no la relajes sin que te lo pidan.

## Estructura del proyecto

```
despacho-digital/
├── index.html          Estructura de las 9 vistas + pantalla de login
├── css/
│   └── styles.css       Todos los estilos (paleta azul/blanco)
├── js/
│   └── app.js            Toda la lógica: estado, render, persistencia, PDF, IA
├── assets/
│   ├── logo-gobernacion-banner.png   Header + membrete de PDF
│   ├── logo-amemos-tachira.png       Footer
│   ├── logo-bernal-cumple.png        Footer
│   ├── flag-stripe.png               Footer
│   ├── login-bg-chavez.jpg           Fondo del login (retrato izquierdo)
│   ├── login-bg-bernal-evento.jpg    Fondo del login (backdrop difuminado)
│   └── login-bg-bolivar.jpg          Fondo del login (retrato derecho)
└── README.md            Este archivo
```

`index.html` referencia `css/styles.css` y `js/app.js` con rutas relativas normales,
y las imágenes con `<img src="assets/...">` — ya no hay nada en base64 embebido.

## Login

Usuario: `ISAAC` — Contraseña: `DESPACHOG` (constantes `LOGIN_USER` / `LOGIN_PASS` al
final de `js/app.js`). Es una traba de acceso simple, no seguridad real — la
contraseña queda visible en el código fuente.

## Módulos (9 vistas, en el orden del menú lateral)

1. **Guía de Uso** — vista de ayuda en español simple, explica cada botón de cada módulo. Es la vista por defecto al cargar.
2. **Resumen** — alertas automáticas + indicadores generales.
3. **Dependencias** — las 5 dependencias del Despacho con presupuesto y metas POA,
   más el directorio de "Otras direcciones y entes" (secretarías/institutos/fundaciones
   sin presupuesto propio en el sistema).
4. **Control Ciudadano** — peticiones ciudadanas con datos completos obligatorios
   (ver sección arriba), respuesta, notificación por Telegram, generación de oficio
   con IA, envío a la Bandeja del Gobernador.
5. **Ayudas Sociales** — registro de ayudas por dependencia y fuente de financiamiento.
6. **Bandeja del Gobernador** — documentos pendientes de firma/decisión.
7. **Tablero** — la misma correspondencia en vista Kanban.
8. **Nueva Entrada** — formulario de registro de documentos entrantes.
9. **Archivo** — búsqueda histórica con trazabilidad.

## Mensajería: solo Telegram

`buildTelegramLink(destino, mensaje)` en `js/app.js` genera el link — si `destino`
empieza con `@`, abre el chat directo; si no, abre el selector genérico de Telegram
(`t.me/share/url`). El modal (`msg-modal-overlay` en el HTML, funciones
`abrirModalMensaje`/`cerrarModalMensaje`/`copiarModalMensaje`) siempre muestra el
mensaje en pantalla antes de abrir Telegram — nunca se abre solo. Hoy en día el único
lugar que usa esto es "Notificar por Telegram" en el detalle de una petición
ciudadana (`notificarCiudadanoTelegram`).

## Dependencias externas (JS)

- **jsPDF** (`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`)
  se carga dinámicamente solo cuando se pulsa "Descargar PDF" (función
  `ensureJsPDF()` en `js/app.js`). Requiere internet la primera vez; si falla o tarda
  más de 8 segundos en responder, avisa con un toast en vez de dejar el botón
  colgado indefinidamente.

## Cómo probarlo

No se puede simplemente abrir `index.html` con doble clic — las rutas relativas a
`css/`, `js/` y `assets/` necesitan servirse por HTTP:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000 en el navegador
```

El guardado (localStorage) funciona igual con doble clic o con servidor; lo que no
funciona con doble clic (protocolo `file://`) son las rutas relativas de arriba.
