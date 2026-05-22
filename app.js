const LS_KEY = "reservapro_v36_data";
let db = loadDB();
let publicBusinessId = null;
const API_URL = "http://localhost:3000";
let backendMode = true;

function loadDB(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {users:[], currentUserId:null};
    const data = JSON.parse(raw);
    if (!data.users) data.users = [];
    if (!("currentUserId" in data)) data.currentUserId = null;
    data.users = data.users.map(normalizeUser);
    return data;
  } catch(e) {
    return {users:[], currentUserId:null};
  }
}
function normalizeUser(u){
  return {
    id: u.id || uid(),
    email: u.email || "",
    pass: u.pass || "",
    businessName: u.businessName || "ReservaPro",
    slug: u.slug || slugify(u.businessName || "negocio"),
    desc: u.desc || "Panel profesional de reservas.",
    whatsapp: u.whatsapp || "",
    instagram: u.instagram || "",
    phone: u.phone || "",
    contactEmail: u.contactEmail || u.email || "",
    location: u.location || "",
    services: Array.isArray(u.services) ? u.services : [],
    slots: Array.isArray(u.slots) ? u.slots : [],
    reservations: Array.isArray(u.reservations) ? u.reservations : [],
    gallery: Array.isArray(u.gallery) ? u.gallery : []
  };
}
function saveDB(){ localStorage.setItem(LS_KEY, JSON.stringify(db)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function currentUser(){ return db.users.find(u => u.id === db.currentUserId) || null; }
function slugify(text){
  return (text || "negocio").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,30) || "negocio";
}
function normalizePhone(v){ return (v||"").replace(/[^\d]/g,""); }
function publicUrlFor(u){ return window.location.href.split("#")[0] + "#/" + u.slug; }
function activeReservations(u){ return (u.reservations || []).filter(r => r.status === "Pendiente" || r.status === "Confirmada"); }
function isSlotActiveReserved(u, slotId){ return activeReservations(u).some(r => r.slotId === slotId); }
function show(id){
  ["authView","dashboardView","publicView"].forEach(x=>document.getElementById(x).classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}
function renderSession(){
  const u = currentUser();
  document.getElementById("sessionLabel").textContent = u ? u.businessName : "Sin sesión";
  document.getElementById("logoutBtn").classList.toggle("hidden", !u);
}
function clientReservationKey(businessId){ return "reservapro_client_reservation_" + businessId; }
function findClientStoredReservation(u){
  const rid = localStorage.getItem(clientReservationKey(u.id));
  if(!rid) return null;
  return (u.reservations || []).find(r => r.id === rid) || null;
}
function reservationNotifyLinks(u,r){
  const slot=(u.slots||[]).find(s=>s.id===r.slotId);
  const line = `Hola ${r.clientName}, tu reserva en ${u.businessName} para ${r.serviceName} el ${slot?slot.date+" a las "+slot.time:"horario seleccionado"} está: ${r.status}.`;
  const phone=normalizePhone(r.clientPhone);
  const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(line)}` : "#";
  const mail = r.clientEmail ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(r.clientEmail)}&su=${encodeURIComponent("Estado de reserva")}&body=${encodeURIComponent(line)}` : "#";
  return {wa,mail};
}


async function apiRequest(path, options={}){
  const res = await fetch(API_URL + path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await res.json().catch(()=>({}));

  if(!res.ok){
    throw new Error(data.error || "Error del servidor.");
  }

  return data;
}

async function backendRegisterBusiness(businessName, email, pass){
  return apiRequest("/api/register", {
    method: "POST",
    body: JSON.stringify({
      businessName,
      email,
      password: pass
    })
  });
}

async function backendLoginBusiness(email, pass){
  return apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: pass
    })
  });
}

function upsertLocalBusinessFromBackend(business){
  if(!business || !business.id) return null;

  const normalized = normalizeUser({
    ...business,
    pass: business.pass || business.password || ""
  });

  const index = db.users.findIndex(u=>u.id===normalized.id);

  if(index >= 0){
    db.users[index] = {
      ...db.users[index],
      ...normalized
    };
  }else{
    db.users.push(normalized);
  }

  db.currentUserId = normalized.id;
  saveDB();

  return normalized;
}


