# Agenda por Dirección — Gobernación del Estado Táchira

Calendario compartido para que cada dependencia o ente de la Gobernación
planifique, día por día, qué va a hacer.

## Estado del proyecto (actualizado 17/11/2026)

Verificado en vivo, sin errores, en https://despacho-digital-6999f.web.app

Resumen de lo construido hasta ahora:

1. **Hosting en Firebase, no en GitHub.** El sitio que usan las personas corre
   100% en Firebase Hosting; GitHub quedó solo como respaldo del código.
2. **Seguridad real.** Login contra Firebase Authentication (ya no hay clave
   fija en el código) + reglas de Firestore que exigen sesión válida + llave
   de API restringida al dominio del sitio.
3. **Una sola función: Agenda por Dirección.** Se retiró todo lo demás
   (correspondencia, presupuesto, control ciudadano, ayudas sociales, PDF,
   Telegram) a pedido explícito, dejando solo el calendario compartido por
   dirección/ente, con alta de nuevas direcciones desde la misma pantalla.
4. **Carpeta del proyecto, al día:** 6 archivos de código (`index.html`,
   `css/styles.css`, `js/app.js`, `firebase.json`, `firestore.rules`,
   `.firebaserc`) + este `README.md` + `assets/logo-gobernacion-banner.png`.
   Sin archivos sueltos, sin imágenes ni código muerto de funciones ya
   retiradas.

## Cómo funciona

Sitio **100% estático** (HTML + CSS + JS, sin servidor propio) conectado a
Firestore para que todas las direcciones vean los mismos datos en vivo:

```
Navegador (cualquier computadora)
   │
   ├── index.html + css/styles.css + js/app.js   ← el sitio en sí, servido por Firebase Hosting
   │
   ├── Cloud Firestore (proyecto "despacho-digital-6999f")
   │     └── colección "despacho", documento "estado"
   │         → una sola escritura/lectura en tiempo real (onSnapshot) por cada cambio
   │
   └── localStorage (del navegador)
         → copia local instantánea, pinta la pantalla sin esperar a la nube y
           sirve de respaldo si el navegador pierde la conexión.
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

## La única vista: Agenda por Dirección

- **Dirección / Ente**: selector con las direcciones ya registradas. Si falta
  alguna, se agrega con el campo "¿Falta tu dirección en la lista?".
- **Calendario**: grilla del mes, navegable (‹ Anterior / Siguiente ›), con
  el número de actividades planificadas por día.
- Al seleccionar un día: formulario para anotar qué se hará, y la lista de
  esas actividades con "Marcar realizada/pendiente" y "Eliminar".

Datos en `STATE`:
- `direcciones`: `[{id, nombre}]`
- `agendaActividades`: `[{id, unidadId, fecha, actividad, estado, creadoEn}]`

## Cómo probarlo

No se puede abrir `index.html` con doble clic — las rutas relativas a `css/`,
`js/` necesitan servirse por HTTP:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000 en el navegador
```
