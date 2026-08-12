/* ============ CONSTANTS ============ */
const STORAGE_KEY = 'despacho-estado-v2';
const ESTADOS = ['recibido','en_revision','en_despacho','decidido','archivado'];
const ESTADO_LABELS = {recibido:'Recibido', en_revision:'En Revisión', en_despacho:'En Despacho', decidido:'Decidido', archivado:'Archivado'};
const FUENTE_LABELS = {propio:'Presupuesto propio', fundacion:'Fundación de la Familia Tachirense', finanzas:'Dirección de Finanzas', extraordinaria:'Partida Extraordinaria'};
const AYUDA_ESTADO_LABELS = {pendiente:'Pendiente', aprobada:'Aprobada', ejecutada:'Ejecutada'};
const CONTRAT_ESTADO_LABELS = {en_proceso:'En proceso', aprobada:'Aprobada', ejecutada:'Ejecutada'};
const PETICION_ESTADO_LABELS = {recibida:'Recibida', en_atencion:'En atención', respondida:'Respondida', archivada:'Archivada'};

let STATE = null;
let DOCS, DEPENDENCIAS, AYUDAS, PARTIDAS, PETICIONES, ORGANISMOS;
let expandedRow = null;
let expandedDeps = new Set();
let expandedPeticion = null;

/* ============ SINCRONIZACIÓN COMPARTIDA (Firebase) ============
   Para que todas las computadoras vean los mismos datos (no solo la que los
   registró), crea un proyecto gratis en https://console.firebase.google.com
   (no pide tarjeta), activa "Firestore Database" en modo de prueba, y pega
   aquí los valores de Configuración del proyecto → tus apps → SDK de Firebase.
   Mientras apiKey esté vacío, el sistema sigue funcionando exactamente igual
   que antes: guardado solo en este navegador. */
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
const FIREBASE_ENABLED = !!FIREBASE_CONFIG.apiKey;
let firestoreDocRef = null;
if(FIREBASE_ENABLED && window.firebase){
  firebase.initializeApp(FIREBASE_CONFIG);
  firestoreDocRef = firebase.firestore().collection('despacho').doc('estado');
}

function updateGuiaPersistenciaText(){
  const el = document.getElementById('guia-persistencia');
  if(!el) return;
  el.innerHTML = (FIREBASE_ENABLED && firestoreDocRef)
    ? '<strong>Todo se guarda solo, al instante, y lo ve cualquiera que abra este mismo enlace.</strong> No existe un botón de "guardar" que se te pueda olvidar apretar. Los cambios se sincronizan automáticamente entre todas las computadoras que tengan el sistema abierto.'
    : '<strong>Todo se guarda solo, al instante.</strong> No existe un botón de "guardar" que se te pueda olvidar apretar. Cierras esta página y la vuelves a abrir, y todo sigue ahí — siempre que sea en este mismo navegador y esta misma computadora.';
}

function initRealtimeSync(){
  if(!(FIREBASE_ENABLED && firestoreDocRef)) return;
  firestoreDocRef.onSnapshot((snap) => {
    if(!snap.exists) return;
    const data = snap.data();
    if(!data || !data.json) return;
    try{
      STATE = JSON.parse(data.json);
      bindState();
      localStorage.setItem(STORAGE_KEY, data.json);
      populateSelects();
      renderAll();
    }catch(e){ console.error('Error al sincronizar', e); }
  }, (err) => console.error('Error de sincronización en tiempo real', err));
}

function bindState(){
  DOCS = STATE.documentos;
  DEPENDENCIAS = STATE.dependencias;
  AYUDAS = STATE.ayudas;
  PARTIDAS = STATE.partidas;
  PETICIONES = STATE.peticiones;
  ORGANISMOS = STATE.organismos;
}
window.__debugState = function(){ return STATE; };

/* ============ UTILITIES ============ */
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

let modalMensajeLink = null;
window.__debugModalLink = function(){ return modalMensajeLink; };
function abrirModalMensaje(titulo, mensaje, link, canalLabel){
  document.getElementById('msg-modal-title').textContent = titulo;
  document.getElementById('msg-modal-text').value = mensaje;
  modalMensajeLink = link;
  document.getElementById('msg-modal-open-btn').textContent = 'Abrir en ' + canalLabel;
  document.getElementById('msg-modal-overlay').classList.add('show');
}
function cerrarModalMensaje(){
  document.getElementById('msg-modal-overlay').classList.remove('show');
}
async function copiarModalMensaje(){
  const texto = document.getElementById('msg-modal-text').value;
  try{
    await navigator.clipboard.writeText(texto);
    showToast('Mensaje copiado al portapapeles');
  }catch(e){
    showToast('No se pudo copiar automáticamente — selecciona el texto manualmente.');
  }
}

function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('es-VE', {day:'2-digit', month:'short', year:'numeric'});
}

function fmtMoney(n){
  const v = Math.round(n || 0);
  return '$' + v.toLocaleString('en-US');
}

