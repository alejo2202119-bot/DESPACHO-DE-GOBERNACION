# Despacho Digital — Gobernación del Estado Táchira

Sistema de gestión para el Despacho del Gobernador: correspondencia, dependencias,
presupuesto, control ciudadano y ayudas sociales.

## Cómo funciona de verdad (arquitectura actual)

Es un sitio **100% estático** (HTML + CSS + JS, sin servidor propio) conectado a una
base de datos en la nube para que los datos se vean iguales en cualquier computadora:

```
Navegador (cualquier computadora)
   │
   ├── index.html + css/styles.css + js/app.js   ← el sitio en sí, servido por GitHub
   │
   ├── Cloud Firestore (proyecto "despacho-digital-6999f")
   │     └── colección "despacho", documento "estado"
   │         → una sola escritura/lectura en tiempo real (onSnapshot) por cada
   │           cambio: registrar, editar, responder, etc.
   │
   ├── localStorage (del navegador)
   │     → copia local instantánea: pinta la pantalla sin esperar a la nube,
   │       y sirve de respaldo si el navegador pierde la conexión.
   │
   └── Botones "Descargar datos" / "Cargar datos"
         → exportar/importar el JSON completo a mano — un respaldo manual,
           no la forma principal de compartir (eso ya lo hace Firestore solo).
```

**Lo que esto significa en la práctica:** cualquiera que abra el enlace del sistema
ve los mismos datos, en vivo, sin que nadie tenga que mandar ni cargar ningún
archivo. Los botones de descargar/cargar quedan como red de seguridad.

### Firebase / Firestore

- Proyecto: `despacho-digital-6999f`, plan gratuito (Spark, sin tarjeta).
- Configuración (`FIREBASE_CONFIG`) al principio de `js/app.js`. El `apiKey` de un
  proyecto Firebase **no es secreto** — así lo documenta Google: el control de
  acceso lo hacen las reglas de seguridad de Firestore, no ocultar ese valor. Por
  eso está a la vista en el código sin problema.
- **Reglas de seguridad actuales:** el documento `despacho/estado` está abierto
  (`allow read, write: if true`), sin pedir usuario de Firebase — coherente con que
  el sistema ya usa una clave simple (ISAAC/DESPACHOG) en vez de una cuenta real
  por persona. Si más adelante se necesita que cada quien inicie sesión de verdad
  (para saber quién cambió qué, o restringir por rol), hay que sumar Firebase
  Authentication — no está hecho porque agrega bastante complejidad para lo que
  se necesita hoy.
- **El SDK de Firebase se carga dinámicamente** desde `js/app.js`
  (función `ensureFirebase()`), no con una etiqueta `<script src>` fija en el
  HTML. Esto no es casualidad: algunos servicios que sirven el HTML de forma
  indirecta (por ejemplo `htmlpreview.github.io`, que lo carga con JavaScript y
  reescribe la página) **no ejecutan** etiquetas `<script src>` que apunten a
  dominios externos que no sean el propio repositorio — el script queda mudo, sin
  ningún error visible. Cargarlo dinámicamente evita ese problema y funciona igual
  en cualquier forma de hospedaje. La misma técnica ya se usaba para cargar jsPDF
  (`ensureJsPDF()`) y quedó documentada aquí para que quien toque este código no
  vuelva a tropezar con lo mismo.
- Si `FIREBASE_CONFIG.apiKey` quedara vacío, o el SDK no carga por alguna razón,
  el sistema cae automáticamente a modo solo-local (`localStorage`) sin romperse
  — es el mismo comportamiento que tenía antes de conectar Firestore.

### Dónde vive el sitio

Ahora mismo se accede vía **htmlpreview.github.io**, que sirve el `index.html` del
repositorio directamente (sin necesidad de activar nada aparte en GitHub):

```
https://htmlpreview.github.io/?https://github.com/alejo2202119-bot/DESPACHO-DE-GOBERNACION/blob/claude/whatsapp-telegram-migration-uqv0km/index.html
```

Es un servicio de terceros pensado para vistas previas rápidas, no para
producción — funciona, pero con quirks como el de la carga de scripts explicado
arriba, y una advertencia inofensiva en la consola del navegador por cómo carga
el CSS dos veces. La alternativa más sólida y profesional, sin cambiar nada del
código ni de cómo se edita el proyecto, es **GitHub Pages**: sirve exactamente los
mismos archivos del repositorio, de forma directa (sin reescritura de terceros de
por medio), con una URL igual de fija, y se actualiza solo con cada `git push` —
se activa con dos clics en la configuración del repositorio (Settings → Pages).

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

Estos datos (cédulas, teléfonos, direcciones) son información personal real de
ciudadanos. Con las reglas de Firestore actuales (abiertas, sin login de Firebase)
quien tenga el `projectId` puede leerlos o escribirlos — mismo nivel de exposición
que ya tenía el resto del sistema con su clave de acceso simple. Tenlo en cuenta si
en algún momento se maneja información más sensible.

## Estructura del proyecto

```
despacho-digital/
├── index.html          Estructura de las 9 vistas + pantalla de login
├── css/
│   └── styles.css       Todos los estilos (paleta azul/blanco)
├── js/
│   └── app.js            Estado, render, persistencia (Firestore + localStorage), PDF, IA
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

## Generación de oficios con IA — todavía pendiente

`generarOficio()` en Control Ciudadano llama directo a
`fetch("https://api.anthropic.com/v1/messages")` sin API key. Fuera del entorno de
artifacts de Claude.ai esa llamada siempre falla (sin credenciales), y el `catch`
genera automáticamente una plantilla básica editable en su lugar — no rompe nada,
simplemente no usa IA real. Para que sí la use hace falta un backend propio (no
existe todavía) que reciba la petición del navegador, llame a la API de Anthropic
con una API key guardada del lado del servidor (nunca en el navegador) y devuelva
el texto.

## Dependencias externas (JS), ambas cargadas dinámicamente

- **Firebase** (`ensureFirebase()`) — ver sección de Firestore arriba.
- **jsPDF** (`ensureJsPDF()`, `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`)
  se carga solo cuando se pulsa "Descargar PDF". Requiere internet la primera vez;
  si falla o tarda más de 8 segundos en responder, avisa con un toast en vez de
  dejar el botón colgado indefinidamente.

## Cómo probarlo

No se puede simplemente abrir `index.html` con doble clic — las rutas relativas a
`css/`, `js/` y `assets/` necesitan servirse por HTTP:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000 en el navegador
```

El guardado funciona igual con doble clic o con servidor propio en cuanto a
Firestore (es una llamada de red normal); lo que **no** funciona con doble clic
(protocolo `file://`) son las rutas relativas de arriba.
