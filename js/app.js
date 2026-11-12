/* ============ CONSTANTS ============ */
const STORAGE_KEY = 'agenda-direccion-v1';

let STATE = null;
let DIRECCIONES, AGENDAS;

/* ============ AGENDA POR DIRECCIÓN — estado de la vista ============ */
let agendaUnidadSel = null;
let agendaMesVisible = new Date();
let agendaFechaSel = ymd(new Date());

function ymd(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ============ SINCRONIZACIÓN COMPARTIDA (Firebase) ============
   Proyecto: despacho-digital-6999f (console.firebase.google.com). Todas las
   computadoras que abren el sistema leen/escriben el mismo documento
   Firestore (colección "despacho", documento "estado") — ver README.md
   para el detalle completo del funcionamiento y las reglas de seguridad.
   Si FIREBASE_CONFIG.apiKey queda vacío (o el SDK no carga), el sistema cae
   automáticamente a guardado solo-local (localStorage) sin romperse. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCxCTdJsl9aTyZaXP9CnQQm0CDFndUQ-Vg",
  authDomain: "despacho-digital-6999f.firebaseapp.com",
  projectId: "despacho-digital-6999f",
  storageBucket: "despacho-digital-6999f.firebasestorage.app",
  messagingSenderId: "483414657452",
  appId: "1:483414657452:web:4ad29da5c2a9e8ac805209"
};
const FIREBASE_ENABLED = !!FIREBASE_CONFIG.apiKey;
let firestoreDocRef = null;
let firebaseAuthInstance = null;

function loadScriptOnce(src){
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if(settled) return; settled = true; resolve(ok); };
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
    setTimeout(() => finish(false), 8000);
  });
}

// Carga Firebase App + Firestore + Authentication. El acceso real al sistema
// (y a la base de datos compartida) depende de Authentication — las reglas de
// Firestore exigen "request.auth != null", así que sin este SDK cargado no
// hay forma de entrar ni de leer/escribir datos (ver firestore.rules).
async function ensureFirebase(){
  if(!FIREBASE_ENABLED) return false;
  if(window.firebase && firebase.firestore && firebase.auth){
    if(!firestoreDocRef) firestoreDocRef = firebase.firestore().collection('despacho').doc('estado');
    if(!firebaseAuthInstance) firebaseAuthInstance = firebase.auth();
    return true;
  }
  const okApp = await loadScriptOnce('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  if(!okApp) return false;
  const okFs = await loadScriptOnce('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js');
  if(!okFs) return false;
  const okAuth = await loadScriptOnce('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');
  if(!okAuth) return false;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDocRef = firebase.firestore().collection('despacho').doc('estado');
    firebaseAuthInstance = firebase.auth();
    return true;
  }catch(e){
    console.error('No se pudo inicializar Firebase', e);
    return false;
  }
}

function bindState(){
  // Migración desde la versión anterior del sistema (dependencias con
  // presupuesto, organismos, subprogramas, documentos, ayudas, peticiones):
  // de todo eso solo nos interesaba el nombre de cada dirección/ente, que es
  // lo único que usa la Agenda. Si el documento guardado todavía trae esa
  // forma antigua, la reducimos a una lista simple {id, nombre} una sola vez.
  if(!Array.isArray(STATE.direcciones)){
    const migradas = [];
    (STATE.dependencias || []).forEach(d => {
      migradas.push({id: d.id, nombre: d.nombre});
      (d.subprogramas || []).forEach(sp => migradas.push({id: sp.id, nombre: sp.nombre + ' (' + d.nombre + ')'}));
    });
    (STATE.organismos || []).forEach(o => migradas.push({id: o.id, nombre: o.nombre}));
    STATE.direcciones = migradas.length ? migradas : seedDirecciones();
  }
  if(!Array.isArray(STATE.agendaActividades)) STATE.agendaActividades = [];
  // Datos de la versión anterior que ya no usa este sistema — se descartan
  // para que, de aquí en adelante, lo que se guarda sea solo lo de la Agenda.
  delete STATE.documentos;
  delete STATE.dependencias;
  delete STATE.ayudas;
  delete STATE.partidas;
  delete STATE.organismos;
  delete STATE.peticiones;

  DIRECCIONES = STATE.direcciones;
  AGENDAS = STATE.agendaActividades;
}
window.__debugState = function(){ return STATE; };

