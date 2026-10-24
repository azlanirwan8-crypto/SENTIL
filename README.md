# wondr merchant by BNI — Dasbor Sentimen

Dasbor lokal untuk menganalisis sentimen ulasan publik **wondr merchant by BNI** di Google Play dan Apple App Store. Dasbor ini independen dan bukan produk resmi BNI.

## Fitur

- **Tarik Analisis** mengambil ulasan dari halaman publik kedua toko aplikasi melalui aplikasi lokal.
- Seluruh ulasan tertulis yang dapat diakses dimuat sampai halaman terakhir, dapat dicari berdasarkan nama atau teks, dan dapat diunduh sebagai CSV.
- Google Play memisahkan daftar ulasannya menurut bahasa antarmuka. Kedua kumpulan (bahasa Indonesia dan bahasa Inggris) dibaca keduanya lalu digabung berdasarkan ID ulasan agar tidak ada ulasan terlewat.
- Ringkasan sentimen, Net Sentiment Score (NSS), sebaran bintang, peringkat tema keluhan, faktor pendorong positif, dan cakupan sumber.
- Detail ulasan menampilkan teks asli, alasan pelabelan, sumber, waktu pengambilan, serta riwayat perubahan.
- Status setiap sumber dilaporkan secara terpisah. Sumber yang belum terhubung tidak dihitung sebagai nol keluhan.
- Metrik halaman toko (jumlah penilaian, nilai rata-rata, dan rentang unduhan) dilaporkan terpisah dari hasil analisis sentimen.
- Tidak ada unggah berkas atau impor data manual.

## Menjalankan

Prasyarat: Node.js 20 atau versi yang lebih baru.

```bash
npm start
```

Buka `http://127.0.0.1:4173/`. Ganti port dengan `PORT=4174 npm start`.

Data awal tersedia di dalam aplikasi. Setelah tombol **Tarik Analisis** digunakan, hasilnya disimpan di `online-data.json` pada direktori proyek. Hentikan aplikasi dengan `Ctrl+C`.

### Mengisi kredensial kanal sosial

Salin `.env.example` menjadi `.env` (atau `.env.local`) lalu isi nilainya. Kedua berkas sudah di-git-ignore dan tidak pernah disajikan lewat HTTP. Jangan menempelkan kunci ke kolom chat atau commit. Bila kunci Anda tersimpan di suatu lingkungan hosting, tarik sendiri ke folder ini, misalnya `vercel env pull .env.local`.

- `GOOGLE_API_KEY` atau `YOUTUBE_API_KEY` — mengaktifkan konektor komentar YouTube Data API v3.
- `APIFY_API_TOKEN` — mengaktifkan kanal X, Instagram, TikTok, Facebook, dan Google Reviews melalui actor Apify. Pemakaian actor memakan kuota berbayar pada akun Anda.

Tanpa kredensial, kanal-kanal itu berstatus **perlu konfigurasi API** dan tidak ada permintaan yang dikirim — bukan nol keluhan dan bukan pula terhubung.

## Menjalankan pada host Node berkelanjutan

Aplikasi ini memakai satu proses Node yang berjalan terus, jadi host-nya harus mendukung proses berkelanjutan (Render, Railway, Fly.io, atau VPS). Platform serverless dengan function berbatas waktu dan disk hanya-baca tidak cocok tanpa penataan ulang penyimpanan dan pembatas waktu.

