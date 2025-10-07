// ==================== Import & Setup ====================
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise'); 
const ExcelJS = require("exceljs");
const jwt = require("jsonwebtoken"); // tambahkan untuk JWT

const app = express();
const PORT = 3000;
const SECRET_KEY = "rahasia_super_aman"; // ganti dengan env variable di production

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ==================== Koneksi MySQL ====================
const db = mysql.createPool({
    host: "localhost",
    user: "root",      
    password: "",      
    database: "absensi_db"
});

// ==================== Endpoint Login ====================
// ==================== Endpoint Login ====================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username dan password wajib diisi" });
    }

    try {
        const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "Username tidak ditemukan" });
        }

        const user = rows[0];

        // sementara password plain text (sebaiknya pakai bcrypt di production)
        if (user.password !== password) {
            return res.status(401).json({ error: "Password salah" });
        }

        // 🔑 buat token JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: "2h" } // token berlaku 2 jam
        );

        res.json({
            message: "Login berhasil",
            token, // kirim token ke frontend
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

// ==================== Endpoint Absensi (tanpa authMiddleware) ====================
app.post('/api/absen', async (req, res) => {
    const { nama, qrCode } = req.body;

    if (!nama || !qrCode) {
        return res.status(400).json({ error: "Nama dan QR Code wajib diisi" });
    }

    try {
        const [result] = await db.query(
            "INSERT INTO absensi (nama, qrCode) VALUES (?, ?)", 
            [nama, qrCode]
        );
        res.json({ message: "Absensi berhasil", id: result.insertId });
    } catch (err) {
        console.error("❌ Error insert absensi:", err);
        res.status(500).json({ error: "Gagal menyimpan absensi" });
    }
});

app.get('/api/absen', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM absensi ORDER BY waktu DESC");
        res.json(rows);
    } catch (err) {
        console.error("❌ Error ambil absensi:", err);
        res.status(500).json({ error: "Gagal mengambil data absensi" });
    }
});

// ==================== Endpoint Guru (protected) ====================
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
        if (rows.length === 0) {
            return res.status(404).json({ error: "Guru tidak ditemukan" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Error ambil guru:", err);
        res.status(500).json({ error: "Gagal mengambil guru" });
    }
});

// ==================== Endpoint Generate QR (protected) ====================
app.get('/api/generate-qr', authMiddleware, (req, res) => {
    const token = "QR-" + Date.now(); 
    res.json({ qrCode: token });
});

// ==================== Endpoint Export Excel (protected) ====================
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
            { header: "Waktu", key: "waktu", width: 25 }
        ];

        rows.forEach(row => worksheet.addRow(row));

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

// ==================== Jalankan Server ====================
app.listen(PORT, () => {
    console.log(`✅ Server absensi guru berjalan di http://localhost:${PORT}`);
});
