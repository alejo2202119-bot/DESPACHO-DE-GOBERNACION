# Despacho Digital — Gobernación del Estado Táchira

Sistema de gestión para el Despacho del Gobernador: correspondencia, dependencias,
presupuesto, control ciudadano, ayudas sociales y Agenda por Dirección.

## Estado del proyecto (actualizado 20/11/2026)

Verificado en vivo, sin errores, en https://despacho-digital-6999f.web.app

1. **Sistema completo restaurado.** Las 9 vistas originales (Guía de Uso,
   Resumen, Dependencias, Control Ciudadano, Ayudas Sociales, Bandeja del
   Gobernador, Tablero, Nueva Entrada, Archivo) están de nuevo activas, junto
   con la Agenda por Dirección.
2. **Agenda por Dirección, mejorada:**
   - Vista **mensual** y vista **semanal** (botones para alternar).
   - **Prioridad** por actividad (Alta/Media/Baja).
   - **Ubicación** opcional con botón "📍 Cómo llegar" (abre la ruta en Google
     Maps desde tu ubicación actual hasta la dirección escrita — no requiere
     ninguna clave de API).
   - **Duplicar** actividad, para repetir una sin volver a escribirla.
   - **Reprogramar** (cambiar la fecha dejando registro del motivo, visible en
     el historial de esa actividad).
   - **Exportar a calendario (.ics)** — se abre en Google Calendar, Outlook o
     el calendario del teléfono.
3. **Hosting en Firebase, no en GitHub.** El sitio que usan las personas corre
   100% en Firebase Hosting; GitHub es solo respaldo del código.
4. **Seguridad real.** Login contra Firebase Authentication (sin clave fija en
   el código) + reglas de Firestore que exigen sesión válida + llave de API
   restringida al dominio del sitio.
5. **Migración de datos automática:** si el documento guardado en Firestore
   viene de una versión anterior más simple del sistema (solo tenía
   "direcciones" + agenda), `bindState()` en `js/app.js` reconstruye el resto
   de los datos de ejemplo y conserva tanto las direcciones agregadas a mano
   como toda la agenda ya creada — no hace falta ninguna migración manual.

## Cómo funciona de verdad (arquitectura actual)

Es un sitio **100% estático** (HTML + CSS + JS, sin servidor propio) conectado a una
base de datos en la nube para que los datos se vean iguales en cualquier computadora:

```
Navegador (cualquier computadora)
   │
   ├── index.html + css/styles.css + js/app.js   ← el sitio en sí, servido por Firebase Hosting
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
         → exportar/importar el JSON completo a mano — un respaldo manual.
```

## Dónde vive el sitio

**Firebase Hosting**, no GitHub:

```
https://despacho-digital-6999f.web.app
```

Se actualiza con `firebase deploy --only hosting --project despacho-digital-6999f`
(y `firebase deploy --only firestore:rules --project despacho-digital-6999f` si se
tocan las reglas). El repositorio de GitHub es solo respaldo e historial del
código — el sitio que usan las personas no depende de él para nada.

## Seguridad

- **Login real contra Firebase Authentication** (correo/contraseña) — no hay
  clave fija escondida en el código. El correo queda fijo en un campo oculto
  del formulario (no es la parte secreta); la persona solo escribe la
  contraseña.
- **Firestore exige sesión real** (`firestore.rules`: `allow read, write: if
  request.auth != null`). Sin iniciar sesión, la base de datos rechaza
  cualquier lectura o escritura con 403 — así el código se pueda copiar
  completo, sin la cuenta real no hay acceso a los datos.
- La llave de API del navegador está restringida por dominio (Google Cloud
  Console → Credenciales) para que no se pueda reutilizar copiándola a otro
  sitio.

## Módulos (10 vistas, en el orden del menú lateral)

1. **Guía de Uso** — ayuda en español simple de cada módulo.
2. **Resumen** — alertas automáticas + indicadores generales.
3. **Dependencias** — las 5 dependencias del Despacho con presupuesto y metas
   POA, más el directorio de "Otras direcciones y entes".
4. **Agenda por Dirección** — calendario (mensual/semanal) por dependencia o
   ente, con prioridad, ubicación + "Cómo llegar", duplicar, reprogramar y
   exportar a `.ics`. Ver detalle de implementación en `js/app.js`, sección
   `RENDER: AGENDA POR DIRECCIÓN`.
5. **Control Ciudadano** — peticiones ciudadanas con datos completos
   obligatorios, respuesta, notificación por Telegram, generación de oficio
   con IA, envío a la Bandeja del Gobernador.
6. **Ayudas Sociales** — registro de ayudas por dependencia y fuente.
7. **Bandeja del Gobernador** — documentos pendientes de firma/decisión.
8. **Tablero** — la misma correspondencia en vista Kanban.
9. **Nueva Entrada** — formulario de registro de documentos entrantes.
10. **Archivo** — búsqueda histórica con trazabilidad.

## Datos de la Agenda en `STATE`

- `agendaActividades`: `[{id, unidadId, fecha, actividad, prioridad, ubicacion, estado, creadoEn, historial}]`
  — `unidadId` referencia el `id` de una dependencia, subprograma u organismo
  (ver `getAllOrganismos()`). `historial` registra cada reprogramación (fecha,
  motivo).

## Cómo probarlo

No se puede abrir `index.html` con doble clic — las rutas relativas a `css/`,
`js/` necesitan servirse por HTTP:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000 en el navegador
```