function isOverdue(doc){
  if(!doc.vencimiento || doc.estado === 'decidido' || doc.estado === 'archivado') return false;
  return new Date(doc.vencimiento) < new Date(new Date().toDateString());
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function daysFromToday(n){
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

/* ============ DERIVED BUDGET HELPERS ============ */
function contratacionesComprometido(unit){
  return (unit.contrataciones || []).filter(c => c.estado !== 'ejecutada').reduce((s,c) => s + c.monto, 0);
}
function contratacionesEjecutado(unit){
  return (unit.contrataciones || []).filter(c => c.estado === 'ejecutada').reduce((s,c) => s + c.monto, 0);
}
function ayudasEjecutadoPropio(unit){
  return AYUDAS.filter(a => a.dependenciaId === unit.id && a.fuente === 'propio' && a.estado === 'ejecutada')
               .reduce((s,a) => s + a.monto, 0);
}
function presupuestoEjecutado(unit){
  return (unit.manualEjecutadoBase || 0) + contratacionesEjecutado(unit) + ayudasEjecutadoPropio(unit);
}
function presupuestoComprometido(unit){
  return contratacionesComprometido(unit);
}
function presupuestoDisponible(unit){
  return unit.presupuestoAsignado - presupuestoEjecutado(unit) - presupuestoComprometido(unit);
}
function getAllUnits(){
  const units = DEPENDENCIAS.map(d => Object.assign({}, d, {isSub:false, parentNombre:null}));
  DEPENDENCIAS.forEach(d => {
    (d.subprogramas || []).forEach(sp => {
      units.push(Object.assign({}, sp, {isSub:true, parentNombre:d.nombre}));
    });
  });
  return units;
}
function nombreUnidad(id){
  if(!id) return '—';
  const u = getAllOrganismos().find(u => u.id === id);
  return u ? u.nombre : id;
}
function nombreCompletoPeticion(p){
  return (p.nombres || '') + ' ' + (p.apellidos || '');
}
function getAllOrganismos(){
  const fromDeps = getAllUnits().map(u => ({
    id: u.id,
    nombre: u.isSub ? (u.nombre + ' (' + u.parentNombre + ')') : u.nombre,
    tipo: u.isSub ? 'Subprograma' : 'Dependencia adscrita',
    responsable: u.responsable,
    telegramUsername: u.telegramUsername || ''
  }));
  const standalone = (ORGANISMOS || []).map(o => ({
    id: o.id, nombre: o.nombre, tipo: o.tipo, responsable: o.responsable,
    telegramUsername: o.telegramUsername || ''
  }));
  return fromDeps.concat(standalone);
}
function buildTelegramLink(destino, mensaje){
  const text = encodeURIComponent(mensaje);
  const d = (destino || '').trim();
  if(d.startsWith('@') && d.length > 1){
    return 'https://t.me/' + d.slice(1) + '?text=' + text;
  }
  return 'https://t.me/share/url?url=&text=' + text;
}

/* ============ SEED DATA ============ */
function seedDocumentos(){
  const y = new Date().getFullYear();
  return [
    {id:1, tracking:'DES-'+y+'-0001', remitente:'Alcaldía de Cordero', tipo:'Oficio', asunto:'Reporte de daños viales por crecida del río y solicitud de maquinaria', direccion:'Protección Civil / Gestión de Riesgo', dependenciaId:null, prioridad:'alta', vencimiento:daysFromToday(1), notas:'', estado:'en_despacho', recibido:daysFromToday(-2), historial:[{fecha:daysFromToday(-2), accion:'Documento recibido y digitalizado'},{fecha:daysFromToday(-1), accion:'Revisado por Protección Civil'},{fecha:daysFromToday(0), accion:'Elevado al Despacho para decisión'}]},
    {id:2, tracking:'DES-'+y+'-0002', remitente:'Fedecámaras Táchira', tipo:'Comunicación Oficial', asunto:'Propuesta de hoja de ruta para la Zona Económica Especial Binacional', direccion:'Relaciones Binacionales', dependenciaId:null, prioridad:'media', vencimiento:daysFromToday(4), notas:'', estado:'en_despacho', recibido:daysFromToday(-5), historial:[{fecha:daysFromToday(-5), accion:'Documento recibido y digitalizado'},{fecha:daysFromToday(-3), accion:'Revisado por Relaciones Binacionales'},{fecha:daysFromToday(-1), accion:'Elevado al Despacho para decisión'}]},
    {id:3, tracking:'DES-'+y+'-0003', remitente:'ODACYSS', tipo:'Informe', asunto:'Informe trimestral de atención de solicitudes ciudadanas', direccion:'Despacho del Gobernador', dependenciaId:'odacyss', prioridad:'baja', vencimiento:null, notas:'', estado:'en_revision', recibido:daysFromToday(-1), historial:[{fecha:daysFromToday(-1), accion:'Documento recibido y digitalizado'}]},
    {id:4, tracking:'DES-'+y+'-0004', remitente:'Dirección de Educación', tipo:'Solicitud', asunto:'Solicitud de traslado de personal docente para el nuevo período', direccion:'Dirección de Educación', dependenciaId:null, prioridad:'media', vencimiento:daysFromToday(10), notas:'', estado:'recibido', recibido:daysFromToday(0), historial:[{fecha:daysFromToday(0), accion:'Documento recibido y digitalizado'}]},
    {id:5, tracking:'DES-'+y+'-0005', remitente:'Norte de Santander - Empalme Regional', tipo:'Comunicación Oficial', asunto:'Agenda conjunta de cooperación fronteriza y ayuda humanitaria', direccion:'Relaciones Binacionales', dependenciaId:'observatorio-frontera', prioridad:'alta', vencimiento:daysFromToday(-1), notas:'Vencido: requiere atención inmediata', estado:'en_despacho', recibido:daysFromToday(-6), historial:[{fecha:daysFromToday(-6), accion:'Documento recibido y digitalizado'},{fecha:daysFromToday(-4), accion:'Revisado por Relaciones Binacionales'},{fecha:daysFromToday(-2), accion:'Elevado al Despacho para decisión'}]},
    {id:6, tracking:'DES-'+y+'-0006', remitente:'Consultoría Jurídica', tipo:'Punto de Cuenta', asunto:'Revisión de convenio interinstitucional con la UCAT', direccion:'Consultoría Jurídica', dependenciaId:'consultoria-juridica', prioridad:'media', vencimiento:null, notas:'', estado:'decidido', recibido:daysFromToday(-10), historial:[{fecha:daysFromToday(-10), accion:'Documento recibido y digitalizado'},{fecha:daysFromToday(-7), accion:'Revisado por Consultoría Jurídica'},{fecha:daysFromToday(-5), accion:'Elevado al Despacho para decisión'},{fecha:daysFromToday(-4), accion:'Aprobado por el Gobernador'}]},
    {id:7, tracking:'DES-'+y+'-0007', remitente:'Gestión Social', tipo:'Informe', asunto:'Reporte de ejecución del programa de Autoconstrucción', direccion:'Gestión Social', dependenciaId:'autoconstruccion', prioridad:'baja', vencimiento:null, notas:'', estado:'archivado', recibido:daysFromToday(-20), historial:[{fecha:daysFromToday(-20), accion:'Documento recibido y digitalizado'},{fecha:daysFromToday(-15), accion:'Revisado'},{fecha:daysFromToday(-12), accion:'Derivado a Gestión Social'},{fecha:daysFromToday(-10), accion:'Resuelto y archivado'}]}
  ];
}

function seedDependencias(){
  const cierre = daysFromToday(0).slice(0,4) + '-09-30'; // cierre de trimestre de referencia
  return [
    {
      id:'consultoria-juridica', nombre:'Consultoría Jurídica', responsable:'Dra. Francia', estadoDesignacion:'titular',
      descripcion:'Opiniones jurídicas, revisión de contratos, convenios, decretos, resoluciones y actos administrativos.',
      presupuestoAsignado:25000, manualEjecutadoBase:12800,
      metaTrimestre:{trimestre:'T3', descripcion:'Opiniones jurídicas y revisiones emitidas', cantidadMeta:40, cantidadEjecutada:27, fechaCierre:cierre},
      contrataciones:[]
    },
    {
      id:'odacyss', nombre:'ODACYSS — Oficina de Atención Comunitaria y Solidaridad Social', responsable:'Rachell', estadoDesignacion:'titular',
      descripcion:'Atención de solicitudes ciudadanas, coordinación de ayudas sociales y programas de atención comunitaria.',
      presupuestoAsignado:60000, manualEjecutadoBase:38000,
      metaTrimestre:{trimestre:'T3', descripcion:'Solicitudes ciudadanas atendidas', cantidadMeta:200, cantidadEjecutada:145, fechaCierre:cierre},
      contrataciones:[
        {id:101, descripcion:'Logística de jornadas de atención social', proveedor:'Suministros Andinos C.A.', monto:4000, estado:'en_proceso'}
      ]
    },
    {
      id:'gestion-social', nombre:'Gestión Social', responsable:'Cleiver', estadoDesignacion:'titular',
      descripcion:'Ejecución de programas de asistencia social, atención de casos especiales y entrega de ayudas.',
      presupuestoAsignado:120000, manualEjecutadoBase:55000,
      metaTrimestre:{trimestre:'T3', descripcion:'Ayudas sociales entregadas', cantidadMeta:100, cantidadEjecutada:62, fechaCierre:cierre},
      contrataciones:[
        {id:102, descripcion:'Compra de materiales de construcción — lote 3', proveedor:'Ferretería El Tácito', monto:15000, estado:'aprobada'}
      ],
      subprogramas:[
        {
          id:'autoconstruccion', nombre:'Autoconstrucción', responsable:'William',
          descripcion:'Mejoramiento de viviendas y entrega de materiales de construcción a familias.',
          presupuestoAsignado:40000, manualEjecutadoBase:15000,
          metaTrimestre:{trimestre:'T3', descripcion:'Viviendas mejoradas', cantidadMeta:25, cantidadEjecutada:9, fechaCierre:cierre},
          contrataciones:[]
        }
      ]
    },
    {
      id:'observatorio-frontera', nombre:'Observatorio de Frontera', responsable:'Keidy', estadoDesignacion:'encargada',
      descripcion:'En proceso de consolidación administrativa tras la renuncia de Rossy; pendiente designación oficial de jefatura.',
      presupuestoAsignado:30000, manualEjecutadoBase:5200,
      metaTrimestre:{trimestre:'T3', descripcion:'Reportes de monitoreo fronterizo', cantidadMeta:12, cantidadEjecutada:2, fechaCierre:cierre},
      contrataciones:[]
    },
    {
      id:'residencias-gobernador', nombre:'Residencias de Gobernadores', responsable:'Sin asignar', estadoDesignacion:'vacante',
      descripcion:'Administración y mantenimiento de las residencias institucionales.',
      presupuestoAsignado:45000, manualEjecutadoBase:39500,
      metaTrimestre:{trimestre:'T3', descripcion:'Intervenciones de mantenimiento ejecutadas', cantidadMeta:15, cantidadEjecutada:11, fechaCierre:cierre},
      contrataciones:[]
    }
  ];
}

function seedAyudas(){
  return [
    {id:1001, dependenciaId:'gestion-social', descripcion:'Ayuda alimentaria - Sector La Ermita', fuente:'propio', monto:3400, estado:'ejecutada', fecha:daysFromToday(-6)},
    {id:1002, dependenciaId:'gestion-social', descripcion:'Ayuda médica coordinada con la fundación', fuente:'fundacion', monto:2200, estado:'ejecutada', fecha:daysFromToday(-10)},
    {id:1003, dependenciaId:'odacyss', descripcion:'Kit escolar coordinado con la fundación', fuente:'fundacion', monto:1800, estado:'ejecutada', fecha:daysFromToday(-15)},
    {id:1004, dependenciaId:'gestion-social', descripcion:'Programa de dotación coordinado con Finanzas', fuente:'finanzas', monto:5000, estado:'aprobada', fecha:daysFromToday(-2)},
    {id:1005, dependenciaId:'autoconstruccion', descripcion:'Entrega de materiales - Barrio Obrero', fuente:'propio', monto:6000, estado:'ejecutada', fecha:daysFromToday(-8)}
  ];
}

function seedPartidas(){
  return [
    {id:2001, dependenciaId:'observatorio-frontera', motivo:'Adquisición de equipos de monitoreo fronterizo para acelerar la consolidación operativa', montoSolicitado:12000, estado:'pendiente', fechaSolicitud:daysFromToday(-5)}
  ];
}

function seedOrganismos(){
  return [
    {id:'org-sec-infraestructura', nombre:'Secretaría de Infraestructura', tipo:'Secretaría', responsable:'Por definir', telegramUsername:''},
    {id:'org-sec-educacion', nombre:'Secretaría de Educación', tipo:'Secretaría', responsable:'Por definir', telegramUsername:''},
    {id:'org-sec-salud', nombre:'Secretaría de Salud', tipo:'Secretaría', responsable:'Por definir', telegramUsername:''},
    {id:'org-proteccion-civil', nombre:'Protección Civil y Gestión de Riesgo', tipo:'Ente descentralizado', responsable:'Por definir', telegramUsername:''},
    {id:'org-fundesta', nombre:'FUNDESTA', tipo:'Instituto Autónomo', responsable:'Por definir', telegramUsername:''}
  ];
}

function seedPeticiones(){
  const year = new Date().getFullYear();
  return [
    {id:4001, tracking:'PET-'+year+'-0001', nombres:'María', apellidos:'Contreras', cedula:'V-12345678', correo:'maria.contreras@example.com', telefono:'0414-1234567', direccion:'Calle 5, Barrio Obrero, San Cristóbal', sector:'Barrio Obrero', organismoId:'org-sec-infraestructura', asunto:'Solicitud de reparación de alumbrado público', medioRecepcion:'Físico', fecha:daysFromToday(-20), estado:'recibida', respuesta:'', fechaRespuesta:null},
    {id:4002, tracking:'PET-'+year+'-0002', nombres:'José', apellidos:'Ramírez', cedula:'V-23456789', correo:'jose.ramirez@example.com', telefono:'0424-9876543', direccion:'Carrera 12, La Ermita, San Cristóbal', sector:'La Ermita', organismoId:'gestion-social', asunto:'Solicitud de ayuda para reconstrucción de vivienda', medioRecepcion:'Digital', fecha:daysFromToday(-5), estado:'en_atencion', respuesta:'', fechaRespuesta:null},
    {id:4003, tracking:'PET-'+year+'-0003', nombres:'Carmen', apellidos:'Duque', cedula:'V-34567890', correo:'carmen.duque@example.com', telefono:'0416-5551234', direccion:'Sector Palmira, San Cristóbal', sector:'Palmira', organismoId:'org-sec-salud', asunto:'Solicitud de jornada médica en la comunidad', medioRecepcion:'Ambos', fecha:daysFromToday(-30), estado:'respondida', respuesta:'Se coordinó jornada médica con la Secretaría de Salud para el próximo mes.', fechaRespuesta:daysFromToday(-10)}
  ];
}

function seedState(){
  return {
    documentos: seedDocumentos(),
    dependencias: seedDependencias(),
    ayudas: seedAyudas(),
    partidas: seedPartidas(),
    organismos: seedOrganismos(),
    peticiones: seedPeticiones()
  };
}

/* ============ PERSISTENCE ============ */
async function loadData(){
  if(FIREBASE_ENABLED && firestoreDocRef){
    try{
      const snap = await firestoreDocRef.get();
      if(snap.exists && snap.data() && snap.data().json){
        STATE = JSON.parse(snap.data().json);
        bindState();
        return;
      }
      STATE = seedState();
      bindState();
      await persist();
      return;
    }catch(e){
      console.error('No se pudo leer de la base de datos compartida, usando copia local', e);
      showToast('No se pudo conectar con la base de datos compartida — usando la copia guardada en este navegador.');
    }
  }
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    STATE = raw ? JSON.parse(raw) : seedState();
  }catch(e){
    STATE = seedState();
  }
  bindState();
}

async function persist(){
  const json = JSON.stringify(STATE);
  try{
    localStorage.setItem(STORAGE_KEY, json);
  }catch(e){
    console.error('Error al guardar localmente', e);
  }
  if(FIREBASE_ENABLED && firestoreDocRef){
    try{
      await firestoreDocRef.set({ json: json, actualizado: new Date().toISOString() });
    }catch(e){
      console.error('Error al guardar en la base de datos compartida', e);
      showToast('No se pudo guardar en la base de datos compartida — el cambio quedó solo en este navegador.');
    }
  }
}

function nextTrackingNumber(){
  const year = new Date().getFullYear();
  const countThisYear = DOCS.filter(d => d.tracking.includes('-' + year + '-')).length + 1;
  return 'DES-' + year + '-' + String(countThisYear).padStart(4,'0');
}

/* ============ ALERTS ============ */
function computeAlerts(){
  const alerts = [];
  const today = new Date();
  const totalDiasTrimestre = 92;

  getAllUnits().forEach(u => {
    const ejecutado = presupuestoEjecutado(u);
    const comprometido = presupuestoComprometido(u);
    const pct = u.presupuestoAsignado ? (ejecutado + comprometido) / u.presupuestoAsignado : 0;
    const nombre = u.isSub ? (u.nombre + ' (' + u.parentNombre + ')') : u.nombre;

    if(pct >= 0.95){
      alerts.push({severidad:'alta', texto: nombre + ': presupuesto comprometido/ejecutado al ' + (pct*100).toFixed(0) + '% — próximo a agotarse.'});
    } else if(pct >= 0.85){
      alerts.push({severidad:'media', texto: nombre + ': presupuesto comprometido/ejecutado al ' + (pct*100).toFixed(0) + '% — vigilar disponibilidad.'});
    }

    if(u.metaTrimestre){
      const m = u.metaTrimestre;
      const cierre = new Date(m.fechaCierre + 'T00:00:00');
      const diasRestantes = Math.ceil((cierre - today) / (1000*60*60*24));
      const diasTranscurridos = Math.min(totalDiasTrimestre, Math.max(0, totalDiasTrimestre - diasRestantes));
      const avanceEsperado = diasTranscurridos / totalDiasTrimestre;
      const avanceReal = m.cantidadMeta ? (m.cantidadEjecutada / m.cantidadMeta) : 0;

      if(diasRestantes >= 0 && avanceReal < (avanceEsperado - 0.15)){
        alerts.push({severidad:'media', texto: nombre + ': avance de meta ' + m.trimestre + ' en ' + (avanceReal*100).toFixed(0) + '%, por debajo de lo esperado (~' + (avanceEsperado*100).toFixed(0) + '%).'});
      }
      if(diasRestantes >= 0 && diasRestantes <= 15){
        alerts.push({severidad:'baja', texto: nombre + ': cierre del trimestre ' + m.trimestre + ' en ' + diasRestantes + ' día(s).'});
      }
    }
  });

  const overdueDocs = DOCS.filter(d => d.estado === 'en_despacho' && isOverdue(d));
  if(overdueDocs.length){
    alerts.push({severidad:'alta', texto: overdueDocs.length + ' documento(s) vencido(s) pendiente(s) de firma en la Bandeja del Gobernador.'});
  }

  PARTIDAS.filter(p => p.estado === 'pendiente').forEach(p => {
    const dep = DEPENDENCIAS.find(d => d.id === p.dependenciaId);
    alerts.push({severidad:'media', texto:'Solicitud de partida extraordinaria pendiente: ' + (dep ? dep.nombre : '—') + ' — ' + fmtMoney(p.montoSolicitado) + '.'});
  });

  PETICIONES.filter(p => p.estado === 'recibida' || p.estado === 'en_atencion').forEach(p => {
    const dias = Math.floor((today - new Date(p.fecha + 'T00:00:00')) / (1000*60*60*24));
    if(dias >= 15){
      alerts.push({severidad:'alta', texto:'Petición ciudadana sin respuesta hace ' + dias + ' días: ' + p.tracking + ' — ' + nombreCompletoPeticion(p) + '.'});
    }
  });

  const sevOrder = {alta:0, media:1, baja:2};
  alerts.sort((a,b) => sevOrder[a.severidad] - sevOrder[b.severidad]);
  return alerts;
}

/* ============ RENDER: RESUMEN ============ */
function renderResumen(){
  const alerts = computeAlerts();
  document.getElementById('count-resumen').textContent = alerts.length;

  const alertList = document.getElementById('alert-list');
  alertList.innerHTML = alerts.length === 0
    ? '<div class="empty-state"><div class="icon">✓</div>No hay alertas activas en este momento.</div>'
    : alerts.map(a => '<div class="alert sev-' + a.severidad + '"><span class="dot">●</span><span>' + escapeHtml(a.texto) + '</span></div>').join('');

  const units = getAllUnits();
  const totalAsignado = units.reduce((s,u) => s + u.presupuestoAsignado, 0);
  const totalEjecutado = units.reduce((s,u) => s + presupuestoEjecutado(u), 0);
  const pctGlobal = totalAsignado ? (totalEjecutado / totalAsignado * 100) : 0;
  const pendientesBandeja = DOCS.filter(d => d.estado === 'en_despacho').length;
  const ayudasEjecutadas = AYUDAS.filter(a => a.estado === 'ejecutada');
  const montoAyudasEjecutadas = ayudasEjecutadas.reduce((s,a) => s + a.monto, 0);

  document.getElementById('stat-presupuesto').innerHTML =
    '<div class="label">Presupuesto ejecutado / asignado</div>' +
    '<div class="value">' + fmtMoney(totalEjecutado) + ' <span style="font-size:13px;color:var(--slate);">/ ' + fmtMoney(totalAsignado) + '</span></div>' +
    '<div class="sub">' + pctGlobal.toFixed(1) + '% de ejecución global</div>';

  document.getElementById('stat-bandeja').innerHTML =
    '<div class="label">Pendientes de firma</div>' +
    '<div class="value">' + pendientesBandeja + '</div>' +
    '<div class="sub">En la Bandeja del Gobernador</div>';

  document.getElementById('stat-ayudas').innerHTML =
    '<div class="label">Ayudas sociales ejecutadas</div>' +
    '<div class="value">' + ayudasEjecutadas.length + '</div>' +
    '<div class="sub">' + fmtMoney(montoAyudasEjecutadas) + ' entregados</div>';

  document.getElementById('stat-dependencias').innerHTML =
    '<div class="label">Dependencias activas</div>' +
    '<div class="value">' + DEPENDENCIAS.length + '</div>' +
    '<div class="sub">' + units.length + ' unidades presupuestarias</div>';

  const peticionesPendientes = PETICIONES.filter(p => p.estado === 'recibida' || p.estado === 'en_atencion').length;
  document.getElementById('stat-ciudadano').innerHTML =
    '<div class="label">Peticiones ciudadanas pendientes</div>' +
    '<div class="value">' + peticionesPendientes + '</div>' +
    '<div class="sub">' + PETICIONES.length + ' registradas en total</div>';
}

/* ============ RENDER: DEPENDENCIAS ============ */
function toggleDepDetail(id){
  if(expandedDeps.has(id)) expandedDeps.delete(id); else expandedDeps.add(id);
  renderDependencias();
}

function renderSubprograma(sp){
  const ejecutado = presupuestoEjecutado(sp);
  const comprometido = presupuestoComprometido(sp);
  const pct = sp.presupuestoAsignado ? ((ejecutado + comprometido) / sp.presupuestoAsignado * 100) : 0;
  const barClass = pct >= 95 ? 'danger' : pct >= 85 ? 'warn' : 'ok';
  const m = sp.metaTrimestre;
  const pctMeta = (m && m.cantidadMeta) ? (m.cantidadEjecutada / m.cantidadMeta * 100) : 0;
  const metaBarClass = pctMeta >= 90 ? 'ok' : pctMeta >= 50 ? 'warn' : 'danger';

  let html = '<div class="subprograma">';
  html += '<h4>' + escapeHtml(sp.nombre) + ' — ' + escapeHtml(sp.responsable) + '</h4>';
  html += '<div class="dep-desc" style="margin-bottom:8px;">' + escapeHtml(sp.descripcion) + '</div>';
  html += '<div class="progress-label"><span>Presupuesto</span><span>' + fmtMoney(ejecutado + comprometido) + ' / ' + fmtMoney(sp.presupuestoAsignado) + '</span></div>';
  html += '<div class="progress-track"><div class="progress-fill ' + barClass + '" style="width:' + Math.min(100,pct) + '%"></div></div>';
  if(m){
    html += '<div class="progress-label" style="margin-top:10px;"><span>' + escapeHtml(m.descripcion) + '</span><span>' + m.cantidadEjecutada + '/' + m.cantidadMeta + '</span></div>';
    html += '<div class="progress-track"><div class="progress-fill ' + metaBarClass + '" style="width:' + Math.min(100,pctMeta) + '%"></div></div>';
    html += '<div class="avance-row"><input type="number" id="meta-input-' + sp.id + '" value="' + m.cantidadEjecutada + '" min="0"><button class="btn small" onclick="actualizarAvance(\'' + sp.id + '\')">Guardar avance</button></div>';
  }
  html += '<div class="contacto-edit">';
  html += '<strong style="font-size:12px;">Contacto del responsable</strong>';
  html += '<div class="contacto-row">';
  html += '<input type="text" id="dep-telegram-' + sp.id + '" placeholder="@usuario Telegram" value="' + escapeHtml(sp.telegramUsername || '') + '">';
  html += '<button class="btn small" onclick="guardarContactoDependencia(\'' + sp.id + '\')">Guardar</button>';
  html += '</div></div>';
  html += '</div>';
  return html;
}

function renderDepCard(dep){
  const ejecutado = presupuestoEjecutado(dep);
  const comprometido = presupuestoComprometido(dep);
  const disponible = presupuestoDisponible(dep);
  const pctTotal = dep.presupuestoAsignado ? ((ejecutado + comprometido) / dep.presupuestoAsignado * 100) : 0;
  const barClass = pctTotal >= 95 ? 'danger' : pctTotal >= 85 ? 'warn' : 'ok';

  const m = dep.metaTrimestre;
  const pctMeta = (m && m.cantidadMeta) ? (m.cantidadEjecutada / m.cantidadMeta * 100) : 0;
  const metaBarClass = pctMeta >= 90 ? 'ok' : pctMeta >= 50 ? 'warn' : 'danger';

  const expanded = expandedDeps.has(dep.id);
  const pendingPartida = PARTIDAS.find(p => p.dependenciaId === dep.id && p.estado === 'pendiente');

  let html = '<div class="dep-card">';
  html += '<h3>' + escapeHtml(dep.nombre) + '</h3>';
  html += '<div class="dep-resp">' + escapeHtml(dep.responsable);
  if(dep.estadoDesignacion !== 'titular'){
    const label = dep.estadoDesignacion === 'encargada' ? 'Encargada' : 'Vacante';
    html += '<span class="badge designacion-' + dep.estadoDesignacion + '">' + label + '</span>';
  }
  html += '</div>';
  html += '<div class="dep-desc">' + escapeHtml(dep.descripcion) + '</div>';

  html += '<div class="progress-row">';
  html += '<div class="progress-label"><span>Presupuesto</span><span>' + fmtMoney(ejecutado) + ' ejec. + ' + fmtMoney(comprometido) + ' compr. / ' + fmtMoney(dep.presupuestoAsignado) + '</span></div>';
  html += '<div class="progress-track"><div class="progress-fill ' + barClass + '" style="width:' + Math.min(100,pctTotal) + '%"></div></div>';
  html += '<div class="progress-label"><span>Disponible: ' + fmtMoney(disponible) + '</span><span>' + pctTotal.toFixed(0) + '%</span></div>';
  html += '</div>';

  if(m){
    html += '<div class="progress-row">';
    html += '<div class="progress-label"><span>Meta POA ' + m.trimestre + '</span><span>' + m.cantidadEjecutada + ' / ' + m.cantidadMeta + '</span></div>';
    html += '<div class="progress-track"><div class="progress-fill ' + metaBarClass + '" style="width:' + Math.min(100,pctMeta) + '%"></div></div>';
    html += '<div class="progress-label"><span>' + escapeHtml(m.descripcion) + '</span><span>Cierre: ' + fmtDate(m.fechaCierre) + '</span></div>';
    html += '<div class="avance-row"><input type="number" id="meta-input-' + dep.id + '" value="' + m.cantidadEjecutada + '" min="0"><button class="btn small" onclick="actualizarAvance(\'' + dep.id + '\')">Guardar avance</button></div>';
    html += '</div>';
  }

  if(pendingPartida){
    html += '<div class="partida-alert">Solicitud de partida extraordinaria pendiente: ' + fmtMoney(pendingPartida.montoSolicitado) + ' — ' + escapeHtml(pendingPartida.motivo);
    html += '<div class="actions"><button class="btn primary small" onclick="decidirPartida(' + pendingPartida.id + ', \'aprobada\')">Autorizar</button>';
    html += '<button class="btn reject small" onclick="decidirPartida(' + pendingPartida.id + ', \'rechazada\')">Rechazar</button></div></div>';
  }

  html += '<button class="dep-toggle" onclick="toggleDepDetail(\'' + dep.id + '\')">' + (expanded ? 'Ocultar detalle ▲' : 'Ver detalle ▼') + '</button>';

  if(expanded){
    (dep.subprogramas || []).forEach(sp => { html += renderSubprograma(sp); });

    html += '<div class="contrataciones-list"><strong style="font-size:12px;">Contrataciones</strong>';
    const contrataciones = dep.contrataciones || [];
    if(contrataciones.length === 0){
      html += '<div style="font-size:12px;color:var(--slate);margin-top:6px;">Sin contrataciones registradas.</div>';
    } else {
      contrataciones.forEach(c => {
        html += '<div class="contrat-item"><span>' + escapeHtml(c.descripcion) + ' — ' + escapeHtml(c.proveedor) + ' (' + fmtMoney(c.monto) + ')</span>';
        html += '<select onchange="cambiarEstadoContratacion(\'' + dep.id + '\', ' + c.id + ', this.value)">';
        ['en_proceso','aprobada','ejecutada'].forEach(e => {
          html += '<option value="' + e + '"' + (e === c.estado ? ' selected' : '') + '>' + CONTRAT_ESTADO_LABELS[e] + '</option>';
        });
        html += '</select></div>';
      });
    }
    html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">';
    html += '<button class="btn small" onclick="registrarContratacion(\'' + dep.id + '\')">+ Registrar contratación</button>';
    if(!pendingPartida){
      html += '<button class="btn small derive" onclick="solicitarPartida(\'' + dep.id + '\')">Solicitar partida extraordinaria</button>';
    }
    html += '</div>';

    html += '<div class="contacto-edit">';
    html += '<strong style="font-size:12px;">Contacto del responsable</strong>';
    html += '<div style="font-size:11px;color:var(--slate);margin-top:2px;">Aún no tenemos estos datos — regístralos aquí en cuanto los tengas, para que los recordatorios lleguen directo.</div>';
    html += '<div class="contacto-row">';
    html += '<input type="text" id="dep-telegram-' + dep.id + '" placeholder="@usuario Telegram" value="' + escapeHtml(dep.telegramUsername || '') + '">';
    html += '<button class="btn small" onclick="guardarContactoDependencia(\'' + dep.id + '\')">Guardar</button>';
    html += '</div></div>';

    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderDependencias(){
  const grid = document.getElementById('dep-grid');
  const pendCount = PARTIDAS.filter(p => p.estado === 'pendiente').length;
  document.getElementById('count-dependencias').textContent = pendCount;
  grid.innerHTML = DEPENDENCIAS.map(renderDepCard).join('');

  const orgList = document.getElementById('organismos-list');
  orgList.innerHTML = (ORGANISMOS || []).map(o =>
    '<div class="org-item"><strong>' + escapeHtml(o.nombre) + '</strong><span class="org-tipo">' + escapeHtml(o.tipo) + '</span>' +
    '<div class="org-meta">' + escapeHtml(o.responsable || '—') + (o.telegramUsername ? ' · ' + escapeHtml(o.telegramUsername) : '') + '</div></div>'
  ).join('') || '<div style="font-size:12px;color:var(--slate);">Sin organismos adicionales registrados todavía.</div>';
}

async function actualizarAvance(unitId){
  const input = document.getElementById('meta-input-' + unitId);
  if(!input) return;
  const nuevoValor = parseInt(input.value, 10);
  if(isNaN(nuevoValor) || nuevoValor < 0){ showToast('Ingresa un número válido'); return; }

  let target = DEPENDENCIAS.find(d => d.id === unitId);
  if(!target){
    for(const d of DEPENDENCIAS){
      const sp = (d.subprogramas || []).find(s => s.id === unitId);
      if(sp){ target = sp; break; }
    }
  }
  if(!target || !target.metaTrimestre) return;

  target.metaTrimestre.cantidadEjecutada = nuevoValor;
  await persist();
  renderAll();
  showToast('Avance actualizado');
}

async function guardarContactoDependencia(unitId){
  let target = DEPENDENCIAS.find(d => d.id === unitId);
  if(!target){
    for(const d of DEPENDENCIAS){
      const sp = (d.subprogramas || []).find(s => s.id === unitId);
      if(sp){ target = sp; break; }
    }
  }
  if(!target) return;

  const tg = document.getElementById('dep-telegram-' + unitId);
  target.telegramUsername = tg ? tg.value.trim() : '';

  await persist();
  populateSelects();
  renderAll();
  showToast('Contacto guardado');
}

async function registrarContratacion(depId){
  const descripcion = prompt('Descripción de la contratación:');
  if(!descripcion) return;
  const proveedor = prompt('Proveedor:') || 'Por definir';
  const montoStr = prompt('Monto (USD):');
  const monto = parseFloat(montoStr);
  if(isNaN(monto) || monto <= 0){ showToast('Monto inválido'); return; }

  const dep = DEPENDENCIAS.find(d => d.id === depId);
  if(!dep) return;
  if(!dep.contrataciones) dep.contrataciones = [];
  dep.contrataciones.push({id: Date.now(), descripcion, proveedor, monto, estado:'en_proceso'});
  await persist();
  renderAll();
  showToast('Contratación registrada');
}

async function cambiarEstadoContratacion(depId, contId, nuevoEstado){
  const dep = DEPENDENCIAS.find(d => d.id === depId);
  if(!dep) return;
  const c = (dep.contrataciones || []).find(c => c.id === contId);
  if(!c) return;
  c.estado = nuevoEstado;
  await persist();
  renderAll();
  showToast('Contratación actualizada: ' + CONTRAT_ESTADO_LABELS[nuevoEstado]);
}

async function solicitarPartida(depId){
  const motivo = prompt('Motivo de la solicitud de partida extraordinaria:');
  if(!motivo) return;
  const montoStr = prompt('Monto solicitado (USD):');
  const monto = parseFloat(montoStr);
  if(isNaN(monto) || monto <= 0){ showToast('Monto inválido'); return; }

  PARTIDAS.push({id: Date.now(), dependenciaId: depId, motivo, montoSolicitado: monto, estado:'pendiente', fechaSolicitud: new Date().toISOString().slice(0,10)});
  await persist();
  renderAll();
  showToast('Solicitud registrada, pendiente de autorización del Gobernador');
}

async function decidirPartida(partidaId, nuevoEstado){
  const p = PARTIDAS.find(p => p.id === partidaId);
  if(!p) return;
  p.estado = nuevoEstado;
  if(nuevoEstado === 'aprobada'){
    const dep = DEPENDENCIAS.find(d => d.id === p.dependenciaId);
    if(dep) dep.presupuestoAsignado += p.montoSolicitado;
  }
  await persist();
  renderAll();
  showToast(nuevoEstado === 'aprobada' ? 'Partida autorizada por el Gobernador' : 'Solicitud rechazada');
}

/* ============ RENDER: AYUDAS SOCIALES ============ */
function renderAyudas(){
  const pendCount = AYUDAS.filter(a => a.estado === 'pendiente').length;
  document.getElementById('count-ayudas').textContent = pendCount;

  const filterDep = document.getElementById('ayuda-filter-dep').value;
  const filterFuente = document.getElementById('ayuda-filter-fuente').value;
  const filterEstado = document.getElementById('ayuda-filter-estado').value;

  let filtered = AYUDAS.filter(a =>
    (!filterDep || a.dependenciaId === filterDep) &&
    (!filterFuente || a.fuente === filterFuente) &&
    (!filterEstado || a.estado === filterEstado)
  );
  filtered.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const totales = {};
  AYUDAS.forEach(a => { totales[a.fuente] = (totales[a.fuente] || 0) + a.monto; });
  document.getElementById('ayudas-summary').innerHTML = Object.keys(FUENTE_LABELS).map(f =>
    '<div class="ayuda-chip">' + FUENTE_LABELS[f] + ': <strong>' + fmtMoney(totales[f] || 0) + '</strong></div>'
  ).join('');

  const body = document.getElementById('ayudas-body');
  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="6"><div class="empty-state">No hay ayudas sociales con esos criterios.</div></td></tr>';
    return;
  }
  body.innerHTML = filtered.map(a =>
    '<tr><td>' + escapeHtml(a.descripcion) + '</td>' +
    '<td>' + escapeHtml(nombreUnidad(a.dependenciaId)) + '</td>' +
    '<td>' + FUENTE_LABELS[a.fuente] + '</td>' +
    '<td>' + fmtMoney(a.monto) + '</td>' +
    '<td><span class="estado-pill estado-' + a.estado + '">' + AYUDA_ESTADO_LABELS[a.estado] + '</span></td>' +
    '<td>' + fmtDate(a.fecha) + '</td></tr>'
  ).join('');
}

/* ============ RENDER: CONTROL CIUDADANO ============ */
function togglePeticionDetail(id){
  expandedPeticion = expandedPeticion === id ? null : id;
  renderControlCiudadano();
}

function nextPeticionTracking(){
  const year = new Date().getFullYear();
  const count = PETICIONES.filter(p => p.tracking.includes('-' + year + '-')).length + 1;
  return 'PET-' + year + '-' + String(count).padStart(4,'0');
}

function renderControlCiudadano(){
  const pendCount = PETICIONES.filter(p => p.estado === 'recibida' || p.estado === 'en_atencion').length;
  document.getElementById('count-ciudadano').textContent = pendCount;

  const search = document.getElementById('pet-search').value.toLowerCase();
  const filterEstado = document.getElementById('pet-filter-estado').value;
  const filterMedio = document.getElementById('pet-filter-medio').value;

  let filtered = PETICIONES.filter(p =>
    (!filterEstado || p.estado === filterEstado) &&
    (!filterMedio || p.medioRecepcion === filterMedio) &&
    (!search || nombreCompletoPeticion(p).toLowerCase().includes(search) || p.asunto.toLowerCase().includes(search) || p.tracking.toLowerCase().includes(search) || (p.cedula||'').toLowerCase().includes(search))
  );
  filtered.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  const total = PETICIONES.length;
  const respondidas = PETICIONES.filter(p => p.estado === 'respondida' || p.estado === 'archivada').length;
  const pct = total ? (respondidas / total * 100) : 0;
  document.getElementById('ciudadano-summary').innerHTML =
    '<div class="ayuda-chip">Total: <strong>' + total + '</strong></div>' +
    '<div class="ayuda-chip">Respondidas: <strong>' + respondidas + '</strong></div>' +
    '<div class="ayuda-chip">% de respuesta: <strong>' + pct.toFixed(0) + '%</strong></div>';

  const body = document.getElementById('peticiones-body');
  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="6"><div class="empty-state">No hay peticiones con esos criterios.</div></td></tr>';
    return;
  }

  body.innerHTML = filtered.map(p => {
    let rows = '<tr class="archrow" onclick="togglePeticionDetail(' + p.id + ')">' +
      '<td><span class="stamp" style="font-size:10.5px;">' + p.tracking + '</span></td>' +
      '<td>' + escapeHtml(nombreCompletoPeticion(p)) + '</td>' +
      '<td>' + escapeHtml(p.asunto) + '</td>' +
      '<td>' + escapeHtml(p.medioRecepcion) + '</td>' +
      '<td><span class="estado-pill estado-pet-' + p.estado + '">' + PETICION_ESTADO_LABELS[p.estado] + '</span></td>' +
      '<td>' + fmtDate(p.fecha) + '</td></tr>';

    if(expandedPeticion === p.id){
      rows += '<tr class="detail-row"><td colspan="6">';
      rows += '<div style="font-size:12px;color:var(--slate);margin-bottom:8px;line-height:1.7;">';
      rows += '<strong>Cédula:</strong> ' + escapeHtml(p.cedula || '—') + ' · ';
      rows += '<strong>Correo:</strong> ' + escapeHtml(p.correo || '—') + ' · ';
      rows += '<strong>Teléfono:</strong> ' + escapeHtml(p.telefono || '—') + '<br>';
      rows += '<strong>Dirección:</strong> ' + escapeHtml(p.direccion || '—') + '<br>';
      rows += '<strong>Sector:</strong> ' + escapeHtml(p.sector || '—') + ' · ';
      rows += '<strong>Organismo:</strong> ' + escapeHtml(p.organismoId ? nombreUnidad(p.organismoId) : 'Sin asignar');
      rows += '</div>';
      if(p.respuesta){
        rows += '<div style="font-size:12px;margin-bottom:8px;"><strong>Respuesta (' + fmtDate(p.fechaRespuesta) + '):</strong> ' + escapeHtml(p.respuesta) + '</div>';
      }
      rows += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      if(p.estado === 'recibida'){
        rows += '<button class="btn small" onclick="cambiarEstadoPeticion(' + p.id + ', \'en_atencion\')">Marcar en atención</button>';
      }
      if(p.estado !== 'respondida' && p.estado !== 'archivada'){
        rows += '<button class="btn small primary" onclick="responderPeticion(' + p.id + ')">Registrar respuesta</button>';
      }
      if(p.respuesta){
        rows += '<button class="btn small derive" onclick="notificarCiudadanoTelegram(' + p.id + ')">Notificar por Telegram</button>';
      }
      if(p.estado !== 'archivada'){
        rows += '<button class="btn small reject" onclick="cambiarEstadoPeticion(' + p.id + ', \'archivada\')">Archivar</button>';
      }
      rows += '</div>';

      rows += '<div class="oficio-box">';
      if(p.oficioGenerado){
        rows += '<div class="oficio-label">Oficio dirigido al Gobernador — ' + (p.oficioFuente === 'ia' ? 'redactado con IA' : 'plantilla básica, edítalo antes de enviar') + ' · ' + fmtDate(p.oficioFecha) + '</div>';
        rows += '<textarea id="oficio-text-' + p.id + '" class="oficio-textarea">' + escapeHtml(p.oficioGenerado) + '</textarea>';
        rows += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">';
        rows += '<button class="btn small" onclick="copiarOficio(' + p.id + ')">Copiar oficio</button>';
        rows += '<button class="btn small primary" onclick="enviarOficioABandeja(' + p.id + ')">Enviar a Bandeja del Gobernador</button>';
        rows += '<button class="btn small" onclick="descargarOficioPDF(' + p.id + ')">Descargar PDF</button>';
        rows += '<button class="btn small" onclick="generarOficio(' + p.id + ')">Regenerar con IA</button>';
        rows += '</div>';
        if(p.oficioEnviadoTracking){
          rows += '<div style="font-size:11.5px;color:var(--ok);margin-top:6px;">Enviado a la Bandeja del Gobernador como ' + escapeHtml(p.oficioEnviadoTracking) + '.</div>';
        }
      } else {
        rows += '<button class="btn small primary" onclick="generarOficio(' + p.id + ')">Generar oficio dirigido al Gobernador</button>';
        rows += '<div style="font-size:11px;color:var(--slate);margin-top:6px;">Redacta un oficio formal a partir del caso, reorganizando el lenguaje del ciudadano si fue escrito de forma coloquial.</div>';
      }
      rows += '</div>';

      rows += '</td></tr>';
    }
    return rows;
  }).join('');
}

function oficioTemplateFallback(p){
  return 'Ciudadano(a) Gobernador\n' +
    'Dr. Freddy Bernal\n' +
    'Gobernador del Estado Táchira\n' +
    'Su Despacho.-\n\n' +
    'Me dirijo a usted en la oportunidad de someter a su consideración el caso planteado por el/la ciudadano(a) ' + nombreCompletoPeticion(p) + ', titular de la cédula de identidad ' + (p.cedula || 'no especificada') +
    (p.sector ? (', del sector ' + p.sector) : '') + ', quien mediante petición N° ' + p.tracking + ', recibida en fecha ' +
    fmtDate(p.fecha) + ' por vía ' + p.medioRecepcion.toLowerCase() + ', expone lo siguiente:\n\n' +
    '"' + p.asunto + '"\n\n' +
    'Se eleva el presente caso a su digno Despacho para los fines pertinentes y las instrucciones que a bien tenga impartir.\n\n' +
    'Sin otro particular,';
}

async function generarOficio(id){
  const p = PETICIONES.find(p => p.id === id);
  if(!p) return;
  showToast('Generando oficio, un momento...');

  const promptText = 'Eres un asistente redactor del Despacho del Gobernador del Estado Táchira, Venezuela. ' +
    'Redacta un oficio formal dirigido al Dr. Freddy Bernal, Gobernador del Estado Táchira, presentando el siguiente caso ciudadano para su conocimiento e instrucciones. ' +
    'Usa español administrativo formal venezolano, con encabezado protocolar y despedida, en un máximo de 4 párrafos. ' +
    'Si la descripción del caso está redactada de forma coloquial, informal o desordenada, reorganízala con claridad y precisión, sin inventar hechos, cifras ni compromisos que no estén presentes en el texto original. ' +
    'No incluyas firma ni fecha de emisión, solo el cuerpo del oficio.\n\n' +
    'Datos del caso:\n' +
    '- Ciudadano: ' + nombreCompletoPeticion(p) + '\n' +
    '- Cédula: ' + (p.cedula || 'No especificada') + '\n' +
    '- Dirección: ' + (p.direccion || 'No especificada') + '\n' +
    '- Sector o comunidad: ' + (p.sector || 'No especificado') + '\n' +
    '- Fecha de recepción: ' + fmtDate(p.fecha) + '\n' +
    '- N° de seguimiento: ' + p.tracking + '\n' +
    '- Medio de recepción: ' + p.medioRecepcion + '\n' +
    '- Descripción del caso (tal como fue planteada por el ciudadano): "' + p.asunto + '"';

  try{
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: promptText }]
      })
    });
    if(!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const texto = (data.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n').trim();
    if(!texto) throw new Error('Respuesta vacía');

    p.oficioGenerado = texto;
    p.oficioFuente = 'ia';
    p.oficioFecha = new Date().toISOString().slice(0,10);
    await persist();
    renderAll();
    showToast('Oficio redactado con IA');
  }catch(e){
    console.error('No se pudo generar el oficio con IA:', e);
    p.oficioGenerado = oficioTemplateFallback(p);
    p.oficioFuente = 'plantilla';
    p.oficioFecha = new Date().toISOString().slice(0,10);
    await persist();
    renderAll();
    showToast('El asistente de IA no está disponible aquí — se generó una plantilla básica, edítala antes de enviar.');
  }
}