async function backendSaveCurrentBusiness(){
  const u = currentUser();
  if(!u || !u.id) return;

  try{
    await apiRequest("/api/business/" + encodeURIComponent(u.id), {
      method: "PUT",
      body: JSON.stringify({ business: u })
    });
    return true;
  }catch(err){
    console.error("BACKEND_SAVE_ERROR", err);
    return false;
  }
}

async function saveDBAndBackend(){
  saveDB();
  await backendSaveCurrentBusiness();
}

function saveDBAndBackendSoon(){
  saveDB();
  setTimeout(()=>backendSaveCurrentBusiness(), 50);
}

document.getElementById("showLogin").onclick=()=>{
  document.getElementById("showLogin").classList.add("active");
  document.getElementById("showRegister").classList.remove("active");
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("registerBox").classList.add("hidden");
};
document.getElementById("showRegister").onclick=()=>{
  document.getElementById("showRegister").classList.add("active");
  document.getElementById("showLogin").classList.remove("active");
  document.getElementById("registerBox").classList.remove("hidden");
  document.getElementById("loginBox").classList.add("hidden");
};

document.getElementById("registerBtn").onclick=async ()=>{
  const businessName=document.getElementById("regBusiness").value.trim();
  const email=document.getElementById("regEmail").value.trim().toLowerCase();
  const pass=document.getElementById("regPass").value;

  if(!businessName||!email||!pass){
    alert("Completa los campos.");
    return;
  }

  try{
    const result = await backendRegisterBusiness(businessName, email, pass);
    const u = upsertLocalBusinessFromBackend({
      ...result.business,
      pass
    });

    alert("Cuenta creada en backend.");
    loadDashboard();
    return;
  }catch(err){
    alert("No se pudo crear en backend: " + err.message);
  }
};

document.getElementById("loginBtn").onclick=async ()=>{
  const email=document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass=document.getElementById("loginPass").value;

  try{
    const result = await backendLoginBusiness(email, pass);
    const u = upsertLocalBusinessFromBackend({
      ...result.business,
      pass
    });

    loadDashboard();
    return;
  }catch(err){
    // Si el backend no responde o la cuenta no existe en backend, intenta login local para no bloquear la app vieja.
    const localUser=db.users.find(x=>
      String(x.email||"").trim().toLowerCase()===email &&
      String(x.pass||"")===pass
    );

    if(localUser){
      db.currentUserId=localUser.id;
      saveDB();
      loadDashboard();
      return;
    }

    alert("Datos incorrectos o backend no disponible.");
  }
};
document.getElementById("logoutBtn").onclick=()=>{ db.currentUserId=null; saveDB(); renderSession(); show("authView"); };

function loadDashboard(){
  const u=currentUser(); if(!u) return show("authView");
  Object.assign(u, normalizeUser(u));
  document.getElementById("businessName").value=u.businessName;
  document.getElementById("businessDesc").value=u.desc;
  document.getElementById("businessWhatsapp").value=u.whatsapp;
  document.getElementById("businessInstagram").value=u.instagram;
  document.getElementById("businessPhone").value=u.phone;
  document.getElementById("businessEmail").value=u.contactEmail;
  document.getElementById("businessLocation").value=u.location;
  document.getElementById("businessSlug").value=u.slug;
  document.getElementById("publicLink").value=publicUrlFor(u);
  setupGalleryEvents(); renderServices(); renderGallery(); renderSlots(); renderCalendarVisual(); renderReservations(); renderSession(); setupBackupSimple();
    show("dashboardView");
}
document.getElementById("saveProfileBtn").onclick=()=>{
  const u=currentUser(); if(!u) return;
  u.businessName=document.getElementById("businessName").value.trim();
  u.desc=document.getElementById("businessDesc").value.trim();
  u.whatsapp=document.getElementById("businessWhatsapp").value.trim();
  u.instagram=document.getElementById("businessInstagram").value.trim();
  u.phone=document.getElementById("businessPhone").value.trim();
  u.contactEmail=document.getElementById("businessEmail").value.trim();
  u.location=document.getElementById("businessLocation").value.trim();
  saveDBAndBackendSoon(); loadDashboard();
};
document.getElementById("saveSlugBtn").onclick=()=>{
  const u=currentUser(); if(!u) return;
  let s=slugify(document.getElementById("businessSlug").value);
  if(db.users.some(x=>x.id!==u.id && x.slug===s)) return alert("Ese link ya está usado.");
  u.slug=s; saveDBAndBackendSoon(); loadDashboard();
};
document.getElementById("copyPublicBtn").onclick=()=>{
  const link=document.getElementById("publicLink").value;
  if(navigator.clipboard) navigator.clipboard.writeText(link);
  alert("Link copiado.");
};
document.getElementById("openPublicBtn").onclick=()=>{ const u=currentUser(); if(u) openPublic(u.slug); };
document.getElementById("backBtn").onclick=()=> currentUser()?loadDashboard():show("authView");

