# wondr merchant by BNI — Dasbor Sentimen

Dasbor lokal untuk menganalisis sentimen ulasan publik **wondr merchant by BNI** di Google Play dan Apple App Store. Dasbor ini independen dan bukan produk resmi BNI.

## Fitur

- **Tarik Analisis** mengambil ulasan dari halaman publik kedua toko aplikasi melalui aplikasi lokal.
- Seluruh ulasan tertulis yang dapat diakses dimuat, dapat dicari berdasarkan nama atau teks, dan dapat diunduh sebagai CSV.
- Ringkasan sentimen, Net Sentiment Score (NSS), sebaran bintang, peringkat tema keluhan, faktor pendorong positif, dan cakupan sumber.
- Detail ulasan menampilkan teks asli, alasan pelabelan, sumber, waktu pengambilan, serta riwayat perubahan.
- Status setiap sumber dilaporkan secara terpisah. Sumber yang belum terhubung tidak dihitung sebagai nol keluhan.
- Tidak ada unggah berkas atau impor data manual.

## Menjalankan

Prasyarat: Node.js 20 atau versi yang lebih baru.

```bash
npm start
```

Buka `http://127.0.0.1:4173/`.

Data awal tersedia di dalam aplikasi. Setelah tombol **Tarik Analisis** digunakan, hasilnya disimpan di `online-data.json` pada direktori proyek. Hentikan aplikasi dengan `Ctrl+C`.

## Pengujian

```bash
npm test
```

Suite pengujian mencakup perhitungan sentimen, filter, klasifikasi, pembacaan sumber, API, dan penyimpanan data.

## Sumber Data

- Google Play: <https://play.google.com/store/apps/details?id=id.bni.wfb&hl=id>
- Apple App Store: <https://apps.apple.com/id/app/wondr-merchant-by-bni/id6741567238?l=id>

Data awal per 23 Oktober 2026 memuat 35 ulasan tertulis Google Play dari 68 penilaian halaman toko, serta 8 ulasan tertulis App Store dari 15 penilaian halaman toko. Penilaian tanpa teks tidak menyediakan nama atau isi publik sehingga tidak dapat dianalisis.

Kanal media sosial, forum, blog, portal berita, dan Google Reviews belum terhubung. Statusnya **tidak diambil**, bukan nol keluhan.

## Metode

- Analisis menggunakan seluruh teks ulasan yang dapat diakses publik, tanpa pembatasan jumlah ulasan.
- Sentimen ditentukan dari teks, bukan dari jumlah bintang. Data awal dilabeli manual; ulasan baru menggunakan aturan kata kunci versi 1.
- NSS dihitung sebagai `(positif − negatif) ÷ jumlah ulasan berlabel × 100`. Ulasan yang perlu tinjauan tidak dihitung sebagai netral.
- Duplikasi dicegah berdasarkan platform dan ID ulasan, dengan pencocokan tambahan berdasarkan nama pengguna, tanggal, dan teks.
- Perubahan pada ulasan tersimpan sebagai versi sebelumnya; versi lama tidak dihitung sebagai ulasan baru.
- Tidak ada upaya melewati proses masuk atau perlindungan akses. Konten promosi resmi tidak diperlakukan sebagai sentimen pelanggan.

## Keterbatasan

- Ulasan publik tidak mewakili seluruh pengguna aplikasi.
- Ulasan App Store berjumlah kecil dan seluruhnya positif; jumlah ini tidak cukup untuk membandingkan mutu platform.
- Data publik tidak menyediakan informasi lokasi yang dapat diverifikasi.
- Pelabelan otomatis dapat keliru pada negasi, sarkasme, atau ulasan dengan beberapa aspek.
- Keluhan dalam ulasan merupakan pernyataan pengguna, bukan insiden yang telah terverifikasi.

## Struktur Proyek

- `server.mjs` — server lokal, API, dan penyimpanan data.
- `collectors.mjs` — pengambilan dan penguraian ulasan publik.
- `model.js` — perhitungan sentimen, kategori, filter, dan ekspor CSV.
- `data.js` — data awal dan daftar platform.
- `app.js`, `index.html`, `styles.css` — antarmuka dasbor.

## Pernyataan Independensi

Dasbor dan laporan ini merupakan produk independen, bukan produk resmi BNI, dan tidak mewakili pandangan atau kebijakan PT Bank Negara Indonesia (Persero) Tbk.