function getOficioTextareaValue(id){
  const el = document.getElementById('oficio-text-' + id);
  return el ? el.value : null;
}

async function copiarOficio(id){
  const texto = getOficioTextareaValue(id);
  if(!texto) return;
  const p = PETICIONES.find(p => p.id === id);
  if(p){ p.oficioGenerado = texto; await persist(); }
  try{
    await navigator.clipboard.writeText(texto);
    showToast('Oficio copiado al portapapeles');
  }catch(e){
    showToast('No se pudo copiar automáticamente — selecciona y copia el texto manualmente.');
  }
}

async function enviarOficioABandeja(id){
  const p = PETICIONES.find(p => p.id === id);
  if(!p) return;
  const texto = getOficioTextareaValue(id) || p.oficioGenerado;
  if(!texto) return;
  p.oficioGenerado = texto;

  const doc = {
    id: Date.now(),
    tracking: nextTrackingNumber(),
    remitente: 'Control Ciudadano — Petición ' + p.tracking,
    tipo: 'Oficio',
    asunto: 'Caso ciudadano: ' + p.asunto,
    direccion: 'Despacho del Gobernador',
    dependenciaId: p.organismoId,
    prioridad: 'media',
    vencimiento: null,
    notas: texto,
    estado: 'en_despacho',
    recibido: new Date().toISOString().slice(0,10),
    historial: [{fecha: new Date().toISOString().slice(0,10), accion: 'Oficio generado a partir de la petición ' + p.tracking + ' y enviado a la Bandeja del Gobernador'}]
  };
  DOCS.unshift(doc);
  p.oficioEnviadoTracking = doc.tracking;
  await persist();
  renderAll();
  showToast('Oficio enviado a la Bandeja del Gobernador: ' + doc.tracking);
}

