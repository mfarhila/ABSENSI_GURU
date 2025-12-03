// ==================== Import & Setup ====================
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const ExcelJS = require("exceljs");
const jwt = require("jsonwebtoken");
const path = require("path");
const QRCODE = require("qrcode");
const cron = require("node-cron"); // ⏰ Reset otomatis
const { error } = require('console');

const app = express();
const PORT = 3000;
const SECRET_KEY = "rahasia_super_aman"; // gunakan env variable di production

// ==================== Middleware ====================
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url} dari ${req.headers.origin}`);
  next();
});

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://peritrichate-isothermobathic-verona.ngrok-free.dev"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ==================== Koneksi MySQL ====================
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "absensi_db"
});

// ==================== Koordinat Sekolah ====================
const sekolah = {
  lat: -8.13827,
  lng: 115.17822
};

// Fungsi hitung jarak antara dua koordinat (dalam km)
function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ==================== Endpoint Login ====================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username dan password wajib diisi" });

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0) return res.status(401).json({ error: "Username tidak ditemukan" });

    const user = rows[0];
    if (user.password !== password) return res.status(401).json({ error: "Password salah" });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      SECRET_KEY,
      { expiresIn: "2h" }
    );

    res.json({
      message: "Login berhasil",
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    console.error("❌ Error login:", err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ==================== Middleware Auth ====================
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Token tidak ada" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token tidak valid" });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: "Token salah / expired" });
    req.user = user;
    next();
  });
}

// ==================== Endpoint Absensi (Validasi Lokasi + Waktu) ====================
app.post('/api/absen', async (req, res) => {
  const { nama, qrCode, lat, lng } = req.body;
  if (!nama || !qrCode) {
    return res.status(400).json({ error: "Nama dan QR Code wajib diisi" });
  }

  if (!lat || !lng) {
    return res.status(400).json({ error: "Koordinat lokasi tidak ditemukan. Aktifkan GPS!" });
  }

  const jarak = hitungJarak(lat, lng, sekolah.lat, sekolah.lng);
  console.log(`📍 Jarak user dari sekolah: ${jarak.toFixed(3)} km`);

  if (jarak > 0.15) {
    return res.status(403).json({ error: "❌ Absen hanya bisa dilakukan di area sekolah!" });
  }

  // Waktu server
 const now = new Date();
const waktuSekarang = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 19)
  .replace("T", " ");

  try {

    // ==================== PERBAIKAN DI SINI ====================
    await db.query(
      "INSERT INTO absensi (nama, qrCode, lat, lng, waktu) VALUES (?, ?, ?, ?, ?)",
      [nama, qrCode, lat, lng, waktuSekarang]
    );
    // ===========================================================

    res.json({ message: "✅ Absensi berhasil disimpan!" });

  } catch (err) {
    console.error("❌ Error insert absensi:", err.sqlMessage || err.message);
    res.status(500).json({
      error: "Gagal menyimpan absensi",
      detail: err.sqlMessage || err.message
    });
  }
});

// ==================== Endpoint Guru ====================
app.post('/api/guru', authMiddleware, async (req, res) => {
  const { nama, kode_qr } = req.body;
  if (!nama || !kode_qr) {
    return res.status(400).json({ error: "Nama dan kode_qr wajib diisi" });
  }

  try {
    const [result] = await db.query(
      "INSERT INTO guru (nama, kode_qr) VALUES (?, ?)",
      [nama, kode_qr]
    );
    res.json({ message: "Guru berhasil ditambahkan", id: result.insertId });
  } catch (err) {
    console.error("❌ Error insert guru:", err);
    res.status(500).json({ error: "Gagal menambahkan guru" });
  }
});

app.get('/api/guru/:id/qr', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query("SELECT * FROM guru WHERE id = ?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Guru tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error ambil guru:", err);
    res.status(500).json({ error: "Gagal mengambil guru" });
  }
});

// ==================== Endpoint Generate QR ====================
app.get('/api/generate-qr', authMiddleware, async (req, res) => {
  try {
    const kodeQR = "QR-" + Date.now();
    const qrImage = await QRCODE.toDataURL(kodeQR);

    res.json({
      kode_qr: kodeQR,
      qr_image: qrImage
    });
  } catch (err) {
    console.error("❌ Gagal Membuat QR:", err);
    res.status(500).json({ error: "Gagal Membuat QR Code" });
  }
});

// ==================== Endpoint Export Excel ====================
app.get('/api/export-excel', authMiddleware, async (req, res) => {
  console.log("📥 Endpoint /api/export-excel dipanggil");

  try {
    const [rows] = await db.query("SELECT * FROM absensi");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Absensi");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Nama Guru", key: "nama", width: 25 },
      { header: "QR Code", key: "qrCode", width: 25 },
      { header: "Latitude", key: "lat", width: 15 },
      { header: "Longitude", key: "lng", width: 15 },
      { header: "Waktu", key: "waktu", width: 25 }
    ];

    // ⭐ Format tanggal Excel (Indonesia)
    worksheet.getColumn('waktu').numFmt = 'dd/mm/yyyy hh:mm:ss';

    rows.forEach(row => {
      let waktuFix = row.waktu;

      // Ubah string → Date
      if (!(waktuFix instanceof Date)) {
        waktuFix = new Date(waktuFix);
      }

      // ⭐ FIX timezone: tambahkan +8 jam agar sesuai WITA
      waktuFix = new Date(waktuFix.getTime() + (8 * 60 * 60 * 1000));

      worksheet.addRow({
        id: row.id,
        nama: row.nama,
        qrCode: row.qrCode,
        lat: row.lat,
        lng: row.lng,
        waktu: waktuFix
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=absensi.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error export excel:", err);
    res.status(500).json({ error: "Gagal export ke Excel" });
  }
});

// ==================== Endpoint Rekap Absensi Hari Ini ====================
app.get('/api/absensi', authMiddleware, async (req, res)=> {
  try {
    const [rows] = await db.query(`
      SELECT id, nama, qrCode, lat, lng, waktu 
      FROM absensi
      ORDER BY waktu DESC 
    `);

    res.json(rows);
  }catch (err){
    console.error("Error load absensi:", err)
    res.status(500).json({error: "Gagal memuat absensi"});
  }
});

// ==================== 🗓️ Reset Otomatis Setiap Bulan ====================
cron.schedule('0 0 1 * *', async () => {
  try {
    console.log("🗓️ Reset otomatis bulanan dimulai...");
    await db.query("TRUNCATE TABLE absensi");
    console.log("✅ Data absensi berhasil direset otomatis pada awal bulan!");
  } catch (err) {
    console.error("❌ Gagal reset otomatis:", err);
  }
});

// ==================== Serve Frontend ====================
const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(frontendPath, "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ==================== Jalankan Server ====================
app.listen(PORT, () => {
  console.log(`✅ Server absensi guru berjalan di http://localhost:${PORT}`);
});
