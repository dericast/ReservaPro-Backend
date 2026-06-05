const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const dbPath = path.join(__dirname, "reservapro.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      businessName TEXT,
      slug TEXT UNIQUE,
      data TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      businessId TEXT,
      clientName TEXT,
      clientPhone TEXT,
      clientEmail TEXT,
      serviceName TEXT,
      slotId TEXT,
      status TEXT,
      data TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);
});

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
    message: "Backend funcionando correctamente"
  });
});

app.post("/api/register", (req, res) => {
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
    services: [],
    slots: [],
    reservations: [],
    gallery: [],
    staff: []
  };

  db.run(
    `INSERT INTO businesses (id, email, password, businessName, slug, data, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      email.toLowerCase(),
      password,
      businessName,
      slug,
      JSON.stringify(initialData),
      date,
      date
    ],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "Ese correo ya existe o hubo un error." });
      }

      res.json({
        ok: true,
        business: initialData
      });
    }
  );
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    `SELECT * FROM businesses WHERE email = ? AND password = ?`,
    [String(email || "").toLowerCase(), password],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Error del servidor." });
      if (!row) return res.status(401).json({ error: "Datos incorrectos." });

      res.json({
        ok: true,
        business: JSON.parse(row.data)
      });
    }
  );
});

app.post("/api/staff-login", (req, res) => {
  const { email, password } = req.body;

  db.all(`SELECT * FROM businesses`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Error del servidor." });

    const loginEmail = String(email || "").trim().toLowerCase();
    const loginPass = String(password || "");

    for (const row of rows) {
      let business;

      try {
        business = JSON.parse(row.data);
      } catch (e) {
        continue;
      }

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

    return res.status(401).json({
      error: "Empleado no encontrado o contraseña incorrecta."
    });
  });
});

app.get("/api/business/:slug", (req, res) => {
  db.get(
    `SELECT * FROM businesses WHERE slug = ?`,
    [req.params.slug],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Error del servidor." });
      if (!row) return res.status(404).json({ error: "Negocio no encontrado." });

      res.json({
        ok: true,
        business: JSON.parse(row.data)
      });
    }
  );
});

app.put("/api/business/:id", (req, res) => {
  const business = req.body.business;

  if (!business || !business.id) {
    return res.status(400).json({ error: "Datos inválidos." });
  }

  db.run(
    `UPDATE businesses
     SET businessName = ?, slug = ?, data = ?, updatedAt = ?
     WHERE id = ?`,
    [
      business.businessName || "ReservaPro",
      business.slug || slugify(business.businessName),
      JSON.stringify(business),
      now(),
      req.params.id
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "No se pudo guardar." });

      res.json({
        ok: true,
        business
      });
    }
  );
});

app.post("/api/business/:id/reservations", (req, res) => {
  const reservation = req.body.reservation;

  if (!reservation) {
    return res.status(400).json({ error: "Reserva inválida." });
  }

  db.get(`SELECT * FROM businesses WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: "Error del servidor." });
    if (!row) return res.status(404).json({ error: "Negocio no encontrado." });

    const business = JSON.parse(row.data);
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

    db.run(
      `UPDATE businesses SET data = ?, updatedAt = ? WHERE id = ?`,
      [JSON.stringify(business), now(), req.params.id],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: "No se pudo guardar la reserva." });

        res.json({
          ok: true,
          reservation: newReservation,
          business
        });
      }
    );
  });
});


app.get("/api/debug/staff", (req, res) => {
  db.all(`SELECT * FROM businesses`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Error del servidor." });
    const businesses = (rows || []).map(row => {
      let business = {};
      try { business = JSON.parse(row.data); } catch(e) {}
      return {
        id: business.id || row.id,
        businessName: business.businessName || row.businessName,
        slug: business.slug || row.slug,
        staff: (business.staff || []).map(s => ({
          name: s.name,
          email: s.email,
          role: s.role,
          hasPassword: !!(s.password || s.pass)
        }))
      };
    });
    res.json({ ok:true, businesses });
  });
});

app.listen(PORT, () => {
  console.log(`ReservaPro backend activo en http://localhost:${PORT}`);
});