document.getElementById("addServiceBtn").onclick=()=>{
  const u=currentUser(); if(!u) return;
  const name=document.getElementById("serviceName").value.trim();
  const duration=document.getElementById("serviceDuration").value;
  if(!name) return alert("Escribe el nombre del servicio.");
  u.services.push({id:uid(),name,duration});
  document.getElementById("serviceName").value="";
  saveDBAndBackendSoon(); renderServices(); renderPublicIfOpen();
};

const IMG_DB_NAME = "reservapro_images_db";
const IMG_STORE = "images";

function openImageDB(){
  return new Promise((resolve, reject)=>{
    const request = indexedDB.open(IMG_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if(!db.objectStoreNames.contains(IMG_STORE)){
        db.createObjectStore(IMG_STORE, {keyPath:"id"});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveImageBlob(id, blob){
  const dbi = await openImageDB();
  return new Promise((resolve, reject)=>{
    const tx = dbi.transaction(IMG_STORE, "readwrite");
    tx.objectStore(IMG_STORE).put({id, blob});
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getImageBlob(id){
  const dbi = await openImageDB();
  return new Promise((resolve, reject)=>{
    const tx = dbi.transaction(IMG_STORE, "readonly");
    const req = tx.objectStore(IMG_STORE).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteImageBlob(id){
  const dbi = await openImageDB();
  return new Promise((resolve, reject)=>{
    const tx = dbi.transaction(IMG_STORE, "readwrite");
    tx.objectStore(IMG_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function galleryStatus(msg){
  const el = document.getElementById("galleryStatus");
  if(el) el.textContent = msg || "";
}

async function imageSrcFromItem(item){
  if(item.type === "url") return item.src;
  const blob = await getImageBlob(item.id);
  if(!blob) return "";
  return URL.createObjectURL(blob);
}

async function renderGallery(){
  const u = currentUser();
  const wrap = document.getElementById("galleryManager");
  if(!wrap || !u) return;

  if(!Array.isArray(u.gallery)) u.gallery = [];
  wrap.innerHTML = "";

  if(!u.gallery.length){
    wrap.innerHTML = '<p class="hint">No hay imágenes agregadas.</p>';
    return;
  }

  for(let index=0; index<u.gallery.length; index++){
    const itemData = u.gallery[index];
    const div = document.createElement("div");
    div.className = "gallery-item";

    const img = document.createElement("img");
    const src = await imageSrcFromItem(itemData);
    img.src = src || "";
    img.alt = "Imagen agregada";

    const del = document.createElement("button");
    del.className = "btn small danger";
    del.textContent = "Eliminar";
    del.onclick = async () => {
      const removed = u.gallery.splice(index,1)[0];
      if(removed && removed.type === "file") await deleteImageBlob(removed.id);
      saveDB();
      renderGallery();
      renderPublicIfOpen();
      galleryStatus("Imagen eliminada.");
    };

    div.appendChild(img);
    div.appendChild(del);
    wrap.appendChild(div);
  }
}

async function addGalleryFile(file){
  const u = currentUser();
  if(!u) return alert("Primero inicia sesión.");
  if(!Array.isArray(u.gallery)) u.gallery = [];

  const id = uid();
  galleryStatus("Guardando imagen...");
  try{
    await saveImageBlob(id, file);
    u.gallery.push({id, type:"file", name:file.name});
    saveDB();
    await renderGallery();
    renderPublicIfOpen();
    galleryStatus("Imagen agregada correctamente.");
  }catch(e){
    console.error(e);
    galleryStatus("No se pudo guardar la imagen.");
    alert("No se pudo guardar la imagen en el navegador.");
  }
}

function addGalleryUrl(url){
  const u = currentUser();
  if(!u) return alert("Primero inicia sesión.");
  if(!Array.isArray(u.gallery)) u.gallery = [];
  u.gallery.push({id:uid(), type:"url", src:url});
  saveDB();
  renderGallery();
  renderPublicIfOpen();
  galleryStatus("Imagen agregada por URL.");
}

function setupGalleryEvents(){
  const fileInput = document.getElementById("galleryFile");
  const urlBtn = document.getElementById("addGalleryUrlBtn");

  if(fileInput && !fileInput.dataset.ready){
    fileInput.dataset.ready = "1";
    fileInput.addEventListener("change", async function(){
      const file = this.files && this.files[0];
      if(!file) return;
      if(!file.type.startsWith("image/")){
        this.value = "";
        return alert("El archivo debe ser una imagen.");
      }
      await addGalleryFile(file);
      this.value = "";
    });
  }

  if(urlBtn && !urlBtn.dataset.ready){
    urlBtn.dataset.ready = "1";
    urlBtn.onclick = () => {
      const input = document.getElementById("galleryUrl");
      const url = input.value.trim();
      if(!url) return alert("Pega una URL de imagen.");
      addGalleryUrl(url);
      input.value = "";
    };
  }
}

async function renderPublicGallery(u){
  const wrap = document.getElementById("publicGalleryWrap");
  const grid = document.getElementById("publicGallery");
  if(!wrap || !grid) return;

  grid.innerHTML = "";
  if(!u.gallery || !u.gallery.length){
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");

  for(const itemData of u.gallery){
    const div = document.createElement("div");
    div.className = "gallery-item";
    const img = document.createElement("img");
    img.src = await imageSrcFromItem(itemData);
    img.alt = "Galería";
    div.appendChild(img);
    grid.appendChild(div);
  }
}


function renderServices(){
  const u=currentUser(), tb=document.getElementById("servicesTable"); tb.innerHTML="";
  (u.services||[]).forEach(s=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${s.name}</td><td>${s.duration}</td><td><button class="btn small danger">Eliminar</button></td>`;
    tr.querySelector("button").onclick=()=>{u.services=u.services.filter(x=>x.id!==s.id);saveDB();renderServices();renderPublicIfOpen();};
    tb.appendChild(tr);
  });
}

document.getElementById("addSlotBtn").onclick=()=>{
  const u=currentUser(); if(!u) return;
  const date=document.getElementById("slotDate").value, time=document.getElementById("slotTime").value;
  if(!date||!time) return alert("Selecciona fecha y hora.");
  if((u.slots||[]).some(s=>s.date===date&&s.time===time)) return alert("Ese horario ya existe.");
  u.slots.push({id:uid(),date,time}); saveDBAndBackendSoon(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();
};
function renderSlots(){
  const u=currentUser(), tb=document.getElementById("slotsTable"); tb.innerHTML="";
  (u.slots||[]).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).forEach(s=>{
    const active=isSlotActiveReserved(u,s.id);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${s.date}</td><td>${s.time}</td><td>${active?"Reservado":"Disponible"}</td><td><button class="btn small danger">Eliminar</button></td>`;
    tr.querySelector("button").onclick=()=>{ if(active) return alert("Este horario tiene una reserva activa."); u.slots=u.slots.filter(x=>x.id!==s.id); saveDBAndBackendSoon(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen(); };
    tb.appendChild(tr);
  });
}

function formatDateLabel(dateStr){
  const parts = dateStr.split("-");
  if(parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderCalendarVisual(){
  const u = currentUser();
  const wrap = document.getElementById("calendarVisual");
  if(!wrap || !u) return;

  const slots = Array.isArray(u.slots) ? [...u.slots] : [];
  const reservations = Array.isArray(u.reservations) ? u.reservations : [];

  wrap.innerHTML = "";

  if(!slots.length){
    wrap.innerHTML = '<p class="hint">No hay horarios agregados.</p>';
    return;
  }

  const grouped = {};
  slots.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).forEach(slot=>{
    if(!grouped[slot.date]) grouped[slot.date] = [];
    grouped[slot.date].push(slot);
  });

  Object.keys(grouped).sort().forEach(date=>{
    const dayBox = document.createElement("div");
    dayBox.className = "calendar-day";

    const title = document.createElement("h3");
    title.textContent = formatDateLabel(date);
    dayBox.appendChild(title);

    const slotsBox = document.createElement("div");
    slotsBox.className = "calendar-slots";

    grouped[date].forEach(slot=>{
      const activeReservation = reservations.find(r => r.slotId === slot.id && (r.status === "Pendiente" || r.status === "Confirmada"));
      const finishedReservation = reservations.find(r => r.slotId === slot.id && (r.status === "Completada" || r.status === "Cancelada"));

      const item = document.createElement("div");
      item.className = "calendar-slot";

      if(activeReservation){
        item.classList.add(activeReservation.status === "Confirmada" ? "slot-confirmed" : "slot-pending");
        item.innerHTML = `<strong>${slot.time}</strong><span>${activeReservation.status}</span><small>${activeReservation.clientName} - ${activeReservation.serviceName}</small>`;
      }else{
        item.classList.add("slot-free");
        item.innerHTML = `<strong>${slot.time}</strong><span>Disponible</span>${finishedReservation ? `<small>Último estado: ${finishedReservation.status}</small>` : ""}`;
      }

      slotsBox.appendChild(item);
    });

    dayBox.appendChild(slotsBox);
    wrap.appendChild(dayBox);
  });
}


function renderReservations(){
  const u=currentUser(), tb=document.getElementById("reservationsTable"), hist=document.getElementById("historyTable");
  tb.innerHTML=""; hist.innerHTML="";
  (u.reservations||[]).forEach(r=>{
    const slot=(u.slots||[]).find(s=>s.id===r.slotId);
    if(r.status==="Completada"||r.status==="Cancelada"){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${r.clientName}</td><td>${r.serviceName}</td><td>${slot?slot.date+" "+slot.time:"-"}</td><td class="status-${String(r.status).toLowerCase()}">${r.status}</td>`;
      hist.appendChild(tr); return;
    }
    const links=reservationNotifyLinks(u,r);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${r.clientName}</td><td>${r.clientPhone}</td><td>${r.serviceName}</td><td>${slot?slot.date+" "+slot.time:"-"}</td><td class="status-${String(r.status).toLowerCase()}">${r.status}</td>
      <td>
        <button class="btn small danger" data-a="cancel">Cancelar</button>
        <button class="btn small ok" data-a="confirm">Confirmar</button>
        <button class="btn small" data-a="complete">Completar</button>
        <a class="btn small" target="_blank" href="${links.wa}">Avisar WhatsApp</a>
        <a class="btn small" target="_blank" href="${links.mail}">Avisar correo</a>
      </td>`;
    tr.querySelector('[data-a="cancel"]').onclick=()=>{r.status="Cancelada"; saveDB(); renderReservations(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();};
    tr.querySelector('[data-a="confirm"]').onclick=()=>{r.status="Confirmada"; saveDB(); renderReservations(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();};
    tr.querySelector('[data-a="complete"]').onclick=()=>{r.status="Completada"; saveDB(); renderReservations(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();};
    tb.appendChild(tr);
  });
}

async function openPublic(slug){
  let u = db.users.find(x=>x.slug===slug);

  try{
    const result = await backendLoadBusinessBySlug(slug);
    if(result && result.business){
      u = normalizeUser(result.business);

      const index = db.users.findIndex(x=>x.id===u.id);
      if(index >= 0){
        db.users[index] = u;
      }else{
        db.users.push(u);
      }

      saveDB();
    }
  }catch(err){
    console.warn("No se pudo cargar desde backend, usando datos locales si existen.", err);
  }

  if(!u){
    alert("No se encontró ese perfil.");
    show("authView");
    return;
  }

  publicBusinessId=u.id;
  renderPublic(u);
  show("publicView");
}
function renderPublicIfOpen(){ if(publicBusinessId){ const u=db.users.find(x=>x.id===publicBusinessId); if(u) renderPublic(u); } }
function renderClientStatus(u){
  const box=document.getElementById("clientStatusBox"), content=document.getElementById("clientStatusContent");
  const r=findClientStoredReservation(u);
  if(!r){ box.classList.add("hidden"); content.innerHTML=""; return; }
  const slot=(u.slots||[]).find(s=>s.id===r.slotId);
  content.innerHTML=`<p><strong>Cliente:</strong> ${r.clientName}</p>
  <p><strong>Servicio:</strong> ${r.serviceName}</p>
  <p><strong>Horario:</strong> ${slot?slot.date+" "+slot.time:"-"}</p>
  <p><strong>Estado:</strong> <span class="status-${String(r.status).toLowerCase()}">${r.status}</span></p>
  <p class="hint">Este estado queda guardado en este navegador.</p>`;
  box.classList.remove("hidden");
}
async function renderPublic(u){
  document.getElementById("pubName").textContent=u.businessName || "ReservaPro";
  document.getElementById("pubDesc").textContent=u.desc || "Panel profesional de reservas.";
  document.getElementById("pubLocation").textContent=u.location || "";

  const wa=normalizePhone(u.whatsapp);
  const msg=encodeURIComponent("Hola, quiero recibir información sobre sus servicios.");
  document.getElementById("waBtn").href=wa?`https://wa.me/${wa}?text=${msg}`:"#";
  document.getElementById("igBtn").href=u.instagram?(u.instagram.startsWith("http")?u.instagram:`https://instagram.com/${u.instagram.replace("@","")}`):"#";
  document.getElementById("phoneBtn").href=u.phone?`tel:${u.phone}`:"#";
  const mailMsg=encodeURIComponent("Hola, me gustaría recibir más información sobre sus servicios.");
  document.getElementById("mailBtn").href=u.contactEmail?`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(u.contactEmail)}&su=${encodeURIComponent("Información de servicios")}&body=${mailMsg}`:"#";
  document.getElementById("mapBtn").href=u.location?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.location)}`:"#";

  const serviceSel=document.getElementById("clientService"); serviceSel.innerHTML="";
  if(!(u.services||[]).length){ let opt=document.createElement("option"); opt.value=""; opt.textContent="No hay servicios disponibles"; serviceSel.appendChild(opt); }
  (u.services||[]).forEach(s=>{ let opt=document.createElement("option"); opt.value=s.id; opt.textContent=`${s.name} (${s.duration})`; serviceSel.appendChild(opt); });

  const slotSel=document.getElementById("clientSlot"); slotSel.innerHTML="";
  const free=(u.slots||[]).filter(s=>!isSlotActiveReserved(u,s.id)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  if(!free.length){ let opt=document.createElement("option"); opt.value=""; opt.textContent="No hay horarios disponibles"; slotSel.appendChild(opt); }
  else free.forEach(s=>{ let opt=document.createElement("option"); opt.value=s.id; opt.textContent=`${s.date} ${s.time}`; slotSel.appendChild(opt); });

  await renderPublicGallery(u);
  document.getElementById("requestResult").classList.add("hidden");
  renderClientStatus(u);
}
document.getElementById("requestReservationBtn").onclick=async ()=>{
  const u=db.users.find(x=>x.id===publicBusinessId);
  if(!u) return;

  const clientName=document.getElementById("clientName").value.trim();
  const clientPhone=document.getElementById("clientPhone").value.trim();
  const clientEmail=document.getElementById("clientEmail") ? document.getElementById("clientEmail").value.trim() : "";
  const staffId=document.getElementById("clientStaff") ? document.getElementById("clientStaff").value : defaultStaffId(u);
  const serviceId=document.getElementById("clientService").value;
  const slotId=document.getElementById("clientSlot").value;

  if(!clientName || !clientPhone || !serviceId || !slotId){
    alert("Completa los datos de la reserva.");
    return;
  }

  if(isSlotActiveReserved(u,slotId)){
    alert("Ese horario ya fue reservado.");
    return;
  }

  const service=(u.services||[]).find(s=>s.id===serviceId);
  const reservation={
    id:uid(),
    clientName,
    clientPhone,
    clientEmail,
    staffId,
    serviceId,
    serviceName:service ? service.name : "Servicio",
    slotId,
    status:"Pendiente",
    createdAt:new Date().toISOString()
  };

  try{
    const result = await backendCreateReservation(u.id, reservation);

    if(result && result.business){
      const updated = normalizeUser(result.business);
      const index = db.users.findIndex(x=>x.id===updated.id);
      if(index >= 0){
        db.users[index] = updated;
      }else{
        db.users.push(updated);
      }
      saveDB();
      publicBusinessId = updated.id;
      localStorage.setItem(clientReservationKey(updated.id), reservation.id);
      renderPublic(updated);
    }else{
      u.reservations.push(reservation);
      saveDB();
      localStorage.setItem(clientReservationKey(u.id), reservation.id);
      renderPublic(u);
    }

    const resultBox=document.getElementById("requestResult");
    if(resultBox){
      resultBox.innerHTML="<strong>Solicitud enviada.</strong><br>Tu reserva quedó pendiente de confirmación.";
      resultBox.classList.remove("hidden");
    }

    alert("Reserva enviada.");
  }catch(err){
    console.error("BACKEND_RESERVATION_ERROR", err);

    // fallback local para no perder la solicitud si el backend falla
    u.reservations.push(reservation);
    saveDB();
    localStorage.setItem(clientReservationKey(u.id), reservation.id);
    renderPublic(u);

    const resultBox=document.getElementById("requestResult");
    if(resultBox){
      resultBox.innerHTML="<strong>Solicitud enviada localmente.</strong><br>El backend no respondió.";
      resultBox.classList.remove("hidden");
    }

    alert("Reserva guardada localmente. Revisa que npm start esté activo.");
  }
};

window.addEventListener("hashchange",()=>{
  const slug=location.hash.replace("#/","").trim();
  if(slug) openPublic(slug);
});

function setupBackupSimple(){
  const downloadBtn = document.getElementById("backupDownloadBtn");
  const uploadInput = document.getElementById("backupUploadInput");
  const status = document.getElementById("backupStatus");

  if(downloadBtn && !downloadBtn.dataset.ready){
    downloadBtn.dataset.ready = "1";

    downloadBtn.onclick = ()=>{
      const data = {
        app: "ReservaPro",
        version: "backup-simple",
        savedAt: new Date().toISOString(),
        db: db
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "reservapro-respaldo.json";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      if(status) status.textContent = "Respaldo guardado.";
    };
  }

  if(uploadInput && !uploadInput.dataset.ready){
    uploadInput.dataset.ready = "1";

    uploadInput.onchange = ()=>{
      const file = uploadInput.files && uploadInput.files[0];
      if(!file) return;

      const reader = new FileReader();

      reader.onload = ()=>{
        try{
          const parsed = JSON.parse(reader.result);
          const restored = parsed.db || parsed;

          if(!restored || !Array.isArray(restored.users)){
            alert("Ese archivo no parece un respaldo válido.");
            return;
          }

          if(!confirm("¿Cargar este respaldo? Se reemplazarán los datos actuales.")){
            uploadInput.value = "";
            return;
          }

          db = restored;
          saveDB();

          if(status) status.textContent = "Respaldo cargado correctamente.";

          if(currentUser()){
            loadDashboard();
          }else{
            renderSession();
            show("authView");
          }
        }catch(e){
          alert("No se pudo cargar el respaldo.");
        }

        uploadInput.value = "";
      };

      reader.readAsText(file);
    };
  }
}




async function backendCreateReservation(businessId, reservation){
  return apiRequest("/api/business/" + encodeURIComponent(businessId) + "/reservations", {
    method: "POST",
    body: JSON.stringify({ reservation })
  });
}

async function backendLoadBusinessBySlug(slug){
  return apiRequest("/api/business/" + encodeURIComponent(slug), {
    method: "GET"
  });
}


async function refreshCurrentBusinessFromBackend(){
  const u=currentUser();
  if(!u || !u.slug) return;

  try{
    const result = await backendLoadBusinessBySlug(u.slug);
    if(result && result.business){
      const updated = normalizeUser(result.business);
      const index = db.users.findIndex(x=>x.id===updated.id);
      if(index >= 0){
        db.users[index] = updated;
        db.currentUserId = updated.id;
        saveDB();
      }
    }
  }catch(err){
    console.warn("No se pudo actualizar desde backend.", err);
  }
}

function setupBackendSyncButton(){
  const btn = document.getElementById("syncBackendBtn");
  const status = document.getElementById("syncBackendStatus");

  if(!btn || btn.dataset.ready) return;

  btn.dataset.ready = "1";
  btn.onclick = async ()=>{
    if(status) status.textContent = "Guardando...";
    const ok = await backendSaveCurrentBusiness();
    if(status) status.textContent = ok ? "Datos guardados en backend." : "No se pudo guardar. Revisa que npm start esté activo.";
  };
}

(function init(){
  renderSession();
  const slug=location.hash.replace("#/","").trim();
  if(slug) openPublic(slug);
  else if(currentUser()) loadDashboard();
  else show("authView");
})();