function notificarCiudadanoTelegram(id){
  const p = PETICIONES.find(p => p.id === id);
  if(!p) return;
  const mensaje = 'Gobernación del Estado Táchira — Despacho del Gobernador\n' +
    'Estimado(a) ' + nombreCompletoPeticion(p) + ', en relación a su solicitud (' + p.tracking + '): ' + p.asunto + '\n\n' +
    'Respuesta: ' + (p.respuesta || 'En proceso de atención.');
  const link = buildTelegramLink('', mensaje);
  abrirModalMensaje('Notificar a ' + nombreCompletoPeticion(p), mensaje, link, 'Telegram');
}

/* ============ PDF GENERATION ============ */
let jsPdfLoadPromise = null;
function ensureJsPDF(){
  if(window.jspdf && window.jspdf.jsPDF) return Promise.resolve(true);
  if(jsPdfLoadPromise) return jsPdfLoadPromise;
  jsPdfLoadPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if(settled) return; settled = true; resolve(ok); };
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => finish(!!(window.jspdf && window.jspdf.jsPDF));
    script.onerror = () => finish(false);
    document.head.appendChild(script);
    setTimeout(() => finish(!!(window.jspdf && window.jspdf.jsPDF)), 8000);
  });
  return jsPdfLoadPromise;
}