/* ============ UTILITIES ============ */
function showToast(msg, duracionMs){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), duracionMs || 2200);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('es-VE', {day:'2-digit', month:'short', year:'numeric'});
}

function ahoraISO(){
  return new Date().toISOString();
}

/* ============ SEED DATA ============
   Mismos nombres e IDs que usaba el sistema anterior para las 5 dependencias,
   su subprograma y las 5 direcciones/entes registradas — así cualquier
   actividad de agenda ya guardada sigue viendo su dirección correctamente. */
function seedDirecciones(){
  return [
    {id:'consultoria-juridica', nombre:'Consultoría Jurídica'},
    {id:'odacyss', nombre:'ODACYSS — Oficina de Atención Comunitaria y Solidaridad Social'},
    {id:'gestion-social', nombre:'Gestión Social'},
    {id:'autoconstruccion', nombre:'Autoconstrucción (Gestión Social)'},
    {id:'observatorio-frontera', nombre:'Observatorio de Frontera'},
    {id:'residencias-gobernador', nombre:'Residencias de Gobernadores'},
    {id:'org-sec-infraestructura', nombre:'Secretaría de Infraestructura'},
    {id:'org-sec-educacion', nombre:'Secretaría de Educación'},
    {id:'org-sec-salud', nombre:'Secretaría de Salud'},
    {id:'org-proteccion-civil', nombre:'Protección Civil y Gestión de Riesgo'},
    {id:'org-fundesta', nombre:'FUNDESTA'}
  ];
}

