const BASE_URL = "https://peritrichate-isothermobathic-verona.ngrok-free.dev";


// 🔐 Helper Fetch
async function authFetch(url, options = {}) {
  const token = localStorage.getItem("token"); // hanya dipanggil di sini, bukan dideklarasikan global
  const headers = options.headers || {};
  headers["Authorization"] = `Bearer ${token}`;
  if (!options.noContentType && (!options.method || options.method !== "GET")) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    alert("Sesi login habis, silakan login ulang");
    localStorage.removeItem("token");
    window.location.href = "login.html";
  }
  return res;
}


// 🔹 Generate QR Code
async function generateQR() {
  try {
    const res = await authFetch(`${BASE_URL}/api/generate-qr`);
    const data = await res.json();

    if (data.qr_image) {
      document.getElementById('guruQR').value = data.kode_qr;
      document.getElementById('previewQR').src = data.qr_image;
      document.getElementById('previewQR').classList.remove('hidden');
    } else {
      alert("Gagal membuat QR code!");
    }
  } catch (err) {
    console.error("❌ Gagal ambil QR:", err);
    alert("Tidak bisa ambil QR dari server");
  }
}

// 🔹 Simpan Guru Baru
async function simpanGuru() {
  const nama = document.getElementById("guruNama").value;
  const qr = document.getElementById("guruQR").value;

  if (!nama || !qr) {
    alert("Isi nama dan buat QR dulu!");
    return;
  }

  try {
    const res = await authFetch(`${BASE_URL}/api/guru`, {
      method: "POST",
      body: JSON.stringify({ nama, kode_qr: qr })
    });

    if (res.ok) {
      alert("Guru baru berhasil disimpan!");
      document.getElementById("guruNama").value = "";
      document.getElementById("guruQR").value = "";
      document.getElementById("previewQR").classList.add("hidden");
      loadRekap();
    } else {
      alert("Gagal menyimpan guru");
    }
  } catch (err) {
    console.error("❌ Error simpan guru:", err);
    alert("Tidak bisa menyimpan data guru");
  }
}

// 🔹 Ambil Rekap Absensi
async function loadRekap() {
  try {
    const res = await authFetch(`${BASE_URL}/api/absen`);
    const data = await res.json();
    const tbody = document.getElementById("rekapTable");
    tbody.innerHTML = "";

    data.forEach((absen, i) => {
      const tr = document.createElement("tr");
      tr.classList.add(i % 2 === 0 ? "bg-gray-50" : "bg-white");
      tr.innerHTML = `
        <td class="px-4 py-2 border">${absen.id}</td>
        <td class="px-4 py-2 border">${absen.nama}</td>
        <td class="px-4 py-2 border">${absen.qrCode}</td>
        <td class="px-4 py-2 border">${absen.waktu}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("❌ Gagal ambil data absensi:", err);
    document.getElementById('rekapTable').innerHTML =
      `<tr><td colspan="4" class="px-4 py-2 text-center text-red-500">Gagal memuat data</td></tr>`;
  }
}

// 🔹 Download Excel
async function downloadExcel() {
  const res = await authFetch(`${BASE_URL}/api/export-excel`, { noContentType: true });
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rekap_absensi.xlsx";
  a.click();
}

// 🔹 Logout
function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

// Event listener
document.getElementById('generateQR').addEventListener('click', generateQR);
document.getElementById('simpanGuru').addEventListener('click', simpanGuru);
document.getElementById('refresh').addEventListener('click', () => {
  generateQR();
  loadRekap();
});
document.getElementById('downloadExcel').addEventListener('click', downloadExcel);

// Jalankan awal
loadRekap();