function pdfLetterhead(doc, margin){
  try{
    const img = document.getElementById('img-banner-gobernacion');
    if(img) doc.addImage(img, 'PNG', margin, 10, 58, 21.5);
  }catch(e){ console.error('No se pudo insertar el membrete en el PDF:', e); }
  doc.setDrawColor(180, 200, 225);
  doc.setLineWidth(0.4);
  doc.line(margin, 35, doc.internal.pageSize.getWidth() - margin, 35);
  return 44;
}

function pdfFooter(doc, margin){
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text('Despacho del Gobernador del Estado Táchira — Sistema de Correspondencia Digital', margin, h - 12);
  doc.setTextColor(0);
}

async function descargarOficioPDF(id){
  const p = PETICIONES.find(p => p.id === id);
  if(!p) return;
  const texto = getOficioTextareaValue(id) || p.oficioGenerado;
  if(!texto){ showToast('Primero genera el oficio'); return; }

  showToast('Preparando PDF...');
  const ok = await ensureJsPDF();
  if(!ok){
    showToast('No se pudo cargar el generador de PDF (requiere conexión a internet). Usa "Copiar oficio" mientras tanto.');
    return;
  }

  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const margin = 22;
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - margin * 2;
    let y = pdfLetterhead(doc, margin);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('OFICIO N° ' + p.tracking, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('San Cristóbal, ' + fmtDate(new Date().toISOString().slice(0,10)), pageWidth - margin, y, { align: 'right' });
    y += 11;

    doc.setFontSize(11);
    const lines = doc.splitTextToSize(texto, usableWidth);
    doc.text(lines, margin, y, { lineHeightFactor: 1.5 });

    pdfFooter(doc, margin);
    doc.save('Oficio_' + p.tracking + '.pdf');
    showToast('PDF descargado');
  }catch(e){
    console.error('Fallo al generar el PDF del oficio:', e);
    showToast('No se pudo generar el PDF. Usa "Copiar oficio" como alternativa.');
  }
}
async function responderPeticion(id){
  const p = PETICIONES.find(p => p.id === id);
  if(!p) return;
  const respuesta = prompt('Respuesta dada al ciudadano:');
  if(!respuesta) return;
  p.respuesta = respuesta;
  p.estado = 'respondida';
  p.fechaRespuesta = new Date().toISOString().slice(0,10);
  await persist();
  renderAll();
  showToast('Respuesta registrada');
}

