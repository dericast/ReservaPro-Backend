const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() {
  return new Date().toISOString();
}

function slugify(text) {
  return String(text || "negocio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "negocio";
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    app: "ReservaPro Backend",
    message: "Backend funcionando correctamente con Supabase"
  });
});

app.post("/api/register", async (req, res) => {
  const { email, password, businessName } = req.body;

  if (!email || !password || !businessName) {
    return res.status(400).json({ error: "Faltan datos." });
  }

  const id = uid();
  const slug = slugify(businessName + "-" + id.slice(0, 4));
  const date = now();

  const initialData = {
  id,
  email: email.toLowerCase(),
  businessName,
  slug,
  activo: false,
  estado: "pendiente",
  services: [],
  slots: [],
  reservations: [],
  gallery: [],
  staff: []
};

  const { error } = await supabase.from("businesses").insert({
    id,
    email: email.toLowerCase(),
    password,
    businessname: businessName,
    slug,
    data: initialData,
    activo: false,
    createdat: date,
    updatedat: date
  });

  if (error) {
    console.error("REGISTER_ERROR", error);
    return res.status(400).json({
      error: "Ese correo ya existe o hubo un error."
    });
  }

  res.json({
    ok: true,
    business: initialData
  });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("email", String(email || "").toLowerCase())
    .eq("password", password)
    .maybeSingle();

  if (error) {
    console.error("LOGIN_ERROR", error);
    return res.status(500).json({ error: "Error del servidor." });
  }

  if (!data) {
    return res.status(401).json({ error: "Datos incorrectos." });
  }

  res.json({
    ok: true,
    business: {
  ...data.data,
  activo: data.activo === true,
  estado: data.activo === true ? "activo" : "pendiente"
}
  });
});

app.post("/api/staff-login", async (req, res) => {
  const { email, password } = req.body;

  const loginEmail = String(email || "").trim().toLowerCase();
  const loginPass = String(password || "");

  const { data, error } = await supabase
    .from("businesses")
    .select("*");

  if (error) {
    console.error("STAFF_LOGIN_ERROR", error);
    return res.status(500).json({ error: "Error del servidor." });
  }

  for (const row of data || []) {
    const business = row.data || {};
    const staff = Array.isArray(business.staff) ? business.staff : [];

    const foundStaff = staff.find(s =>
      String(s.email || "").trim().toLowerCase() === loginEmail &&
      String(s.password || s.pass || "").trim() === loginPass
    );

    if (foundStaff) {
      return res.json({
        ok: true,
        business,
        staff: foundStaff
      });
    }
  }

  res.status(401).json({
    error: "Empleado no encontrado o contraseña incorrecta."
  });
});

app.get("/api/business/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", req.params.slug)
    .maybeSingle();

  if (error) {
    console.error("BUSINESS_LOAD_ERROR", error);
    return res.status(500).json({ error: "Error del servidor." });
  }

  if (!data) {
    return res.status(404).json({ error: "Negocio no encontrado." });
  }

  res.json({
    ok: true,
    business: data.data
  });
});

app.put("/api/business/:id", async (req, res) => {
  const business = req.body.business;

  if (!business || !business.id) {
    return res.status(400).json({ error: "Datos inválidos." });
  }

  const date = now();

  const payload = {
    id: business.id,
    email: String(business.email || "").toLowerCase(),
    password: business.pass || business.password || "",
    businessname: business.businessName || "ReservaPro",
    slug: business.slug || slugify(business.businessName),
    data: business,
    updatedat: date
  };

  const { error } = await supabase
    .from("businesses")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.error("SAVE_BUSINESS_ERROR", error);
    return res.status(500).json({ error: "No se pudo guardar." });
  }

  res.json({
    ok: true,
    business
  });
});

app.post("/api/business/:id/reservations", async (req, res) => {
  const reservation = req.body.reservation;

  if (!reservation) {
    return res.status(400).json({ error: "Reserva inválida." });
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    console.error("BUSINESS_FIND_ERROR", error);
    return res.status(500).json({ error: "Error del servidor." });
  }

  if (!data) {
    return res.status(404).json({ error: "Negocio no encontrado." });
  }

  const business = data.data || {};

  const newReservation = {
    ...reservation,
    id: reservation.id || uid(),
    status: reservation.status || "Pendiente",
    createdAt: reservation.createdAt || now()
  };

  business.reservations = Array.isArray(business.reservations)
    ? business.reservations
    : [];

  business.reservations.push(newReservation);

  const { error: updateError } = await supabase
    .from("businesses")
    .update({
      data: business,
      updatedat: now()
    })
    .eq("id", req.params.id);

  if (updateError) {
    console.error("SAVE_RESERVATION_ERROR", updateError);
    return res.status(500).json({
      error: "No se pudo guardar la reserva."
    });
  }

  res.json({
    ok: true,
    reservation: newReservation,
    business
  });
});

app.listen(PORT, () => {
  console.log(`ReservaPro backend activo en puerto ${PORT} usando Supabase`);
});