function seedState(){
  return {
    direcciones: seedDirecciones(),
    agendaActividades: []
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

let unsubscribeRealtimeSync = null;

function initRealtimeSync(){
  if(!(FIREBASE_ENABLED && firestoreDocRef)) return;
  if(unsubscribeRealtimeSync) return; // ya hay un listener activo
  unsubscribeRealtimeSync = firestoreDocRef.onSnapshot((snap) => {
    if(!snap.exists) return;
    const data = snap.data();
    if(!data || !data.json) return;
    try{
      STATE = JSON.parse(data.json);
      bindState();
      localStorage.setItem(STORAGE_KEY, data.json);
      populateSelects();
      renderAgenda();
    }catch(e){ console.error('Error al sincronizar', e); }
  }, (err) => {
    if(firebaseAuthInstance && firebaseAuthInstance.currentUser) console.error('Error de sincronización en tiempo real', err);
  });
}

/* ============ SELECT POPULATION ============ */
function fillSelectPreservingValue(id, html){
  const el = document.getElementById(id);
  const previo = el.value;
  el.innerHTML = html;
  if(previo && el.querySelector('option[value="' + CSS.escape(previo) + '"]')){
    el.value = previo;
  }
}

function populateSelects(){
  const options = DIRECCIONES.map(d =>
    '<option value="' + d.id + '">' + escapeHtml(d.nombre) + '</option>'
  ).join('');
  fillSelectPreservingValue('agenda-unidad', options);
  if(!agendaUnidadSel && DIRECCIONES.length) agendaUnidadSel = DIRECCIONES[0].id;
  const selEl = document.getElementById('agenda-unidad');
  if(selEl && agendaUnidadSel) selEl.value = agendaUnidadSel;
}

/* ============ RENDER: AGENDA POR DIRECCIÓN ============ */
const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function renderAgenda(){
  if(!agendaUnidadSel && DIRECCIONES.length){
    agendaUnidadSel = DIRECCIONES[0].id;
  }
  renderAgendaCalendario();
  renderAgendaDiaLista();
}

function renderAgendaCalendario(){
  const grid = document.getElementById('agenda-cal-grid');
  const label = document.getElementById('agenda-mes-label');
  if(!grid || !label) return;

  const anio = agendaMesVisible.getFullYear();
  const mes = agendaMesVisible.getMonth();
  label.textContent = MESES_LARGO[mes] + ' ' + anio;

  const hoy = ymd(new Date());
  const actividadesUnidad = AGENDAS.filter(a => a.unidadId === agendaUnidadSel);
  const conteoPorDia = {};
  actividadesUnidad.forEach(a => { conteoPorDia[a.fecha] = (conteoPorDia[a.fecha] || 0) + 1; });

  const primerDiaMes = new Date(anio, mes, 1);
  // Lunes=0 ... Domingo=6 (el sistema usa semana que empieza en lunes)
  const offset = (primerDiaMes.getDay() + 6) % 7;
  const inicioGrilla = new Date(anio, mes, 1 - offset);

  let html = '';
  for(let i = 0; i < 42; i++){
    const d = new Date(inicioGrilla.getFullYear(), inicioGrilla.getMonth(), inicioGrilla.getDate() + i);
    const fechaStr = ymd(d);
    const esDelMes = d.getMonth() === mes;
    const clases = ['agenda-cal-day'];
    if(!esDelMes) clases.push('is-fuera-mes');
    if(fechaStr === hoy) clases.push('is-hoy');
    if(fechaStr === agendaFechaSel) clases.push('is-seleccionado');
    const badge = conteoPorDia[fechaStr] ? '<span class="acd-badge">' + conteoPorDia[fechaStr] + '</span>' : '';
    html += '<div class="' + clases.join(' ') + '" data-fecha="' + fechaStr + '">' + d.getDate() + badge + '</div>';
  }
  grid.innerHTML = html;
}

function renderAgendaDiaLista(){
  const lista = document.getElementById('agenda-dia-lista');
  const titulo = document.getElementById('agenda-dia-titulo');
  if(!lista || !titulo) return;

  const unidad = DIRECCIONES.find(u => u.id === agendaUnidadSel);
  const fechaLegible = fmtDate(agendaFechaSel);
  titulo.textContent = 'Actividades del ' + fechaLegible + (unidad ? ' — ' + unidad.nombre : '');

  const items = AGENDAS
    .filter(a => a.unidadId === agendaUnidadSel && a.fecha === agendaFechaSel)
    .sort((a,b) => (a.creadoEn || '').localeCompare(b.creadoEn || ''));

  if(!items.length){
    lista.innerHTML = '<p class="agenda-dia-vacio">Todavía no hay nada planificado para este día.</p>';
    return;
  }

  lista.innerHTML = items.map(a =>
    '<div class="agenda-dia-item' + (a.estado === 'realizada' ? ' is-realizada' : '') + '">' +
      '<span class="adi-texto">' + escapeHtml(a.actividad) + '</span>' +
      '<div class="adi-acciones">' +
        '<button type="button" class="btn small" onclick="toggleAgendaEstado(' + a.id + ')">' + (a.estado === 'realizada' ? 'Marcar pendiente' : 'Marcar realizada') + '</button>' +
        '<button type="button" class="btn small" onclick="eliminarAgendaActividad(' + a.id + ')">Eliminar</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

async function toggleAgendaEstado(id){
  const a = AGENDAS.find(a => a.id === id);
  if(!a) return;
  a.estado = a.estado === 'realizada' ? 'pendiente' : 'realizada';
  await persist();
  renderAgenda();
}

async function eliminarAgendaActividad(id){
  if(!confirm('¿Eliminar esta actividad de la agenda?')) return;
  const idx = AGENDAS.findIndex(a => a.id === id);
  if(idx === -1) return;
  AGENDAS.splice(idx, 1);
  await persist();
  renderAgenda();
}

async function agregarDireccion(){
  const input = document.getElementById('agenda-nueva-direccion');
  const nombre = input.value.trim();
  if(!nombre) return;
  const nueva = {id: 'dir-' + Date.now(), nombre: nombre};
  DIRECCIONES.push(nueva);
  agendaUnidadSel = nueva.id;
  await persist();
  input.value = '';
  showToast('Dirección agregada');
  populateSelects();
  renderAgenda();
}

document.getElementById('agenda-unidad').addEventListener('change', (e) => {
  agendaUnidadSel = e.target.value;
  renderAgenda();
});

document.getElementById('agenda-agregar-direccion-btn').addEventListener('click', agregarDireccion);
document.getElementById('agenda-nueva-direccion').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); agregarDireccion(); }
});