async function cambiarEstadoPeticion(id, estado){
  const p = PETICIONES.find(p => p.id === id);
  if(!p) return;
  p.estado = estado;
  await persist();
  renderAll();
  showToast('Estado actualizado');
}

/* ============ RENDER: BANDEJA ============ */
function renderBandeja(){
  const list = document.getElementById('inbox-list');
  const items = DOCS.filter(d => d.estado === 'en_despacho');
  document.getElementById('count-bandeja').textContent = items.length;

  if(items.length === 0){
    list.innerHTML = '<div class="empty-state"><div class="icon">✓</div>No hay documentos pendientes de decisión del Gobernador.</div>';
    return;
  }

  const prioOrder = {alta:0, media:1, baja:2};
  items.sort((a,b) => {
    if(prioOrder[a.prioridad] !== prioOrder[b.prioridad]) return prioOrder[a.prioridad] - prioOrder[b.prioridad];
    if(!a.vencimiento) return 1;
    if(!b.vencimiento) return -1;
    return new Date(a.vencimiento) - new Date(b.vencimiento);
  });

  list.innerHTML = items.map(d => {
    const depTag = d.dependenciaId ? (' · ' + escapeHtml(nombreUnidad(d.dependenciaId))) : '';
    return '<div class="card inbox-item">' +
      '<div class="stamp">' + d.tracking + '</div>' +
      '<div class="inbox-main">' +
        '<div class="asunto">' + escapeHtml(d.asunto) + '</div>' +
        '<div class="meta">' + escapeHtml(d.remitente) + ' · ' + escapeHtml(d.tipo) + depTag + ' · recibido ' + fmtDate(d.recibido) + '</div>' +
        '<div class="inbox-actions">' +
          '<button class="btn primary" onclick="decidir(' + d.id + ', \'decidido\', \'Aprobado\')">Aprobar</button>' +
          '<button class="btn reject" onclick="decidir(' + d.id + ', \'decidido\', \'Rechazado\')">Rechazar</button>' +
          '<button class="btn derive" onclick="derivar(' + d.id + ')">Derivar</button>' +
        '</div>' +
      '</div>' +
      '<div class="inbox-meta">' +
        '<span class="badge prio-' + d.prioridad + '">' + d.prioridad + '</span>' +
        '<div class="venc">' + (d.vencimiento ? ((isOverdue(d) ? '<span class="badge overdue">Vencido</span> ' : '') + 'Vence: ' + fmtDate(d.vencimiento)) : 'Sin vencimiento') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function decidir(id, nuevoEstado, decisionLabel){
  const doc = DOCS.find(d => d.id === id);
  if(!doc) return;
  doc.estado = nuevoEstado;
  doc.historial.push({fecha: new Date().toISOString().slice(0,10), accion: decisionLabel + ' por el Gobernador'});
  await persist();
  renderAll();
  showToast(decisionLabel + ': ' + doc.tracking);
}

async function derivar(id){
  const doc = DOCS.find(d => d.id === id);
  if(!doc) return;
  const destino = prompt('¿A qué dirección se deriva este documento?', doc.direccion);
  if(destino === null) return;
  doc.estado = 'en_revision';
  doc.direccion = destino || doc.direccion;
  doc.historial.push({fecha: new Date().toISOString().slice(0,10), accion: 'Derivado a ' + doc.direccion});
  await persist();
  renderAll();
  showToast('Derivado a ' + doc.direccion);
}

/* ============ RENDER: KANBAN ============ */
function renderKanban(){
  const board = document.getElementById('kanban-board');
  board.innerHTML = ESTADOS.map(estado => {
    const docs = DOCS.filter(d => d.estado === estado);
    const cards = docs.map(d =>
      '<div class="kcard"><div class="stamp" style="font-size:10px;padding:2px 6px;">' + d.tracking + '</div>' +
      '<div class="asunto">' + escapeHtml(d.asunto) + '</div>' +
      '<div class="meta">' + escapeHtml(d.remitente) + '</div>' +
      '<select onchange="cambiarEstado(' + d.id + ', this.value)">' +
      ESTADOS.map(e => '<option value="' + e + '"' + (e === estado ? ' selected' : '') + '>' + ESTADO_LABELS[e] + '</option>').join('') +
      '</select></div>'
    ).join('') || '<p style="font-size:12px;color:var(--slate);margin:0;">Vacío</p>';

    return '<div class="kcol"><div class="kcol-head"><h3>' + ESTADO_LABELS[estado] + '</h3><span class="n">' + docs.length + '</span></div>' + cards + '</div>';
  }).join('');
}

async function cambiarEstado(id, nuevoEstado){
  const doc = DOCS.find(d => d.id === id);
  if(!doc) return;
  doc.estado = nuevoEstado;
  doc.historial.push({fecha: new Date().toISOString().slice(0,10), accion: 'Movido a: ' + ESTADO_LABELS[nuevoEstado]});
  await persist();
  renderAll();
  showToast(doc.tracking + ' → ' + ESTADO_LABELS[nuevoEstado]);
}

/* ============ RENDER: ARCHIVO ============ */
function renderArchivo(){
  const search = document.getElementById('arch-search').value.toLowerCase();
  const estadoFilter = document.getElementById('arch-estado').value;
  const body = document.getElementById('archive-body');

  let filtered = DOCS.filter(d => {
    const matchSearch = !search || d.asunto.toLowerCase().includes(search) || d.remitente.toLowerCase().includes(search) || d.tracking.toLowerCase().includes(search);
    const matchEstado = !estadoFilter || d.estado === estadoFilter;
    return matchSearch && matchEstado;
  });
  filtered.sort((a,b) => new Date(b.recibido) - new Date(a.recibido));

  if(filtered.length === 0){
    body.innerHTML = '<tr><td colspan="5"><div class="empty-state">No se encontraron documentos con esos criterios.</div></td></tr>';
    return;
  }

  body.innerHTML = filtered.map(d => {
    let rows = '<tr class="archrow" onclick="toggleDetail(' + d.id + ')">' +
      '<td><span class="stamp" style="font-size:10.5px;">' + d.tracking + '</span></td>' +
      '<td>' + escapeHtml(d.asunto) + '</td>' +
      '<td>' + escapeHtml(d.remitente) + '</td>' +
      '<td><span class="estado-pill estado-' + d.estado + '">' + ESTADO_LABELS[d.estado] + '</span></td>' +
      '<td>' + fmtDate(d.recibido) + '</td></tr>';

    if(expandedRow === d.id){
      rows += '<tr class="detail-row"><td colspan="5">' +
        '<strong style="font-size:12.5px;">Historial de trazabilidad</strong>' +
        '<ul class="hist">' + d.historial.map(h => '<li>' + fmtDate(h.fecha) + ' — ' + escapeHtml(h.accion) + '</li>').join('') + '</ul>';
      if(d.dependenciaId){
        rows += '<div style="margin-top:8px;font-size:12px;color:var(--slate);"><strong>Dependencia relacionada:</strong> ' + escapeHtml(nombreUnidad(d.dependenciaId)) + '</div>';
      }
      if(d.notas){
        rows += '<div style="margin-top:8px;font-size:12px;color:var(--slate);"><strong>Notas:</strong> ' + escapeHtml(d.notas) + '</div>';
      }
      rows += '</td></tr>';
    }
    return rows;
  }).join('');
}

function toggleDetail(id){
  expandedRow = expandedRow === id ? null : id;
  renderArchivo();
}

/* ============ SELECT POPULATION ============ */
function populateSelects(){
  const units = getAllUnits();
  const options = units.map(u =>
    '<option value="' + u.id + '">' + escapeHtml(u.isSub ? (u.nombre + ' (' + u.parentNombre + ')') : u.nombre) + '</option>'
  ).join('');

  document.getElementById('ay-dependencia').innerHTML = options;
  document.getElementById('ayuda-filter-dep').innerHTML = '<option value="">Todas las dependencias</option>' + options;
  document.getElementById('f-dependencia').innerHTML = '<option value="">Sin asociar</option>' + options;

  const orgOptions = getAllOrganismos().map(o =>
    '<option value="' + o.id + '">' + escapeHtml(o.nombre) + '</option>'
  ).join('');
  document.getElementById('pet-organismo').innerHTML = '<option value="">Sin asignar</option>' + orgOptions;
}

/* ============ RENDER ALL ============ */
function renderAll(){
  renderResumen();
  renderDependencias();
  renderAyudas();
  renderControlCiudadano();
  renderBandeja();
  renderKanban();
  renderArchivo();
}

/* ============ NAVIGATION ============ */
document.querySelectorAll('.navitem').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.navitem').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('view-' + item.dataset.view).classList.add('active');
    document.querySelector('.main-content').scrollTop = 0;
    window.scrollTo(0, 0);
  });
});

