// ==================== Import & Setup ====================
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise'); // gunakan promise biar gampang async/await
const ExcelJS = require("exceljs");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ==================== Koneksi MySQL ====================
const db = mysql.createPool({
    host: "localhost",
    user: "root",       // ganti sesuai user MySQL Anda
    password: "",       // ganti sesuai password MySQL Anda
    database: "absensi_db"
});

// ==================== Endpoint Absensi ====================
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

app.get('/api/absen', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM absensi ORDER BY waktu DESC");
        res.json(rows);
    } catch (err) {
        console.error("❌ Error ambil absensi:", err);
        res.status(500).json({ error: "Gagal mengambil data absensi" });
    }
});

// ==================== Endpoint Guru ====================
app.post('/api/guru', async (req, res) => {
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

app.get('/api/guru/:id/qr', async (req, res) => {
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

// ==================== Endpoint Generate QR ====================
app.get('/api/generate-qr', (req, res) => {
    const token = "QR-" + Date.now(); // bisa diganti pakai UUID
    res.json({ qrCode: token });
});

// ==================== Endpoint Export Excel ====================
app.get('/api/export-excel', async (req, res) => {
    console.log("📥 Endpoint /api/export-excel dipanggil"); // Debug log
    try {
        const [rows] = await db.query("SELECT * FROM absensi");

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Absensi");

        // Header kolom
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Nama Guru", key: "nama", width: 25 },
            { header: "QR Code", key: "qrCode", width: 25 },
            { header: "Waktu", key: "waktu", width: 25 }
        ];

        // Isi data
        rows.forEach(row => {
            worksheet.addRow(row);
        });

        // Atur response agar langsung download
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