document.getElementById('agenda-mes-prev').addEventListener('click', () => {
  agendaMesVisible = new Date(agendaMesVisible.getFullYear(), agendaMesVisible.getMonth() - 1, 1);
  renderAgendaCalendario();
});
document.getElementById('agenda-mes-next').addEventListener('click', () => {
  agendaMesVisible = new Date(agendaMesVisible.getFullYear(), agendaMesVisible.getMonth() + 1, 1);
  renderAgendaCalendario();
});

document.getElementById('agenda-cal-grid').addEventListener('click', (e) => {
  const celda = e.target.closest('.agenda-cal-day');
  if(!celda) return;
  agendaFechaSel = celda.dataset.fecha;
  // Si el día clicado es de otro mes, nos movemos a ese mes para que la grilla lo muestre centrado
  const [y, m] = agendaFechaSel.split('-').map(Number);
  if(y !== agendaMesVisible.getFullYear() || (m - 1) !== agendaMesVisible.getMonth()){
    agendaMesVisible = new Date(y, m - 1, 1);
  }
  renderAgendaCalendario();
  renderAgendaDiaLista();
});

document.getElementById('form-agenda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const actividad = document.getElementById('agenda-actividad').value.trim();
  if(!actividad || !agendaUnidadSel) return;
  AGENDAS.push({
    id: Date.now(),
    unidadId: agendaUnidadSel,
    fecha: agendaFechaSel,
    actividad: actividad,
    estado: 'pendiente',
    creadoEn: ahoraISO()
  });
  await persist();
  e.target.reset();
  showToast('Actividad agregada a la agenda');
  renderAgenda();
});

/* ============ LOGIN ============
   Autenticación real contra Firebase Auth (Email/Contraseña) — no hay clave
   fija escondida en el código. Las reglas de Firestore (ver firestore.rules)
   exigen una sesión válida, así que sin iniciar sesión aquí no hay acceso a
   los datos ni aunque alguien copie el código completo del sitio. */
let appDataCargada = false;

async function entrarAlSistema(){
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('login-error').style.display = 'none';
  if(appDataCargada) return;
  appDataCargada = true;
  await loadData();
  populateSelects();
  renderAgenda();
  initRealtimeSync();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const correo = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errorEl = document.getElementById('login-error');
  const btn = e.target.querySelector('.login-submit');
  errorEl.style.display = 'none';
  if(!firebaseAuthInstance){
    errorEl.textContent = 'No se pudo conectar con el sistema de acceso. Verifica tu conexión e intenta de nuevo.';
    errorEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  try{
    await firebaseAuthInstance.signInWithEmailAndPassword(correo, pass);
    // onAuthStateChanged (más abajo) se encarga de ocultar el overlay y cargar los datos.
  }catch(err){
    errorEl.textContent = 'Contraseña incorrecta.';
    errorEl.style.display = 'block';
  }finally{
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

function cerrarSesion(){
  if(unsubscribeRealtimeSync){ unsubscribeRealtimeSync(); unsubscribeRealtimeSync = null; }
  appDataCargada = false;
  if(firebaseAuthInstance) firebaseAuthInstance.signOut();
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
}

/* ============ INIT ============ */
(async function init(){
  const firebaseOk = await ensureFirebase();

  if(!firebaseOk || !firebaseAuthInstance){
    // Sin Firebase disponible no hay forma de autenticar de verdad — en vez de
    // reabrir un login falso, el sistema queda en modo solo-local sin pedir clave.
    document.getElementById('login-overlay').style.display = 'none';
    await entrarAlSistema();
    return;
  }

  firebaseAuthInstance.onAuthStateChanged((user) => {
    if(user){
      entrarAlSistema();
    } else {
      document.getElementById('login-overlay').style.display = 'flex';
    }
  });
})();