/* ============ FORMS ============ */
document.getElementById('form-nuevo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const doc = {
    id: Date.now(),
    tracking: nextTrackingNumber(),
    remitente: document.getElementById('f-remitente').value.trim(),
    tipo: document.getElementById('f-tipo').value,
    asunto: document.getElementById('f-asunto').value.trim(),
    direccion: 'Despacho del Gobernador',
    dependenciaId: document.getElementById('f-dependencia').value || null,
    prioridad: document.getElementById('f-prioridad').value,
    vencimiento: document.getElementById('f-vencimiento').value || null,
    notas: document.getElementById('f-notas').value.trim(),
    estado: 'recibido',
    recibido: new Date().toISOString().slice(0,10),
    historial: [{fecha: new Date().toISOString().slice(0,10), accion: 'Documento recibido y digitalizado'}]
  };
  DOCS.unshift(doc);
  await persist();
  showToast('Registrado: ' + doc.tracking);
  e.target.reset();
  renderAll();
});

document.getElementById('btn-limpiar').addEventListener('click', () => {
  document.getElementById('form-nuevo').reset();
});

document.getElementById('form-ayuda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = parseFloat(document.getElementById('ay-monto').value);
  const descripcion = document.getElementById('ay-descripcion').value.trim();
  if(!descripcion || isNaN(monto) || monto <= 0){
    showToast('Completa descripción y un monto válido');
    return;
  }
  const ayuda = {
    id: Date.now(),
    dependenciaId: document.getElementById('ay-dependencia').value,
    descripcion: descripcion,
    fuente: document.getElementById('ay-fuente').value,
    monto: monto,
    estado: document.getElementById('ay-estado').value,
    fecha: new Date().toISOString().slice(0,10)
  };
  AYUDAS.unshift(ayuda);
  await persist();
  renderAll();
  showToast('Ayuda social registrada');
  e.target.reset();
});

