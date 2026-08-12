# Despacho Digital — Gobernación del Estado Táchira

Sistema de gestión para el Despacho del Gobernador: correspondencia, dependencias,
presupuesto, control ciudadano y ayudas sociales.

## ⚠️ Problema #1 a resolver — probablemente la causa principal de que "casi no funcione"

Este proyecto se construyó y se probó **dentro del entorno de artifacts de Claude.ai**,
que le da al HTML dos capacidades que **NO existen en un navegador normal ni en un
servidor propio**:

1. **`window.storage.get/set/delete/list`** — así es como se guarda todo (documentos,
   dependencias, ayudas, peticiones, organismos). Está usado en `js/app.js` dentro de
   `loadData()` y `persist()`. Fuera de Claude.ai, `window.storage` es `undefined`.
   El código tiene un `try/catch` que evita que truene, pero eso significa que
   **nada se guarda nunca** — cada vez que se recarga la página, todo vuelve a los
   datos de ejemplo. Esto es casi seguro la razón de que se sienta roto.

   → Hay que reemplazarlo por algo real: `localStorage`/`IndexedDB` en el navegador
   (más simple, pero solo funciona en ese navegador/computadora), o mejor, un backend
   pequeño (Node/Express + un archivo JSON o SQLite) si esto lo van a usar varias
   personas desde distintos computadores.

2. **`fetch("https://api.anthropic.com/v1/messages")` sin API key** — así es como
   funciona "Generar oficio con IA" en Control Ciudadano (función `generarOficio` en
   `js/app.js`). Dentro de Claude.ai esa llamada se autentica sola; fuera de ahí, no
   tiene credenciales y siempre va a caer en el `catch` (que por diseño genera una
   plantilla básica en su lugar — no truena, pero tampoco usa IA real).

   → Para que la generación con IA funcione de verdad fuera de Claude.ai, hace falta
   un backend propio que reciba la petición del navegador, llame a la API de
   Anthropic con una API key guardada del lado del servidor (nunca en el navegador),
   y devuelva el texto. Es un endpoint pequeño, no gran cosa, pero es indispensable.

Todo lo demás (generación de PDF con jsPDF, links de Telegram, el login, toda la
lógica de negocio) es JavaScript normal y debería funcionar igual en cualquier
navegador moderno.

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
  `ensureJsPDF()` en `js/app.js`). Requiere internet la primera vez; si falla, avisa
  con un toast en vez de tronar.

## Cómo probarlo mientras se arregla

No se puede simplemente abrir `index.html` con doble clic y esperar que todo
funcione (ver Problema #1). Para probar mientras tanto:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000 en el navegador
```

Esto resuelve rutas relativas correctamente, pero **no** resuelve el problema del
guardado — para eso hace falta el reemplazo de `window.storage` mencionado arriba.