Cara tercepat di Render: sambungkan repo ini ke akun Anda, lalu pilih service dari `render.yaml` yang sudah tersedia. Render akan meminta nilai `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `GOOGLE_API_KEY`, dan `APIFY_API_TOKEN` saat pembuatan — nilai itu tidak pernah tersimpan di repository. Setelah service dibuat, salin domain yang diberikan Render ke variabel `ALLOWED_HOSTS` lalu redeploy.

| Variabel | Fungsi |
| --- | --- |
| `PORT` | Port yang disediakan host. |
| `BIND_HOST` | `0.0.0.0` agar dapat diakses dari luar; bawaannya `127.0.0.1`. |
| `ALLOWED_HOSTS` | Daftar domain yang dilayani, dipisah koma. |
| `PUBLIC_SCHEME` | `https` (bawaan saat mode publik) atau `http`. |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Wajib pada mode publik. |
| `DATA_PATH` | Lokasi berkas data, misalnya disk yang dipasang permanen. |

Mode publik **menolak start** bila kredensial belum diisi. Alasannya: tombol Tarik Analisis memicu actor Apify berbayar, sehingga tanpa autentikasi siapa pun yang mengetahui alamat situs dapat menghabiskan kuota akun Anda. `/api/status` tetap terbuka tanpa kredensial karena host memakai endpoint itu untuk pemeriksaan kesehatan; isinya hanya status hidup dan tidak memuat data ulasan.

Beri `DATA_PATH` arah disk yang permanen bila host Anda menyimpan filesystem hanya sementara, jika tidak seluruh hasil penarikan akan hilang saat instance berganti.

## Pengujian

```bash
npm test
```

Suite pengujian mencakup perhitungan sentimen, filter, klasifikasi, pembacaan sumber, API, dan penyimpanan data.

## Sumber Data

- Google Play: <https://play.google.com/store/apps/details?id=id.bni.wfb&hl=id>
- Apple App Store: <https://apps.apple.com/id/app/wondr-merchant-by-bni/id6741567238?l=id>

Data awal per 23 Oktober 2026 memuat 55 ulasan tertulis Google Play — gabungan 38 ulasan pada kumpulan bahasa Indonesia dan 17 ulasan pada kumpulan bahasa Inggris — sedangkan halaman tokonya menampilkan 74 penilaian. App Store menampilkan 9 ulasan tertulis pada dua jalur publiknya, sedangkan halaman tokonya menunjukkan 17 penilaian. Selisih antara jumlah penilaian dan jumlah ulasan berteks adalah penilaian yang tidak muncul sebagai ulasan berteks pada daftar publik; penyebabnya per ulasan tidak disimpulkan dari selisih tersebut. Jumlah ulasan dan penilaian bertambah sewaktu karena ulasan baru terus masuk; setiap penarikan membaca seluruh halaman yang dikembalikan sumber sampai tidak ada halaman berikutnya.

Google Play hanya mempublikasikan rentang unduhan, saat ini **10K+**. Apple tidak mempublikasikan jumlah unduhan pada halaman publik, sehingga metrik tersebut dilaporkan **tidak tersedia**, bukan nol.

Kanal YouTube, X, Instagram, TikTok, Facebook, dan Google Reviews memiliki konektor tetapi membutuhkan kredensial pada environment server; tanpa itu statusnya **perlu konfigurasi API** dan tidak ada satu baris pun yang diambil. Forum, blog, dan portal berita tidak memiliki konektor karena hasil pencarian dan berita bukan pengalaman pelanggan. Status **tidak diambil** tidak sama dengan nol keluhan.

## Metode

- Analisis menggunakan seluruh teks ulasan yang dapat diakses publik, tanpa pembatasan jumlah ulasan.
- Pengambilan Google Play membaca setiap kumpulan ulasan yang ditampilkan menurut bahasa antarmuka sampai halaman terakhir, lalu menggabungkan hasilnya berdasarkan ID ulasan.
- Sentimen ditentukan dari teks, bukan dari jumlah bintang. Data awal dilabeli manual; ulasan baru menggunakan aturan kata kunci versi 1.
- NSS dihitung sebagai `(positif − negatif) ÷ jumlah ulasan berlabel × 100`. Ulasan yang perlu tinjauan tidak dihitung sebagai netral.
- Duplikasi dicegah berdasarkan platform dan ID ulasan, dengan pencocokan tambahan berdasarkan nama pengguna, tanggal, dan teks.
- Perubahan pada ulasan tersimpan sebagai versi sebelumnya; versi lama tidak dihitung sebagai ulasan baru.
- Tidak ada upaya melewati proses masuk atau perlindungan akses. Konten promosi resmi tidak diperlakukan sebagai sentimen pelanggan.

## Keterbatasan

- Ulasan publik tidak mewakili seluruh pengguna aplikasi.
- Pembagian kumpulan ulasan oleh Google Play dapat berubah; jika berubah, metode pengambilan perlu diperiksa ulang agar cakupan tetap lengkap.
- Ulasan App Store berjumlah kecil dan seluruhnya positif; jumlah ini tidak cukup untuk membandingkan mutu platform.
- Data publik tidak menyediakan informasi lokasi yang dapat diverifikasi.
- Pelabelan otomatis dapat keliru pada negasi, sarkasme, atau ulasan dengan beberapa aspek.
- Keluhan dalam ulasan merupakan pernyataan pengguna, bukan insiden yang telah terverifikasi.

## Struktur Proyek

- `server.mjs` — server lokal, API, penyimpanan data, dan konfigurasi deployment.
- `collectors.mjs` — pengambilan dan penguraian ulasan publik serta komentar kanal yang berkredensial.
- `local-env.mjs` — pembacaan `.env` / `.env.local` tanpa pernah menampilkan nilainya.
- `model.js` — perhitungan sentimen, kategori, filter, dan ekspor CSV.
- `data.js` — data awal dan daftar platform.
- `app.js`, `index.html`, `styles.css` — antarmuka dasbor.

## Pernyataan Independensi

Dasbor dan laporan ini merupakan produk independen, bukan produk resmi BNI, dan tidak mewakili pandangan atau kebijakan PT Bank Negara Indonesia (Persero) Tbk.