document.getElementById('form-organismo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('org-nombre').value.trim();
  if(!nombre){
    showToast('Ingresa un nombre para el organismo');
    return;
  }
  const organismo = {
    id: 'org-' + Date.now(),
    nombre: nombre,
    tipo: document.getElementById('org-tipo').value,
    responsable: document.getElementById('org-responsable').value.trim() || '—',
    telegramUsername: document.getElementById('org-telegram').value.trim()
  };
  ORGANISMOS.push(organismo);
  await persist();
  populateSelects();
  renderAll();
  showToast('Organismo registrado');
  e.target.reset();
});

document.getElementById('form-peticion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombres = document.getElementById('pet-nombres').value.trim();
  const apellidos = document.getElementById('pet-apellidos').value.trim();
  const cedula = document.getElementById('pet-cedula').value.trim();
  const correo = document.getElementById('pet-correo').value.trim();
  const telefono = document.getElementById('pet-telefono').value.trim();
  const direccion = document.getElementById('pet-direccion').value.trim();
  const asunto = document.getElementById('pet-asunto').value.trim();

  if(!nombres || !apellidos || !cedula || !correo || !telefono || !direccion || !asunto){
    showToast('Completa todos los datos del ciudadano — son obligatorios');
    return;
  }

  const peticion = {
    id: Date.now(),
    tracking: nextPeticionTracking(),
    nombres: nombres,
    apellidos: apellidos,
    cedula: cedula,
    correo: correo,
    telefono: telefono,
    direccion: direccion,
    sector: document.getElementById('pet-sector').value.trim(),
    organismoId: document.getElementById('pet-organismo').value || null,
    asunto: asunto,
    medioRecepcion: document.getElementById('pet-medio').value,
    fecha: new Date().toISOString().slice(0,10),
    estado: 'recibida',
    respuesta: '',
    fechaRespuesta: null
  };
  PETICIONES.unshift(peticion);
  await persist();
  renderAll();
  showToast('Petición registrada: ' + peticion.tracking);
  e.target.reset();
});

document.getElementById('arch-search').addEventListener('input', renderArchivo);
document.getElementById('arch-estado').addEventListener('change', renderArchivo);
document.getElementById('ayuda-filter-dep').addEventListener('change', renderAyudas);
document.getElementById('ayuda-filter-fuente').addEventListener('change', renderAyudas);
document.getElementById('ayuda-filter-estado').addEventListener('change', renderAyudas);
document.getElementById('pet-search').addEventListener('input', renderControlCiudadano);
document.getElementById('pet-filter-estado').addEventListener('change', renderControlCiudadano);
document.getElementById('pet-filter-medio').addEventListener('change', renderControlCiudadano);

/* ============ LOGIN ============ */
const LOGIN_USER = 'ISAAC';
const LOGIN_PASS = 'DESPACHOG';

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  if(user.toUpperCase() === LOGIN_USER && pass === LOGIN_PASS){
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
  } else {
    document.getElementById('login-error').style.display = 'block';
  }
});

function cerrarSesion(){
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
}

document.getElementById('msg-modal-open-btn').addEventListener('click', () => {
  if(modalMensajeLink) window.open(modalMensajeLink, '_blank', 'noopener');
});

/* ============ INIT ============ */
(async function init(){
  document.getElementById('inbox-list').innerHTML = '<div class="loading">Cargando información del Despacho...</div>';
  updateGuiaPersistenciaText();
  await loadData();
  populateSelects();
  renderAll();
  initRealtimeSync();
})();