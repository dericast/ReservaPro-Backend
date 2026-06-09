const LS_KEY = "reservapro_v36_data";
let db = loadDB();
let publicBusinessId = null;
const API_URL = "https://reservapro-backend.onrender.com";
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
    businessLogo: u.businessLogo || "",
    workGallery: Array.isArray(u.workGallery) ? u.workGallery : [],
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
    staff: Array.isArray(u.staff) ? u.staff : [],
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
function normalizePhone(v){
  let phone = String(v || "").replace(/[^\d]/g,"");

  if(phone.length === 10 && /^(809|829|849)/.test(phone)){
    phone = "1" + phone;
  }

  return phone;
}
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
setTimeout(()=>location.reload(), 300);
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
setTimeout(()=>location.reload(), 300);
return;
    }

    alert("Datos incorrectos o backend no disponible.");
  }
};
document.getElementById("logoutBtn").onclick=()=>{
  localStorage.removeItem("staffSession");
  db.currentUserId = null;
  saveDB();
  renderSession();
  show("authView");
};

function loadDashboard(){
  const u=currentUser(); if(!u) return show("authView");
  Object.assign(u, normalizeUser(u));
  document.getElementById("businessName").value=u.businessName;
  document.getElementById("businessLogo").value = u.businessLogo || "";
renderBusinessLogoPreview();
document.getElementById("businessLogo").oninput=renderBusinessLogoPreview;
renderWorkGalleryPreview();
  document.getElementById("businessDesc").value=u.desc;
  document.getElementById("businessWhatsapp").value=u.whatsapp;
  document.getElementById("businessInstagram").value=u.instagram;
  document.getElementById("businessPhone").value=u.phone;
  document.getElementById("businessEmail").value=u.contactEmail;
  document.getElementById("businessLocation").value=u.location;
  document.getElementById("businessSlug").value=u.slug;
  document.getElementById("publicLink").value=publicUrlFor(u);
  ; renderServices(); renderSlots(); renderCalendarVisual(); renderReservations(); renderSession(); setupBackupSimple();
    show("dashboardView");
    setTimeout(()=>{
  try{
    const session = getStaffSession && getStaffSession();

    if(!session){
      setupPremiumCalendar();
    }
  }catch(e){}
},500);
}
document.getElementById("saveProfileBtn").onclick=()=>{
  const u=currentUser(); if(!u) return;
  u.businessName=document.getElementById("businessName").value.trim();
  u.businessLogo=document.getElementById("businessLogo").value.trim();
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
document.getElementById("openPublicBtn").onclick=()=>{
  const u=currentUser();
  if(!u) return;
  const targetHash = "#/" + u.slug;
  if(location.hash !== targetHash) location.hash = targetHash;
  openPublic(u.slug);
};
document.getElementById("backBtn").onclick=()=>{
  publicBusinessId = null;
  history.replaceState(null, "", location.pathname + location.search);
  currentUser()?loadDashboard():show("authView");
};

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
    tr.querySelector("button").onclick=()=>{
  u.services=u.services.filter(x=>x.id!==s.id);
  saveDBAndBackendSoon();
  renderServices();
  renderPublicIfOpen();
};
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

function formatReservaDate(dateStr){
  if(!dateStr) return "";
  const parts = dateStr.split("-");
  if(parts.length !== 3) return dateStr;
  return parts[2] + " de " + [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre"
  ][Number(parts[1]) - 1] + " de " + parts[0];
}

function formatReservaTime(timeStr){
  if(!timeStr) return "";
  const parts = timeStr.split(":");
  let h = Number(parts[0]);
  const m = parts[1] || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if(h === 0) h = 12;
  return h + ":" + m + " " + ampm;
}

function RP_notifyReservationClient(u, r, action, oldSlot, newSlot){
  if(!u || !r) return;

  const slot = newSlot || (u.slots || []).find(s => s.id === r.slotId);

  const fecha = slot ? formatReservaDate(slot.date) : "";
  const hora = slot ? formatReservaTime(slot.time) : "";

  let message = "";

  if(action === "Confirmada"){
    message = `🎉 ¡Hola, ${r.clientName}!

Tu cita en ${u.businessName} ha sido confirmada.

🗓️ Fecha: ${fecha}

⏰ Hora: ${hora}

Te esperamos. ¡Gracias por reservar con nosotros!`;
  }

  if(action === "Cancelada"){
    message = `Hola, ${r.clientName}.

Lamentamos informarte que tu cita en ${u.businessName}, programada para el ${fecha} a las ${hora}, ha sido cancelada.

Si lo deseas, puedes realizar una nueva reserva desde nuestro enlace de reservas.

Gracias por tu comprensión.`;
  }

  if(action === "Completada"){
    message = `✨ ¡Gracias por visitarnos, ${r.clientName}!

Tu cita en ${u.businessName} fue completada exitosamente.

Esperamos verte nuevamente muy pronto.

Gracias por confiar en nosotros.`;
  }

  if(action === "Reagendada"){
    const nuevaFecha = newSlot ? formatReservaDate(newSlot.date) : "";
    const nuevaHora = newSlot ? formatReservaTime(newSlot.time) : "";

    message = `📢 ¡Hola, ${r.clientName}!

Tu cita en ${u.businessName} ha sido reagendada.

🗓️ Nueva fecha: ${nuevaFecha}

⏰ Nueva hora: ${nuevaHora}

Gracias por tu comprensión. ¡Te esperamos!`;
  }

  const choice = prompt(
    "¿Cómo deseas avisar al cliente?\n\n1. WhatsApp\n2. Correo\n3. No avisar"
  );

  if(choice === "1"){
    const phone = normalizePhone(r.clientPhone);
    if(!phone) return alert("Este cliente no tiene teléfono.");
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank");
  }

  if(choice === "2"){
    const email = String(r.clientEmail || "").trim();
    if(!email) return alert("Este cliente no tiene correo.");
    window.open(
      "https://mail.google.com/mail/?view=cm&fs=1&to=" +
      encodeURIComponent(email) +
      "&su=" +
      encodeURIComponent("Estado de reserva") +
      "&body=" +
      encodeURIComponent(message),
      "_blank"
    );
  }
}


function renderReservations(){
  const u=currentUser(), tb=document.getElementById("reservationsTable"), hist=document.getElementById("historyTable");
  const staffSession = getStaffSession && getStaffSession();
const isStaffMode = staffSession && staffSession.role === "Staff";
  tb.innerHTML=""; hist.innerHTML="";
  (u.reservations||[]).forEach(r=>{
    const slot=(u.slots||[]).find(s=>s.id===r.slotId);
    if(r.status==="Completada"||r.status==="Cancelada"){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td data-label="Cliente">${r.clientName}</td><td data-label="Servicio">${r.serviceName}</td><td data-label="Horario">${slot?slot.date+" "+slot.time:"-"}</td><td data-label="Estado" class="status-${String(r.status).toLowerCase()}">${r.status}</td>`;
      hist.appendChild(tr); return;
    }
    const links=reservationNotifyLinks(u,r);
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td data-label="Cliente">${r.clientName}</td>
      <td data-label="Teléfono">${r.clientPhone}</td>
      <td data-label="Servicio">${r.serviceName}</td>
      <td data-label="Horario">${slot?slot.date+" "+slot.time:"-"}</td>
      <td data-label="Estado" class="status-${String(r.status).toLowerCase()}">${r.status}</td>
      <td data-label="Trabajador">
        <select class="reservationStaff" data-id="${r.id}" ${isStaffMode ? "disabled" : ""}>
          <option value="">Sin asignar</option>
          ${((currentUser().staff) || []).map(s=>`
            <option value="${s.name}" ${r.staff===s.name?'selected':''}>${s.name}</option>
          `).join("")}
        </select>
      </td>
      <td data-label="Acciones" class="reservationActions">
        <button class="btn small danger" data-a="cancel">Cancelar</button>
        <button class="btn small ok" data-a="confirm">Confirmar</button>
        <button class="btn small" data-a="complete">Completar</button>
        <button class="btn small" data-a="reschedule">Reagendar</button>
        <a class="btn small" target="_blank" href="${links.wa}">WhatsApp</a>
        <a class="btn small" target="_blank" href="${links.mail}">Correo</a>
      </td>`;
    tr.querySelector('[data-a="cancel"]').onclick=()=>{backendLoadBusinessBySlug(currentUser().slug).then(result=>{
  if(result && result.business){
    const updated=normalizeUser(result.business);
    const idx=db.users.findIndex(x=>x.id===updated.id);
    if(idx>=0) db.users[idx]=updated;

    const rr=db.users[idx].reservations.find(x=>x.id===r.id);
    if(rr){
      rr.status="Cancelada";
      saveDB();
      backendSaveCurrentBusiness();
      RP_notifyReservationClient(db.users[idx], rr, "Cancelada");
      renderReservations();
      renderPremiumCalendar();
    }
  }
});renderReservations(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();};
    tr.querySelector('[data-a="confirm"]').onclick=()=>{backendLoadBusinessBySlug(currentUser().slug).then(result=>{
  if(result && result.business){
    const updated=normalizeUser(result.business);
    const idx=db.users.findIndex(x=>x.id===updated.id);
    if(idx>=0) db.users[idx]=updated;

    const rr=db.users[idx].reservations.find(x=>x.id===r.id);
    if(rr){
      rr.status="Confirmada";
      saveDB();
      backendSaveCurrentBusiness();
      RP_notifyReservationClient(db.users[idx], rr, "Confirmada");
      renderReservations();
      renderPremiumCalendar();
    }
  }
});renderReservations(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();};
    tr.querySelector('[data-a="complete"]').onclick=()=>{backendLoadBusinessBySlug(currentUser().slug).then(result=>{
  if(result && result.business){
    const updated=normalizeUser(result.business);
    const idx=db.users.findIndex(x=>x.id===updated.id);
    if(idx>=0) db.users[idx]=updated;

    const rr=db.users[idx].reservations.find(x=>x.id===r.id);
    if(rr){
      rr.status="Completada";
      saveDB();
      backendSaveCurrentBusiness();
      RP_notifyReservationClient(db.users[idx], rr, "Completada");
      renderReservations();
      renderPremiumCalendar();
    }
  }
}); renderReservations(); renderSlots(); renderCalendarVisual(); renderPublicIfOpen();};
tr.querySelector('[data-a="reschedule"]').onclick=()=>{
  const u=currentUser();
  if(!u) return;

  const availableSlots=(u.slots||[]).filter(s=>{
    const reserved=(u.reservations||[]).some(rr=>
      rr.slotId===s.id &&
      rr.id!==r.id &&
      rr.status!=="Cancelada" &&
      rr.status!=="Completada"
    );

    if(reserved) return false;

    const dt=new Date(s.date+"T"+s.time);
    return dt>new Date();
  });

  if(!availableSlots.length){
    alert("No hay horarios disponibles para reagendar.");
    return;
  }

  let msg="Elige el número del nuevo horario:\n\n";

  availableSlots.forEach((s,i)=>{
    msg+=(i+1)+". "+s.date+" "+s.time+"\n";
  });

  const choice=prompt(msg);

  if(!choice) return;

  const index=parseInt(choice)-1;
  const selected=availableSlots[index];

  if(!selected){
    alert("Opción inválida.");
    return;
  }

  const oldSlot=(u.slots||[]).find(s=>s.id===r.slotId);

 r.slotId=selected.id;

saveDB();

try{
  backendSaveCurrentBusiness();
}catch(e){}

renderReservations();

alert("Cita reagendada correctamente.");

RP_notifyReservationClient(u,r,"Reagendada",oldSlot,selected);
};
const staffSelect = tr.querySelector(".reservationStaff");

if(staffSelect){
  staffSelect.onchange = ()=>{

    r.staff = staffSelect.value;
    r.staffId = staffSelect.value;

    saveDB();

    try{
      backendSaveCurrentBusiness();
    }catch(e){}
  };
}
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
  const logoBox=document.getElementById("publicBusinessLogo");
  const publicGallery=document.getElementById("publicWorkGallery");

if(publicGallery){
  publicGallery.innerHTML="";

  const imgs=Array.isArray(u.workGallery) ? u.workGallery : [];

  if(!imgs.length){
    publicGallery.classList.add("hidden");
  }else{
    publicGallery.classList.remove("hidden");

    imgs.forEach(img=>{
      const item=document.createElement("div");
      item.className="gallery-item";
      item.innerHTML=`<img src="${img}">`;
      publicGallery.appendChild(item);
    });
  }
}

if(logoBox){
  logoBox.innerHTML=u.businessLogo
    ? `<img src="${u.businessLogo}" style="width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid #ccc;">`
    : "";
}
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
  const requestBox = document.getElementById("requestResult");

const savedReservation =
  localStorage.getItem("lastClientReservation_" + u.id) ||
  localStorage.getItem(clientReservationKey(u.id));

if(requestBox && !savedReservation){
  requestBox.classList.add("hidden");
  requestBox.innerHTML = "";
}
  renderClientStatus(u);
}
document.getElementById("requestReservationBtn").onclick=async ()=>{
  const u=db.users.find(x=>x.id===publicBusinessId);
  if(!u) return;

  const clientName=document.getElementById("clientName").value.trim();
  const clientPhone=document.getElementById("clientPhone").value.trim();
  const clientEmail=document.getElementById("clientEmail") ? document.getElementById("clientEmail").value.trim() : "";
  const selectedStaff = document.getElementById("clientStaff") ? document.getElementById("clientStaff").value : "";
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
    staff: selectedStaff,
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

  const slug = location.hash.replace("#/","").trim();

  const staffSession = JSON.parse(
    localStorage.getItem("staffSession") || "null"
  );

  if(staffSession){
    db.currentUserId = staffSession.businessId;
    saveDB();
    loadDashboard();
    return;
  }

  if(slug){
    openPublic(slug);
  }
  else if(currentUser()){
    loadDashboard();
  }
  else{
    show("authView");
  }

})();

/* FIX BOTÓN "GUARDAR AHORA EN BACKEND"
   Pega este bloque AL FINAL de app.js.
   No toca link, login ni reservas.
*/

window.addEventListener("load", () => {
  setTimeout(() => {
    const btn =
      document.getElementById("syncBackendBtn") ||
      document.getElementById("backendSaveBtn") ||
      document.querySelector('button[data-action="save-backend"]');

    const status =
      document.getElementById("syncBackendStatus") ||
      document.getElementById("backendSaveStatus");

    if (!btn) {
      console.warn("No se encontró el botón Guardar ahora en backend.");
      return;
    }

    btn.onclick = async () => {
      try {
        if (status) status.textContent = "Guardando...";

        if (typeof backendSaveCurrentBusiness !== "function") {
          if (status) status.textContent = "Error: no existe backendSaveCurrentBusiness().";
          alert("No se encontró la función de guardar en backend.");
          return;
        }

        const ok = await backendSaveCurrentBusiness();

        if (status) {
          status.textContent = ok
            ? "Datos guardados en backend."
            : "No se pudo guardar. Revisa que el backend esté activo.";
        }

        alert(ok ? "Datos guardados en backend." : "No se pudo guardar en backend.");
      } catch (error) {
        console.error(error);
        if (status) status.textContent = "Error guardando en backend.";
        alert("Error guardando en backend.");
      }
    };
  }, 500);
});

/* FIX MÓVIL LIMPIO - VISTA PÚBLICA
   Pega este bloque AL FINAL de app.js.
   No oculta botones.
   No cambia login.
   No cambia link público.
*/

function RP_normalizePublicContactLinks(){
  const u = db.users.find(x => x.id === publicBusinessId);
  if(!u) return;

  const waBtn = document.getElementById("waBtn");
  const igBtn = document.getElementById("igBtn");
  const phoneBtn = document.getElementById("phoneBtn");
  const mailBtn = document.getElementById("mailBtn");
  const mapBtn = document.getElementById("mapBtn");

  const msg = encodeURIComponent("Hola, quiero información para solicitar una reserva.");
  const phoneClean = String(u.whatsapp || u.phone || "").replace(/[^\d]/g, "");

  if(waBtn){
    waBtn.href = phoneClean ? "https://wa.me/" + phoneClean + "?text=" + msg : "javascript:void(0)";
    waBtn.target = "_blank";
  }

  if(igBtn){
    let ig = String(u.instagram || "").trim();

    if(ig){
      ig = ig.replace("@", "");

      if(!ig.startsWith("http")){
        ig = "https://instagram.com/" + ig;
      }

      igBtn.href = ig;
      igBtn.target = "_blank";
    }else{
      igBtn.href = "javascript:void(0)";
    }
  }

  if(phoneBtn){
    const tel = String(u.phone || u.whatsapp || "").replace(/[^\d+]/g, "");
    phoneBtn.href = tel ? "tel:" + tel : "javascript:void(0)";
  }

  if(mailBtn){
    const email = String(u.contactEmail || u.email || "").trim();
    mailBtn.href = email
      ? "mailto:" + email + "?subject=" + encodeURIComponent("Solicitud de reserva") + "&body=" + msg
      : "javascript:void(0)";
  }

  if(mapBtn){
    const loc = String(u.location || "").trim();
    mapBtn.href = loc
      ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(loc)
      : "javascript:void(0)";
    mapBtn.target = "_blank";
  }
}

function RP_fixReserveButtonClick(){
  const btn = document.getElementById("requestReservationBtn");
  if(!btn) return;

  // Si el botón original ya está funcionando, esto no lo rompe.
  // Solo evita que en móvil se comporte como submit de formulario.
  btn.setAttribute("type", "button");

  btn.addEventListener("touchend", function(ev){
    ev.preventDefault();
    btn.click();
  }, {passive:false});
}

function RP_applyPublicMobileCleanFix(){
  setTimeout(()=>{
    RP_normalizePublicContactLinks();
    RP_fixReserveButtonClick();
  }, 300);
}

window.addEventListener("load", RP_applyPublicMobileCleanFix);
window.addEventListener("hashchange", RP_applyPublicMobileCleanFix);

// Cuando se abre/renderiza la vista pública, aplica el fix sin cambiar nada más.
document.addEventListener("click", ()=>{
  const publicView = document.getElementById("publicView");
  if(publicView && !publicView.classList.contains("hidden")){
    RP_applyPublicMobileCleanFix();
  }
});

/* FIX FINAL SOLICITAR RESERVA - UNA SOLA VEZ */
window.addEventListener("load", () => {
  setTimeout(() => {
    const oldBtn = document.getElementById("requestReservationBtn");
    if (!oldBtn) return;

    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    btn.type = "button";
    btn.dataset.sending = "0";

    btn.onclick = async function () {
      if (btn.dataset.sending === "1") return;
      btn.dataset.sending = "1";
      btn.disabled = true;

      const u = db.users.find(x => x.id === publicBusinessId);
      if (!u) {
        alert("No se encontró el negocio.");
        btn.dataset.sending = "0";
        btn.disabled = false;
        return;
      }

      const clientName = document.getElementById("clientName").value.trim();
      const clientPhone = document.getElementById("clientPhone").value.trim();
      if((u.blockedClients || []).includes(clientPhone)){
  alert("No puedes hacer reservas con este número.");
  return;
}
      const clientEmail = document.getElementById("clientEmail").value.trim();
      const serviceId = document.getElementById("clientService").value;
      const slotId = document.getElementById("clientSlot").value;

      if (!clientName || !clientPhone || !serviceId || !slotId) {
        alert("Completa los datos de la reserva.");
        btn.dataset.sending = "0";
        btn.disabled = false;
        return;
      }

      const service = (u.services || []).find(s => s.id === serviceId);

      const selectedStaff = document.getElementById("clientStaff")
  ? document.getElementById("clientStaff").value.trim()
  : "";

      const reservation = {
        id: uid(),
        clientName,
        clientPhone,
        clientEmail,
        staff: selectedStaff,
        staffId: selectedStaff,
        serviceId,
        serviceName: service ? service.name : "Servicio",
        slotId,
        status: "Pendiente",
        createdAt: new Date().toISOString()
      };

      try {
        if (typeof backendCreateReservation === "function") {
          const result = await backendCreateReservation(u.id, reservation);

          if (result && result.business) {
            const updated = normalizeUser(result.business);
            const index = db.users.findIndex(x => x.id === updated.id);
            if (index >= 0) db.users[index] = updated;
            else db.users.push(updated);
            publicBusinessId = updated.id;
            saveDB();
          }
        } else {
          u.reservations.push(reservation);
          saveDB();
        }

        localStorage.setItem("lastClientReservation_" + publicBusinessId, reservation.id);

        const box = document.getElementById("requestResult");
        if (box) {
          box.innerHTML = "<strong>Solicitud enviada.</strong><br>Tu reserva quedó pendiente de confirmación.";
          box.classList.remove("hidden");
        }

        alert("Reserva enviada.");
      } catch (e) {
        console.error(e);
        showRequestMessage("<strong>No se pudo enviar la reserva.</strong><br>Intenta otra vez o actualiza la página.");
        btn.dataset.sending = "0";
        btn.disabled = false;
      }
    };
  }, 500);
});



/* FIX SYNC RESERVAS BACKEND
   Pega este bloque AL FINAL de app.js.

   Arregla:
   1. Que el panel del dueño actualice reservas desde backend sin tener que ir a otra pestaña.
   2. Que el cliente vea si su reserva fue confirmada/cancelada/completada después de refresh.
   3. Hace actualización automática cada pocos segundos.
*/

function RP_findReservationInBusiness(business, reservationId){
  if(!business || !reservationId) return null;
  return (business.reservations || []).find(r => String(r.id) === String(reservationId)) || null;
}

function RP_currentPublicSlug(){
  const hash = window.location.hash || "";
  if(hash.startsWith("#/")) return hash.slice(2).trim();
  return "";
}

async function RP_refreshOwnerDashboardFromBackend(){
  const u = currentUser && currentUser();
  if(!u || !u.slug || typeof backendLoadBusinessBySlug !== "function") return;

  try{
    const result = await backendLoadBusinessBySlug(u.slug);
    if(!result || !result.business) return;

    const updated = normalizeUser(result.business);
    const index = db.users.findIndex(x => x.id === updated.id);

    if(index >= 0){
      db.users[index] = updated;
    }else{
      db.users.push(updated);
    }

    db.currentUserId = updated.id;
    saveDB();

    try{ renderServices(); }catch(e){}
    try{ renderReservations(); }catch(e){}
    try{ renderSlots(); }catch(e){}
    try{ renderCalendarVisual(); }catch(e){}
    try{ renderPremiumCalendar(); }catch(e){}
    try{ renderStatsDashboard(); }catch(e){}
    try{ renderPaymentsSummary(); }catch(e){}
  }catch(err){
    console.warn("No se pudo sincronizar panel desde backend.", err);
  }
}

async function RP_refreshPublicReservationStatus(){
  const slug = RP_currentPublicSlug();
  if(!slug || typeof backendLoadBusinessBySlug !== "function") return;

  try{
    const result = await backendLoadBusinessBySlug(slug);
    if(!result || !result.business) return;

    const updated = normalizeUser(result.business);
    const index = db.users.findIndex(x => x.id === updated.id);

    if(index >= 0){
      db.users[index] = updated;
    }else{
      db.users.push(updated);
    }

    publicBusinessId = updated.id;
    saveDB();

    const reservationId =
      localStorage.getItem("lastClientReservation_" + updated.id) ||
      localStorage.getItem(clientReservationKey(updated.id));

    // Siempre refresca la vista pública para actualizar horarios libres/ocupados en todos los dispositivos.
    await renderPublic(updated);

    const box = document.getElementById("requestResult");
    if(!box || !reservationId) return;

    const reservation = RP_findReservationInBusiness(updated, reservationId);
    if(!reservation) return;

    let text = "";

    if(reservation.status === "Confirmada"){
      text = "<strong>Reserva confirmada.</strong><br>Tu reserva fue confirmada por el negocio.";
    }else if(reservation.status === "Cancelada"){
      text = "<strong>Reserva cancelada.</strong><br>Tu reserva fue cancelada por el negocio.";
    }else if(reservation.status === "Completada"){
      text = "<strong>Reserva completada.</strong><br>Gracias por visitarnos.";
    }else{
      text = "<strong>Solicitud enviada.</strong><br>Tu reserva sigue pendiente de confirmación.";
    }

    setTimeout(()=>{
      const box2 = document.getElementById("requestResult");
      if(box2){
        box2.innerHTML = text;
        box2.classList.remove("hidden");
      }
    },100);

  }catch(err){
    console.warn("No se pudo actualizar estado público.", err);
  }
}

function RP_startBackendAutoSync(){
  if(window.RP_BACKEND_SYNC_STARTED) return;
  window.RP_BACKEND_SYNC_STARTED = true;

  setTimeout(()=>{
    const dashboard = document.getElementById("dashboardView");
    const publicView = document.getElementById("publicView");

    if(dashboard && !dashboard.classList.contains("hidden")){
      RP_refreshOwnerDashboardFromBackend();
    }

    if(publicView && !publicView.classList.contains("hidden")){
      const slug = location.hash.replace("#/","").trim();

if(publicView && !publicView.classList.contains("hidden") && slug){
  openPublic(slug);
}else{
  RP_refreshPublicReservationStatus();
}
    }
  }, 1000);

  setInterval(()=>{
    const dashboard = document.getElementById("dashboardView");
    const publicView = document.getElementById("publicView");

    if(dashboard && !dashboard.classList.contains("hidden")){
      RP_refreshOwnerDashboardFromBackend();
    }

    if(publicView && !publicView.classList.contains("hidden")){
      RP_refreshPublicReservationStatus();
    }
  }, 15000);
}

window.addEventListener("load", RP_startBackendAutoSync);
window.addEventListener("hashchange", ()=>{
  setTimeout(()=>{
    const slug = location.hash.replace("#/","").trim();

    if(slug){
      openPublic(slug);
    }else{
      publicBusinessId = null;
      show("authView");
    }
  }, 300);
});

/* FIX STATUS BACKEND SYNC
   Pega esto AL FINAL de app.js

   Guarda online:
   - Confirmada
   - Cancelada
   - Completada
*/

async function RP_saveReservationStatusOnline(reservationId, newStatus){
  const u = currentUser && currentUser();
  if(!u) return false;

  const reservation = (u.reservations || []).find(r => String(r.id) === String(reservationId));
  if(!reservation) return false;

  reservation.status = newStatus;
  saveDB();

  try{
    if(typeof backendSaveCurrentBusiness === "function"){
      await backendSaveCurrentBusiness();
    }

    return true;
  }catch(err){
    console.error("STATUS_BACKEND_SAVE_ERROR", err);
    return false;
  }
}

window.addEventListener("load", () => {
  setTimeout(() => {

    // CONFIRMAR
    document.querySelectorAll("[data-action='confirm-reservation']").forEach(btn => {
      btn.onclick = async function(){
        const id = btn.dataset.id || btn.getAttribute("data-id");
        if(!id) return;

        const ok = await RP_saveReservationStatusOnline(id, "Confirmada");

        if(ok){
          try{ renderReservations(); }catch(e){}
        }
      };
    });

    // COMPLETAR
    document.querySelectorAll("[data-action='complete-reservation']").forEach(btn => {
      btn.onclick = async function(){
        const id = btn.dataset.id || btn.getAttribute("data-id");
        if(!id) return;

        const ok = await RP_saveReservationStatusOnline(id, "Completada");

        if(ok){
          try{ renderReservations(); }catch(e){}
        }
      };
    });

    // CANCELAR
    document.querySelectorAll("[data-action='cancel-reservation']").forEach(btn => {
      btn.onclick = async function(){
        const id = btn.dataset.id || btn.getAttribute("data-id");
        if(!id) return;

        const ok = await RP_saveReservationStatusOnline(id, "Cancelada");

        if(ok){
          try{ renderReservations(); }catch(e){}
        }
      };
    });

  }, 1000);
});

function renderSimpleStats(){
  const u = currentUser && currentUser();
  if(!u) return;

  const reservations = u.reservations || [];

  const set = (id, value)=>{
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  };

  set("statTotal", reservations.length);
  set("statPending", reservations.filter(r=>r.status==="Pendiente").length);
  set("statConfirmed", reservations.filter(r=>r.status==="Confirmada").length);
  set("statCompleted", reservations.filter(r=>r.status==="Completada").length);
  set("statCancelled", reservations.filter(r=>r.status==="Cancelada").length);

  const serviceCount = {};
  reservations.forEach(r=>{
    const name = r.serviceName || "Servicio";
    serviceCount[name] = (serviceCount[name] || 0) + 1;
  });

  const topService = Object.entries(serviceCount).sort((a,b)=>b[1]-a[1])[0];
  set("statTopService", topService ? `${topService[0]} (${topService[1]})` : "-");

  const dayCount = {};
  reservations.forEach(r=>{
    const slot = (u.slots || []).find(s=>s.id===r.slotId);
    if(slot && slot.date){
      dayCount[slot.date] = (dayCount[slot.date] || 0) + 1;
    }
  });

  const topDay = Object.entries(dayCount).sort((a,b)=>b[1]-a[1])[0];
  set("statTopDay", topDay ? `${topDay[0]} (${topDay[1]})` : "-");
}

setInterval(()=>{
  try{ renderSimpleStats(); }catch(e){}
}, 3000);

function renderFrequentClients(){
  const u = currentUser && currentUser();
  const table = document.getElementById("frequentClientsTable");

  if(!u || !table) return;

  const map = {};

  (u.reservations || []).forEach(r=>{
    const key = (r.clientPhone || r.clientName || "").trim();

    if(!key) return;

    if(!map[key]){
      map[key] = {
        name: r.clientName || "-",
        phone: r.clientPhone || "-",
        count: 0,
        last: r.createdAt || "",
        notes: (u.clientNotes && u.clientNotes[r.clientPhone]) || "",
      };
    }

    map[key].count++;

    if(r.createdAt && r.createdAt > map[key].last){
      map[key].last = r.createdAt;
      map[key].name = r.clientName || map[key].name;
      map[key].phone = r.clientPhone || map[key].phone;
    }
  });

  const clients = Object.values(map).sort((a,b)=>b.count-a.count);

  table.innerHTML = "";

  if(!clients.length){
    table.innerHTML = '<tr><td colspan="7">No hay clientes todavía.</td></tr>';
    return;
  }

  clients.forEach(c=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.phone}</td>
      <td>${c.count}</td>
      <td>${c.count >= 3 ? "⭐ VIP" : "Normal"}</td>
      

<td>
  <input 
    placeholder="Notas..."
    value="${c.notes || ""}"
    onchange="saveClientNote('${c.phone}', this.value)"
  >
</td>

<td>${c.last ? new Date(c.last).toLocaleString() : "-"}</td>
<td>
  <button class="btn small danger" onclick="blockClient('${c.phone}')">
    Bloquear
  </button>
</td>
    `;
    table.appendChild(tr);
  });
}

setInterval(()=>{
  try{ renderFrequentClients(); }catch(e){}
}, 3000);

function setupReservationSearch(){
  const input = document.getElementById("reservationSearchInput");
  const table = document.getElementById("reservationsTable");

  if(!input || !table || input.dataset.ready === "1") return;

  input.dataset.ready = "1";

  input.addEventListener("input", ()=>{
    const q = input.value.toLowerCase().trim();

    table.querySelectorAll("tr").forEach(row=>{
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? "" : "none";
    });
  });
}

setInterval(()=>{
  try{ setupReservationSearch(); }catch(e){}
}, 1000);

let lastReservationCount = null;

function checkNewReservationsSound(){
  const u = currentUser && currentUser();
  if(!u) return;

  const total = (u.reservations || []).length;

  if(lastReservationCount === null){
  lastReservationCount = total;
  return;
}

  if(total > lastReservationCount){
    const audio = document.getElementById("reservationSound");

    if(audio){
      audio.play().catch(()=>{});
    }
  }

  lastReservationCount = total;
}

setInterval(()=>{
  try{
    checkNewReservationsSound();
  }catch(e){}
}, 3000);

function saveClientNote(phone, note){
  const u = currentUser && currentUser();
  if(!u) return;

  if(!u.clientNotes){
    u.clientNotes = {};
  }

  u.clientNotes[phone] = note;

  saveDB();

  try{
    backendSaveCurrentBusiness();
  }catch(e){}
}

function renderTodayAppointments(){
  const u = currentUser && currentUser();
  if(!u) return;

  const today = new Date().toISOString().slice(0,10);

  const todayReservations = (u.reservations || []).filter(r=>{
    const slot = (u.slots || []).find(s=>s.id === r.slotId);
    return slot && slot.date === today;
  });

  const set = (id,value)=>{
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  };

  set("todayTotal", todayReservations.length);
  set("todayPending", todayReservations.filter(r=>r.status==="Pendiente").length);
  set("todayConfirmed", todayReservations.filter(r=>r.status==="Confirmada").length);
  set("todayCompleted", todayReservations.filter(r=>r.status==="Completada").length);
}

setInterval(()=>{
  try{ renderTodayAppointments(); }catch(e){}
},3000);

function blockClient(phone){
  const u = currentUser && currentUser();
  if(!u) return;

  if(!confirm("¿Bloquear este cliente? No podrá hacer reservas con este teléfono.")) return;

  u.blockedClients = u.blockedClients || [];
  if(!u.blockedClients.includes(phone)){
    u.blockedClients.push(phone);
  }

  saveDB();

  try{
    backendSaveCurrentBusiness();
  }catch(e){}

  alert("Cliente bloqueado.");
}

function renderAppointmentReminders(){
  const u = currentUser && currentUser();
  const box = document.getElementById("appointmentRemindersBox");

  if(!u || !box) return;

  const now = new Date();

  const upcoming = (u.reservations || []).filter(r=>{
    if(r.status === "Cancelada" || r.status === "Completada") return false;

    const slot = (u.slots || []).find(s=>s.id === r.slotId);
    if(!slot || !slot.date || !slot.time) return false;

    const dt = new Date(slot.date + "T" + slot.time);
    return dt > now;
  });

  upcoming.sort((a,b)=>{
    const sa = (u.slots || []).find(s=>s.id === a.slotId);
    const sb = (u.slots || []).find(s=>s.id === b.slotId);
    return new Date(sa.date + "T" + sa.time) - new Date(sb.date + "T" + sb.time);
  });

  box.innerHTML = "";

  if(!upcoming.length){
    box.innerHTML = '<p class="hint">No hay citas próximas para recordar.</p>';
    return;
  }

  upcoming.slice(0,10).forEach(r=>{
    const slot = (u.slots || []).find(s=>s.id === r.slotId);
    const businessName = u.businessName || u.name || "el negocio";
    const clientName = r.clientName || "cliente";
    const serviceName = r.serviceName || "servicio";
    const date = slot ? slot.date : "";
    const time = slot ? slot.time : "";

    const message = `Hola ${clientName} 👋

Te recordamos que tienes una cita en ${businessName} para ${serviceName} el ${date} a las ${time}.

¡Te esperamos!`;

    const phone = String(r.clientPhone || "").replace(/[^\d]/g,"");
    const email = String(r.clientEmail || "").trim();

    const waLink = phone
      ? "https://wa.me/" + phone + "?text=" + encodeURIComponent(message)
      : "javascript:void(0)";

    const mailLink = email
  ? "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(email) + "&su=" + encodeURIComponent("Recordatorio de cita") + "&body=" + encodeURIComponent(message)
  : "javascript:void(0)";

    const div = document.createElement("div");
    div.className = "reminder-card";
    div.innerHTML = `
      <strong>${clientName}</strong> - ${serviceName}<br>
      <span>${date} ${time}</span><br><br>
      <a class="btn small" target="_blank" href="${waLink}">Recordar WhatsApp</a>
      <a class="btn small" target="_blank" href="${mailLink}">Recordar correo</a>
    `;

    box.appendChild(div);
  });
}

setInterval(()=>{
  try{ renderAppointmentReminders(); }catch(e){}
},3000);

let premiumCalendarDate = new Date();
let selectedPremiumCalendarDate = "";

function renderPremiumCalendar(){
  const u = currentUser && currentUser();
  const grid = document.getElementById("premiumCalendarGrid");
  const title = document.getElementById("premiumCalendarTitle");
  const details = document.getElementById("premiumCalendarDetails");

  if(!u || !grid || !title) return;

  const year = premiumCalendarDate.getFullYear();
  const month = premiumCalendarDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekDay = firstDay.getDay();

  title.textContent = firstDay.toLocaleDateString("es-DO", {
    month: "long",
    year: "numeric"
  });

  grid.innerHTML = "";

  const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  weekDays.forEach(d=>{
    const div = document.createElement("div");
    div.className = "premium-calendar-weekday";
    div.textContent = d;
    grid.appendChild(div);
  });

  for(let i=0;i<startWeekDay;i++){
    const empty = document.createElement("div");
    empty.className = "premium-calendar-day empty";
    grid.appendChild(empty);
  }

  for(let day=1; day<=lastDay.getDate(); day++){
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dayReservations = (u.reservations || []).filter(r=>{
      const slot = (u.slots || []).find(s=>s.id === r.slotId);
      return slot && slot.date === dateStr;
    });

    const div = document.createElement("div");
    div.className = "premium-calendar-day";

    const today = new Date().toISOString().slice(0,10);
    if(dateStr === today){
      div.classList.add("today");
    }
    if(dateStr === selectedPremiumCalendarDate){
  div.classList.add("selected-day");
}

    div.innerHTML = `
      <strong>${day}</strong>
      <small>${dayReservations.length} cita${dayReservations.length === 1 ? "" : "s"}</small>
      <div class="calendar-dots">
        ${dayReservations.map(r=>{
          let cls = "dot-pending";
          if(r.status === "Confirmada") cls = "dot-confirmed";
          if(r.status === "Completada") cls = "dot-completed";
          if(r.status === "Cancelada") cls = "dot-cancelled";
          return `<span class="${cls}"></span>`;
        }).join("")}
      </div>
    `;

    div.onclick = ()=>{
    selectedPremiumCalendarDate = dateStr;
renderPremiumCalendar();
      
      if(!details) return;

      if(!dayReservations.length){
        details.innerHTML = `<h3>${dateStr}</h3><p class="hint">No hay citas para este día.</p>`;
        return;
      }

      details.innerHTML = `
        <h3>Citas del ${dateStr}</h3>
        ${dayReservations.map(r=>{
          const slot = (u.slots || []).find(s=>s.id === r.slotId);
          return `
            <div class="premium-calendar-appointment">
              <strong>${slot ? slot.time : ""}</strong> - ${r.clientName || "Cliente"}<br>
              <span>${r.serviceName || "Servicio"} · ${r.status || "Pendiente"}</span><br>
<small>Atiende: ${r.staff || "Sin asignar"}</small>
            </div>
          `;
        }).join("")}
      `;
    };

    grid.appendChild(div);
  }
}

function setupPremiumCalendar(){
  const prev = document.getElementById("prevCalendarMonth");
  const next = document.getElementById("nextCalendarMonth");

  if(prev && prev.dataset.ready !== "1"){
    prev.dataset.ready = "1";
    prev.onclick = ()=>{
      premiumCalendarDate.setMonth(premiumCalendarDate.getMonth() - 1);
      renderPremiumCalendar();
    };
  }

  if(next && next.dataset.ready !== "1"){
    next.dataset.ready = "1";
    next.onclick = ()=>{
      premiumCalendarDate.setMonth(premiumCalendarDate.getMonth() + 1);
      renderPremiumCalendar();
    };
  }

  renderPremiumCalendar();
}

setTimeout(()=>{
  try{
    setupPremiumCalendar();
  }catch(e){}
},500);

function renderClientProfile(){
  const u = currentUser && currentUser();
  const select = document.getElementById("clientProfileSelect");
  const box = document.getElementById("clientProfileBox");

  if(!u || !select || !box) return;

  const map = {};

  (u.reservations || []).forEach(r=>{
    const key = (r.clientPhone || r.clientName || "").trim();
    if(!key) return;

    if(!map[key]){
      map[key] = {
        name: r.clientName || "-",
        phone: r.clientPhone || "-",
        email: r.clientEmail || "-",
        count: 0,
        last: r.createdAt || "",
        notes: (u.clientNotes && u.clientNotes[r.clientPhone]) || "",
        completed: 0,
        cancelled: 0,
        pending: 0,
        confirmed: 0
      };
    }

    map[key].count++;

    if(r.status === "Completada") map[key].completed++;
    if(r.status === "Cancelada") map[key].cancelled++;
    if(r.status === "Pendiente") map[key].pending++;
    if(r.status === "Confirmada") map[key].confirmed++;

    if(r.createdAt && r.createdAt > map[key].last){
      map[key].last = r.createdAt;
      map[key].name = r.clientName || map[key].name;
      map[key].phone = r.clientPhone || map[key].phone;
      map[key].email = r.clientEmail || map[key].email;
    }
  });

  const clients = Object.values(map).sort((a,b)=>b.count-a.count);

  const currentValue = select.value;

  select.innerHTML = '<option value="">Seleccionar cliente</option>';

  clients.forEach(c=>{
    const option = document.createElement("option");
    option.value = c.phone;
    option.textContent = `${c.name} - ${c.phone}`;
    select.appendChild(option);
  });

  if(currentValue){
    select.value = currentValue;
  }

  const selected = clients.find(c=>c.phone === select.value);

  if(!selected){
    box.innerHTML = "Selecciona un cliente para ver su perfil.";
    return;
  }

  box.innerHTML = `
    <h3>${selected.name}</h3>
    <p><strong>Teléfono:</strong> ${selected.phone}</p>
    <p><strong>Correo:</strong> ${selected.email}</p>
    <p><strong>Total reservas:</strong> ${selected.count}</p>
    <p><strong>Estado:</strong> ${selected.count >= 3 ? "⭐ VIP" : "Normal"}</p>
    <p><strong>Pendientes:</strong> ${selected.pending}</p>
    <p><strong>Confirmadas:</strong> ${selected.confirmed}</p>
    <p><strong>Completadas:</strong> ${selected.completed}</p>
    <p><strong>Canceladas:</strong> ${selected.cancelled}</p>
    <p><strong>Última reserva:</strong> ${selected.last ? new Date(selected.last).toLocaleString() : "-"}</p>
    <p><strong>Notas:</strong> ${selected.notes || "Sin notas"}</p>
  `;
}

setInterval(()=>{
  try{ renderClientProfile(); }catch(e){}
},3000);

function renderStaff(){
  const u = currentUser && currentUser();
  const table = document.getElementById("staffTable");

  if(!u || !table) return;

  u.staff = u.staff || [];

  table.innerHTML = "";

  if(!u.staff.length){
    table.innerHTML = '<tr><td colspan="4">No hay trabajadores agregados.</td></tr>';
    return;
  }

  u.staff.forEach((s,index)=>{
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.email || "-"}</td>
      <td>${s.role}</td>
      <td>
        <button class="btn small danger" onclick="deleteStaff(${index})">Eliminar</button>
      </td>
    `;

    table.appendChild(tr);
  });
}

function setupStaff(){
  const btn = document.getElementById("addStaffBtn");
  const nameInput = document.getElementById("staffNameInput");
  const roleInput = document.getElementById("staffRoleInput");
  const emailInput = document.getElementById("staffEmailInput");
  const passwordInput = document.getElementById("staffPasswordInput");

  if(!btn || !nameInput || !roleInput || btn.dataset.ready === "1") return;

  btn.dataset.ready = "1";

  btn.onclick = async ()=>{
    const u = currentUser && currentUser();
    if(!u) return;

    const name = nameInput.value.trim();
    const role = roleInput.value;
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if(!name){
      alert("Escribe el nombre del trabajador.");
      return;
    }
    if(!email || !password){
  alert("Escribe correo y contraseña del trabajador.");
  return;
}

    u.staff = u.staff || [];

    u.staff.push({
  id: uid(),
  name,
  email,
  password,
  role,
  createdAt: new Date().toISOString()
});

    saveDB();
    try{ await backendSaveCurrentBusiness(); }catch(e){}

    localStorage.setItem("reservapro_staff_login_cache", JSON.stringify(db.users.map(u=>({
  businessId: u.id,
  businessName: u.businessName,
  slug: u.slug,
  staff: u.staff || []
}))));

    try{
      backendSaveCurrentBusiness();
    }catch(e){}

    setTimeout(()=>{
  try{
    backendSaveCurrentBusiness();
  }catch(e){}
},500);

    nameInput.value = "";
    emailInput.value = "";
    passwordInput.value = "";
    renderStaff();

    alert("Trabajador agregado.");
  };
}

function deleteStaff(index){
  const u = currentUser && currentUser();
  if(!u || !u.staff) return;

  if(!confirm("¿Eliminar este trabajador?")) return;

  u.staff.splice(index,1);

  saveDB();

  try{
    backendSaveCurrentBusiness();
  }catch(e){}

  renderStaff();
}

setInterval(()=>{
  try{
    setupStaff();
    renderStaff();
  }catch(e){}
},1000);

function setupStaffFilter(){
  const u = currentUser && currentUser();
  const select = document.getElementById("staffFilter");
  const table = document.getElementById("reservationsTable");

  if(!u || !select || !table) return;

  const currentValue = select.value;

  select.innerHTML = '<option value="">Todos los trabajadores</option>';

  (u.staff || []).forEach(s=>{
    const option = document.createElement("option");
    option.value = s.name;
    option.textContent = s.name;
    select.appendChild(option);
  });

  select.value = currentValue;

  table.querySelectorAll("tr").forEach(row=>{
    const selected = select.value;

    if(!selected){
      row.style.display = "";
      return;
    }

    row.style.display = row.textContent.includes(selected) ? "" : "none";
  });
}

setInterval(()=>{
  try{ setupStaffFilter(); }catch(e){}
},1000);

function setupStaffFilter(){
  const select = document.getElementById("staffFilter");
  const table = document.getElementById("reservationsTable");
  const u = currentUser && currentUser();

  if(!select || !table || !u) return;

  const selected = select.value;

  select.innerHTML = '<option value="">Todos los trabajadores</option>';

  (u.staff || []).forEach(s=>{
    const option = document.createElement("option");
    option.value = s.name;
    option.textContent = s.name;
    select.appendChild(option);
  });

  select.value = selected;

  table.querySelectorAll("tr").forEach(row=>{
    const staffSelect = row.querySelector(".reservationStaff");

    if(!selected){
      row.style.display = "";
      return;
    }

    if(staffSelect && staffSelect.value === selected){
      row.style.display = "";
    }else{
      row.style.display = "none";
    }
  });
}

setInterval(()=>{
  try{
    setupStaffFilter();
  }catch(e){}
},1000);

function renderStaffStats(){
  const box = document.getElementById("staffStatsTable");
  const u = currentUser && currentUser();

  if(!box || !u) return;

  box.innerHTML = "";

  (u.staff || []).forEach(staff => {

    const reservations = (u.reservations || []).filter(r =>
      r.staff === staff.name
    );

    const pending = reservations.filter(r => r.status === "Pendiente").length;
    const confirmed = reservations.filter(r => r.status === "Confirmada").length;
    const completed = reservations.filter(r => r.status === "Completada").length;
    const cancelled = reservations.filter(r => r.status === "Cancelada").length;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${staff.name}</td>
      <td>${reservations.length}</td>
      <td>${pending}</td>
      <td>${confirmed}</td>
      <td>${completed}</td>
      <td>${cancelled}</td>
    `;

    box.appendChild(tr);
  });
}

setInterval(()=>{
  try{
    renderStaffStats();
  }catch(e){}
},1000);

function applyRolePermissions(){
  const select = document.getElementById("currentRoleSelect");
  if(!select) return;

  const savedRole = localStorage.getItem("currentRole") || "Admin";

  if(!select.dataset.ready){
    select.value = savedRole;
    select.dataset.ready = "1";

    select.onchange = ()=>{
      localStorage.setItem("currentRole", select.value);
      applyRolePermissions();
    };
  }

  const role = select.value || "Admin";

  document.querySelectorAll(".panel").forEach(panel=>{
    panel.style.display = "";
  });

 if(role === "Staff"){
  // NO ocultamos "Staff / Trabajadores" para no esconder Modo de acceso
  hidePanelByTitle("Estadísticas por trabajador");
  hidePanelByTitle("Backend / Guardado online");
  hidePanelByTitle("Respaldo de datos");
}

  if(role === "Recepción"){
    hidePanelByTitle("Backend / Guardado online");
    hidePanelByTitle("Respaldo de datos");
    hidePanelByTitle("Estadísticas por trabajador");
  }
}

function hidePanelByTitle(title){
  document.querySelectorAll(".panel").forEach(panel=>{
    const h2 = panel.querySelector("h2");
    if(h2 && h2.textContent.trim() === title){
      panel.style.display = "none";
    }
  });
}

setTimeout(()=>{
  try{
    applyRolePermissions();
  }catch(e){}
},1000);

function setupStaffLogin(){
  const btn = document.getElementById("staffLoginBtn");
  const emailInput = document.getElementById("staffLoginEmail");
  const passInput = document.getElementById("staffLoginPassword");

  if(!btn || !emailInput || !passInput || btn.dataset.ready === "1") return;

  btn.dataset.ready = "1";

  btn.onclick = async ()=>{
    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value.trim();

    try{
  const result = await apiRequest("/api/staff-login",{
    method:"POST",
    body:JSON.stringify({
      email,
      password
    })
  });

  if(result && result.business && result.staff){

    upsertLocalBusinessFromBackend(result.business);

    localStorage.setItem("staffSession",JSON.stringify({
      businessId: result.business.id,
      name: result.staff.name,
      email: result.staff.email,
      role: result.staff.role || "Staff"
    }));

    alert("Bienvenido " + result.staff.name);

    location.reload();
    return;
  }

}catch(e){}

    if(!email || !password){
      alert("Escribe correo y contraseña.");
      return;
    }

    let foundBusiness = null;
    let foundStaff = null;

    let usersToSearch = db.users || [];

if(!usersToSearch.length){
  try{
    const cache = JSON.parse(localStorage.getItem("reservapro_staff_login_cache") || "[]");
    usersToSearch = cache.map(x=>({
      id: x.businessId,
      businessName: x.businessName,
      slug: x.slug,
      staff: x.staff || []
    }));
  }catch(e){}
}

    usersToSearch.forEach(u=>{
      (u.staff || []).forEach(s=>{
        if(
          String(s.email || "").toLowerCase() === email &&
          String(s.password || "") === password
        ){
          foundBusiness = u;
          foundStaff = s;
        }
      });
    });
console.log("EMAIL ESCRITO:", email);
console.log("STAFF EN DB:", db.users.map(u=>u.staff));
console.log("FOUND BUSINESS:", foundBusiness);
console.log("FOUND STAFF:", foundStaff);


    if(!foundBusiness || !foundStaff){
      alert("Empleado no encontrado o contraseña incorrecta.");
      return;
    }

    db.currentUserId = foundBusiness.id;

    try{
  localStorage.setItem("staffSession", JSON.stringify({
    businessId: foundBusiness.id,
    staffId: foundStaff.id,
    name: foundStaff.name,
    email: foundStaff.email,
    role: foundStaff.role
  }));
}catch(e){
  console.warn("No se pudo guardar staffSession");
}

    localStorage.setItem("currentRole", foundStaff.role);

    saveDB();
alert("Bienvenido " + foundStaff.name);
location.reload();
  };
}

function getStaffSession(){
  try{
    return JSON.parse(localStorage.getItem("staffSession") || "null");
  }catch(e){
    return null;
  }
}

function applyStaffRealView(){
return;
}

setInterval(()=>{
  try{
    setupStaffLogin();
    applyStaffRealView();
  }catch(e){}
},1000);

function logoutStaffSession(){
  localStorage.removeItem("staffSession");
  localStorage.setItem("currentRole","Admin");

  db.currentUserId = null;
  saveDB();

  location.reload();
}

function devLocalAccess(){
  const params = new URLSearchParams(location.search);

  if(params.get("dev") !== "1") return;
  if(!db.users || !db.users.length) return;

  db.currentUserId = db.users[0].id;
  localStorage.setItem("currentRole","Admin");
  localStorage.removeItem("staffSession");
  saveDB();

  try{ show("dashboardView"); }catch(e){}
  try{ show("dashboard"); }catch(e){}

  try{ renderAll && renderAll(); }catch(e){}
  try{ renderReservations && renderReservations(); }catch(e){}
  try{ renderPremiumCalendar && renderPremiumCalendar(); }catch(e){}
}

// devLocalAccess();

function enforceRealStaffSession(){
  const session = getStaffSession && getStaffSession();
  if(!session) return;

  const roleSelect = document.getElementById("currentRoleSelect");

  if(roleSelect){
    roleSelect.value = session.role;
    roleSelect.disabled = true;
  }

  localStorage.setItem("currentRole", session.role);

  if(session.role === "Staff"){
    const filter = document.getElementById("staffFilter");
    if(filter){
      filter.value = session.name;
      filter.disabled = true;
    }

    document.querySelectorAll(".reservationStaff").forEach(sel=>{
      const row = sel.closest("tr");

    

      sel.disabled = true;
    });
  }
}

setTimeout(()=>{
  try{
    enforceRealStaffSession();
  }catch(e){}
},1000);

function applyRoleButtonPermissions(){
  const session = getStaffSession && getStaffSession();
  const role = session ? session.role : (localStorage.getItem("currentRole") || "Admin");

  document.querySelectorAll('[data-a="cancel"]').forEach(btn=>{
  btn.style.display = "";
});

  document.querySelectorAll('[data-a="reschedule"]').forEach(btn=>{
  if(role === "Staff"){
    btn.style.visibility = "hidden";
    btn.disabled = true;
  }else{
    btn.style.visibility = "";
    btn.disabled = false;
  }
});

  document.querySelectorAll(".reservationStaff").forEach(sel=>{
    if(role === "Staff"){
      sel.disabled = true;
    }
  });
}


function applyReceptionPermissions(){
  const session = getStaffSession && getStaffSession();
  const role = session ? session.role : (localStorage.getItem("currentRole") || "Admin");

  if(role !== "Recepción") return;

  hidePanelByTitle("Staff / Trabajadores");
  hidePanelByTitle("Estadísticas por trabajador");
  hidePanelByTitle("Backend / Guardado online");
  hidePanelByTitle("Respaldo de datos");

}

setTimeout(()=>{
  try{
    applyReceptionPermissions();
  }catch(e){}
},1000);

function hideStaffForbiddenPanels(){
  const session = getStaffSession && getStaffSession();
  const role = session ? session.role : (localStorage.getItem("currentRole") || "Admin");

  if(role !== "Staff") return;

  const blockedTitles = [
    "Perfil profesional",
    "Perfil del negocio",
    "Servicios disponibles",
    "Horarios disponibles",
    "Estadísticas",
    "Clientes frecuentes",
    "Perfil del cliente",
    "Staff / Trabajadores",
    "Estadísticas por trabajador",
    "Backend / Guardado online",
    "Respaldo de datos"
  ];

  blockedTitles.forEach(title=>{
    hidePanelByTitle(title);
  });
}

setTimeout(()=>{
  try{
    hideStaffForbiddenPanels();
  }catch(e){}
},1000);

function applyReceptionRealView(){
  const session = getStaffSession && getStaffSession();
  const role = session ? session.role : (localStorage.getItem("currentRole") || "Admin");

  if(role !== "Recepción") return;

  const blockedTitles = [
    "Staff / Trabajadores",
    "Estadísticas por trabajador",
    "Backend / Guardado online",
    "Respaldo de datos"
  ];

  blockedTitles.forEach(title=>{
    try{
      hidePanelByTitle(title);
    }catch(e){}
  });
}

setTimeout(()=>{
  try{
    applyReceptionRealView();
  }catch(e){}
},1000);

function enforceFinalRolePanels(){
  const session = getStaffSession && getStaffSession();
  const role = session ? session.role : (localStorage.getItem("currentRole") || "Admin");

  if(role === "Admin") return;

  const hiddenForStaffAndReception = [
    "Perfil profesional",
    "Link público",
    "Backend / Guardado online",
    "Respaldo de datos"
  ];

  if(role === "Staff"){
    hiddenForStaffAndReception.push(
      "Servicios disponibles",
      "Horarios disponibles",
      "Estadísticas",
      "Clientes frecuentes",
      "Perfil del cliente",
      "Staff / Trabajadores",
      "Estadísticas por trabajador"
    );
  }

  if(role === "Recepción"){
    hiddenForStaffAndReception.push(
      "Staff / Trabajadores",
      "Estadísticas por trabajador"
    );
  }

  hiddenForStaffAndReception.forEach(title=>{
    try{ hidePanelByTitle(title); }catch(e){}
  });
}

setTimeout(()=>{
  try{ enforceFinalRolePanels(); }catch(e){}
},1000);

function addStaffLogoutButton(){
  const session = getStaffSession && getStaffSession();
  if(!session) return;

  const header = document.querySelector("header") || document.querySelector(".topbar") || document.body;

  if(document.getElementById("staffLogoutBtn")) return;

  const btn = document.createElement("button");
  btn.id = "staffLogoutBtn";
  btn.className = "btn small";
  btn.textContent = "Cerrar sesión empleado";

  btn.onclick = ()=>{

  localStorage.removeItem("staffSession");
  localStorage.removeItem("currentRole");

  db.currentUserId = null;
  saveDB();

  publicBusinessId = null;

  history.replaceState(
    null,
    "",
    location.pathname + location.search
  );

  location.reload();
};

  header.appendChild(btn);
}

setTimeout(()=>{
  try{
    addStaffLogoutButton();
  }catch(e){}
},1000);

function renderClientStaffOptions(){
  const select = document.getElementById("clientStaff");
  const label = document.getElementById("clientStaffLabel");

  if(!select || !label) return;

  const u = publicBusinessId
    ? db.users.find(x=>x.id === publicBusinessId)
    : currentUser && currentUser();

  if(!u || !Array.isArray(u.staff) || !u.staff.length){
    select.classList.add("hidden");
    label.classList.add("hidden");
    select.innerHTML = "";
    return;
  }

  label.classList.remove("hidden");
  select.classList.remove("hidden");

  const current = select.value;

  select.innerHTML = '<option value="">Sin preferencia</option>';

  u.staff.forEach(s=>{
    const option = document.createElement("option");
    option.value = s.name;
    option.textContent = s.name;
    select.appendChild(option);
  });

  select.value = current;
}

setInterval(()=>{
  try{
    renderClientStaffOptions();
  }catch(e){}
},1000);



/* =========================================================
   RESERVAPRO - NAVEGACIÓN CLÁSICA POR PANELES
   Seguro: no cambia IDs, no reemplaza botones, no toca lógica.
   Solo organiza visualmente para que no sea una sola página eterna.
   ========================================================= */
(function(){
  function hasAny(section, selectors){
    return selectors.some(sel => section.querySelector(sel));
  }

  function panelGroups(section){
    const groups = [];
    if(hasAny(section, ['#businessName','#publicLink','#businessSlug'])) groups.push('negocio');
    if(hasAny(section, ['#servicesTable','#slotsTable','#serviceName','#slotDate'])) groups.push('servicios');
    if(hasAny(section, ['#premiumCalendarGrid','#calendarVisual'])) groups.push('inicio','calendario');
    if(hasAny(section, ['#statTotal','#todayTotal'])) groups.push('inicio','resumen');
    if(hasAny(section, ['#reservationsTable'])) groups.push('inicio','reservas');
    if(hasAny(section, ['#historyTable'])) groups.push('reservas','historial');
    if(hasAny(section, ['#clientProfileSelect','#frequentClientsTable'])) groups.push('clientes');
    if(hasAny(section, ['#staffTable','#staffStatsTable','#currentRoleSelect'])) groups.push('staff');
    if(hasAny(section, ['#appointmentRemindersBox'])) groups.push('recordatorios');
    if(hasAny(section, ['#syncBackendBtn','#backupDownloadBtn'])) groups.push('sistema');
    if(!groups.length) groups.push('otros');
    return Array.from(new Set(groups));
  }

  function titleFor(group){
    const map = {
      inicio:['Dashboard','Calendario, reservas activas y resumen rápido.'],
      calendario:['Calendario','Vista principal de tus citas.'],
      reservas:['Reservas','Solicitudes, acciones, WhatsApp, correo e historial.'],
      negocio:['Negocio','Perfil profesional y link público.'],
      servicios:['Servicios y horarios','Servicios disponibles y horarios de atención.'],
      clientes:['Clientes','Clientes frecuentes, notas y bloqueo.'],
      staff:['Staff','Trabajadores, roles y estadísticas por trabajador.'],
      recordatorios:['Recordatorios','Avisos por WhatsApp y correo.'],
      sistema:['Sistema','Backend, guardado online y respaldo.'],
      todo:['Todo','Todas las secciones visibles.']
    };
    return map[group] || ['Dashboard',''];
  }

  function buildClassicDashboard(){
    const dashboard = document.getElementById('dashboardView');
    if(!dashboard || dashboard.dataset.rpClassicReady === '1') return;

    const grid = dashboard.querySelector('.grid, .rp-dashboard-grid');
    if(!grid) return;

    dashboard.dataset.rpClassicReady = '1';

    const shell = document.createElement('div');
    shell.className = 'rp-classic-shell';

    const sidebar = document.createElement('aside');
    sidebar.className = 'rp-classic-sidebar';
    sidebar.innerHTML = `
      <div class="rp-brand-box">
        <strong>ReservaPro</strong>
        <span>Panel de reservas</span>
      </div>
      <nav></nav>
    `;

    const main = document.createElement('div');
    main.className = 'rp-classic-main';
    const header = document.createElement('div');
    header.className = 'rp-classic-header';
    

    dashboard.insertBefore(shell, grid);
    shell.appendChild(sidebar);
    shell.appendChild(main);
    main.appendChild(header);
    main.appendChild(grid);

    const panels = Array.from(grid.children).filter(el => el.tagName && el.tagName.toLowerCase() === 'section');
    panels.forEach(panel => {
      panel.dataset.rpGroups = panelGroups(panel).join(' ');
    });

    const navItems = [
      ['inicio','Inicio'],
      ['calendario','Calendario'],
      ['reservas','Reservas'],
      ['negocio','Negocio'],
      ['servicios','Servicios'],
      ['clientes','Clientes'],
      ['staff','Staff'],
      ['recordatorios','Recordatorios'],
      ['sistema','Sistema'],
      ['todo','Ver todo']
    ];

    const nav = sidebar.querySelector('nav');
    navItems.forEach(([key,label])=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rp-nav-btn';
      btn.dataset.group = key;
      btn.innerHTML = `<span>${label}</span>`;
      btn.onclick = () => showGroup(key);
      nav.appendChild(btn);
    });

    function showGroup(group){
      const [title,sub] = titleFor(group);
      const t = document.getElementById('rpClassicTitle');
      const s = document.getElementById('rpClassicSub');
      if(t) t.textContent = title;
      if(s) s.textContent = sub;

      panels.forEach(panel=>{
        const groups = (panel.dataset.rpGroups || '').split(/\s+/);
        const visible = group === 'todo' || groups.includes(group);
        panel.classList.toggle('rp-panel-hidden', !visible);
      });

      nav.querySelectorAll('.rp-nav-btn').forEach(btn=>{
        btn.classList.toggle('active', btn.dataset.group === group);
      });

      try{ renderPremiumCalendar && renderPremiumCalendar(); }catch(e){}
      try{ renderReservations && renderReservations(); }catch(e){}
    }

    showGroup('inicio');
  }

  window.RP_buildClassicDashboard = buildClassicDashboard;

  window.addEventListener('load', ()=>setTimeout(buildClassicDashboard, 700));
  document.addEventListener('click', ()=>setTimeout(buildClassicDashboard, 200));
})();

function renderBusinessLogoPreview(){
  const input=document.getElementById("businessLogo");
  const box=document.getElementById("businessLogoPreview");

  if(!input || !box) return;

  const url=(input.value || "").trim();

  if(!url){
    box.innerHTML="";
    return;
  }

  box.innerHTML=`
    <img src="${url}"
         style="width:120px;height:120px;object-fit:cover;border:1px solid #ccc;border-radius:10px;">
  `;
}

const businessLogoFile=document.getElementById("businessLogoFile");

if(businessLogoFile){
  businessLogoFile.onchange=(e)=>{
    const file=e.target.files[0];
    if(!file) return;

    const reader=new FileReader();

    reader.onload=()=>{
      document.getElementById("businessLogo").value=reader.result;
      renderBusinessLogoPreview();
    };

    reader.readAsDataURL(file);
  };
}

function renderWorkGalleryPreview(){
  const u=currentUser && currentUser();
  const box=document.getElementById("galleryPreview");
  if(!u || !box) return;

  u.workGallery = Array.isArray(u.workGallery) ? u.workGallery : [];
  box.innerHTML="";

  u.workGallery.forEach((img,index)=>{
    const item=document.createElement("div");
    item.className="gallery-item";
    item.innerHTML=`
      <img src="${img}">
      <button class="btn small danger">Eliminar</button>
    `;

    item.querySelector("button").onclick=()=>{
  u.workGallery.splice(index,1);
  saveDB();
  try{ backendSaveCurrentBusiness(); }catch(e){}
  renderWorkGalleryPreview();
};
    box.appendChild(item);
  });
}

const galleryFilesInput=document.getElementById("galleryFiles");

function compressImage(file, maxWidth=900, quality=0.72){
  return new Promise((resolve)=>{
    const img=new Image();
    const reader=new FileReader();

    reader.onload=()=>{
      img.onload=()=>{
        const scale=Math.min(1,maxWidth/img.width);
        const canvas=document.createElement("canvas");
        canvas.width=Math.round(img.width*scale);
        canvas.height=Math.round(img.height*scale);
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.src=reader.result;
    };

    reader.onerror=()=>resolve("");
    reader.readAsDataURL(file);
  });
}

if(galleryFilesInput){
  galleryFilesInput.onchange=async (e)=>{
    const u=currentUser && currentUser();
    if(!u) return;

    u.workGallery=Array.isArray(u.workGallery)?u.workGallery:[];

    const files=Array.from(e.target.files || []).slice(0,6-u.workGallery.length);
    if(!files.length) return;

    for(const file of files){
      if(u.workGallery.length>=6) break;
      const compressed=await compressImage(file);
      if(compressed){
        u.workGallery.push(compressed);
        saveDB();
        renderWorkGalleryPreview();
      }
    }

    try{ await backendSaveCurrentBusiness(); }catch(e){}
    renderWorkGalleryPreview();
    e.target.value="";
  };
}
/* =====================================================
   RESERVAPRO FIX FINAL: móvil + sesión + reserva pública
   ===================================================== */
(function(){
  function safeGetStaffSession(){
    try{ return JSON.parse(localStorage.getItem("staffSession") || "null"); }catch(e){ return null; }
  }

  function forceCorrectVisibleView(){
    try{
      const hash = window.location.hash || "";
      const auth = document.getElementById("authView");
      const dash = document.getElementById("dashboardView");
      const pub = document.getElementById("publicView");

      if(hash.startsWith("#/")){
        if(auth) auth.classList.add("hidden");
        if(dash) dash.classList.add("hidden");
        if(pub) pub.classList.remove("hidden");
        return;
      }

      // Si la vista pública está abierta desde el botón "Abrir vista pública", no la cierres sola.
      if(pub && !pub.classList.contains("hidden") && publicBusinessId){
        if(auth) auth.classList.add("hidden");
        if(dash) dash.classList.add("hidden");
        return;
      }

      const u = (typeof currentUser === "function") ? currentUser() : null;
      const staff = safeGetStaffSession();

      if(!u && !staff){
        localStorage.removeItem("staffSession");
        localStorage.setItem("currentRole","Admin");
        if(dash) dash.classList.add("hidden");
        if(pub) pub.classList.add("hidden");
        if(auth) auth.classList.remove("hidden");
        return;
      }

      if(u || staff){
        if(auth) auth.classList.add("hidden");
        if(pub) pub.classList.add("hidden");
        if(dash) dash.classList.remove("hidden");
      }
    }catch(e){ console.warn("RP visible view guard", e); }
  }

  window.RP_forceCorrectVisibleView = forceCorrectVisibleView;
  window.addEventListener("load", ()=>setTimeout(forceCorrectVisibleView, 1200));
  window.addEventListener("hashchange", ()=>setTimeout(forceCorrectVisibleView, 300));
  setInterval(forceCorrectVisibleView, 3000);

  function cleanPublicForm(){
    ["clientName","clientPhone","clientEmail"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.value = "";
    });
  }

  function showRequestMessage(html){
    const box = document.getElementById("requestResult");
    if(box){
      box.innerHTML = html;
      box.classList.remove("hidden");
    }
  }

  function installCleanReservationButton(){
    const oldBtn = document.getElementById("requestReservationBtn");
    if(!oldBtn || oldBtn.dataset.rpCleanSubmit === "1") return;

    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);
    btn.type = "button";
    btn.dataset.rpCleanSubmit = "1";
    btn.dataset.sending = "0";

    btn.onclick = async function(){
      if(btn.dataset.sending === "1") return;
      btn.dataset.sending = "1";
      btn.disabled = true;

      try{
        const u = db.users.find(x => x.id === publicBusinessId);
        if(!u){ showRequestMessage("<strong>Error.</strong><br>No se encontró el negocio."); return; }

        const clientName = (document.getElementById("clientName")?.value || "").trim();
        const clientPhone = (document.getElementById("clientPhone")?.value || "").trim();
        const clientEmail = (document.getElementById("clientEmail")?.value || "").trim();
        const serviceId = document.getElementById("clientService")?.value || "";
        const slotId = document.getElementById("clientSlot")?.value || "";
        const selectedStaff = (document.getElementById("clientStaff")?.value || "").trim();

        if(!clientName || !clientPhone || !serviceId || !slotId){
          showRequestMessage("<strong>Faltan datos.</strong><br>Completa nombre, teléfono, servicio y horario.");
          return;
        }

        if((u.blockedClients || []).includes(clientPhone)){
          alert("No puedes hacer reservas con este número.");
          return;
        }

        if(typeof isSlotActiveReserved === "function" && isSlotActiveReserved(u, slotId)){
          showRequestMessage("<strong>Horario ocupado.</strong><br>Ese horario ya fue reservado. Elige otro.");
          return;
        }

        const service = (u.services || []).find(s => s.id === serviceId);
        const reservation = {
          id: uid(),
          clientName,
          clientPhone,
          clientEmail,
          staff: selectedStaff,
          staffId: selectedStaff,
          serviceId,
          serviceName: service ? service.name : "Servicio",
          slotId,
          status: "Pendiente",
          createdAt: new Date().toISOString()
        };

        let updated = null;
        if(typeof backendCreateReservation === "function"){
          const result = await backendCreateReservation(u.id, reservation);
          if(result && result.business) updated = normalizeUser(result.business);
        }

        if(updated){
          const index = db.users.findIndex(x => x.id === updated.id);
          if(index >= 0) db.users[index] = updated;
          else db.users.push(updated);
          publicBusinessId = updated.id;
        }else{
          u.reservations = Array.isArray(u.reservations) ? u.reservations : [];
          u.reservations.push(reservation);
          updated = u;
        }

        saveDB();
        localStorage.setItem("lastClientReservation_" + publicBusinessId, reservation.id);
        localStorage.setItem(clientReservationKey(publicBusinessId), reservation.id);

        cleanPublicForm();
        await renderPublic(updated);
        showRequestMessage("<strong>Solicitud enviada.</strong><br>Tu reserva quedó pendiente de confirmación.");
      }catch(e){
        console.error("RP_PUBLIC_REQUEST_ERROR", e);
        showRequestMessage("<strong>No se pudo enviar la reserva.</strong><br>Intenta otra vez o actualiza la página.");
      }finally{
        btn.dataset.sending = "0";
        btn.disabled = false;
      }
    };
  }

  window.RP_installCleanReservationButton = installCleanReservationButton;
  window.addEventListener("load", ()=>setTimeout(installCleanReservationButton, 1400));
  window.addEventListener("hashchange", ()=>setTimeout(installCleanReservationButton, 900));
  document.addEventListener("click", ()=>setTimeout(installCleanReservationButton, 300));
})();


/* =====================================================
   FIX MÓVIL FINAL: tablas como tarjetas + sin alert molesto
   ===================================================== */
(function(){
  function RP_labelReservationCells(){
    const table = document.getElementById("reservationsTable");
    if(!table) return;
    const labels = ["Cliente","Teléfono","Servicio","Horario","Estado","Trabajador","Acciones"];
    Array.from(table.querySelectorAll("tbody tr")).forEach(tr=>{
      Array.from(tr.children).forEach((td,i)=>{
        td.setAttribute("data-label", labels[i] || "");
      });
    });
  }

  function RP_updatePublicButtonState(){
    const btn = document.getElementById("requestReservationBtn");
    const slot = document.getElementById("clientSlot");
    if(!btn || !slot) return;
    const hasSlot = !!slot.value;
    btn.disabled = !hasSlot;
    if(!hasSlot){
      btn.title = "No hay horarios disponibles";
    }else{
      btn.title = "";
    }
  }

  const oldRenderReservations = window.renderReservations;
  if(typeof oldRenderReservations === "function" && !oldRenderReservations.rpMobileWrapped){
    const wrapped = function(){
      const result = oldRenderReservations.apply(this, arguments);
      setTimeout(RP_labelReservationCells, 50);
      return result;
    };
    wrapped.rpMobileWrapped = true;
    window.renderReservations = wrapped;
  }

  const oldRenderPublic = window.renderPublic;
  if(typeof oldRenderPublic === "function" && !oldRenderPublic.rpMobileWrapped){
    const wrappedPublic = async function(){
      const result = await oldRenderPublic.apply(this, arguments);
      setTimeout(RP_updatePublicButtonState, 80);
      return result;
    };
    wrappedPublic.rpMobileWrapped = true;
    window.renderPublic = wrappedPublic;
  }

  window.addEventListener("load", ()=>setTimeout(()=>{RP_labelReservationCells();RP_updatePublicButtonState();}, 800));
  document.addEventListener("click", ()=>setTimeout(()=>{RP_labelReservationCells();RP_updatePublicButtonState();}, 200));
  document.addEventListener("change", ()=>setTimeout(RP_updatePublicButtonState, 100));
})();


/* =====================================================
   FIX FINAL ESTABLE: volver + vista pública + sync de horarios
   ===================================================== */
(function(){
  function RP_clearPublicHash(){
    publicBusinessId = null;
    if(location.hash){
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  window.addEventListener("load", ()=>{
    setTimeout(()=>{
      const back = document.getElementById("backBtn");
      if(back){
        back.onclick = ()=>{
          RP_clearPublicHash();
          if(typeof currentUser === "function" && currentUser()) loadDashboard();
          else show("authView");
        };
      }

      const openBtn = document.getElementById("openPublicBtn");
      if(openBtn){
        openBtn.onclick = ()=>{
          const u = typeof currentUser === "function" ? currentUser() : null;
          if(!u) return;
          const targetHash = "#/" + u.slug;
          if(location.hash !== targetHash) history.pushState(null, "", targetHash);
          openPublic(u.slug);
        };
      }
    },500);
  });

  // Refresco rápido de la vista pública: actualiza horarios libres/ocupados sin tocar el formulario.
  setInterval(()=>{
    const publicView = document.getElementById("publicView");
    if(publicView && !publicView.classList.contains("hidden") && typeof RP_refreshPublicReservationStatus === "function"){
      RP_refreshPublicReservationStatus();
    }
  },3000);
})();

// Evita que se vea login/dashboard equivocado mientras carga
window.addEventListener("load", ()=>{
  setTimeout(()=>{
    document.body.classList.remove("app-loading");
  }, 700);
});



