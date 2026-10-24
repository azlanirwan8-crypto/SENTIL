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
- `GOOGLE_PLACES_API_KEY` — mengaktifkan kanal Google Reviews melalui Google Places API (New). Kunci dikirim sebagai header `X-Goog-Api-Key`, tidak pernah masuk URL.
- `APIFY_API_TOKEN` — mengaktifkan kanal X, Instagram, TikTok, dan Facebook melalui actor Apify. Pemakaian actor memakan kuota berbayar pada akun Anda.

Tanpa kredensial, kanal-kanal itu berstatus **perlu konfigurasi API** dan tidak ada permintaan yang dikirim — bukan nol keluhan dan bukan pula terhubung.

Status **terhubung** berarti permintaan benar-benar dikirim dan dijawab. Apabila sumber mengembalikan penanda "tidak ada hasil" — misalnya actor X mengirim `{ "noResults": true }` atau Instagram mengirim `no_items` — dasbor menuliskan jumlah penanda itu apa adanya. Itu berbeda dari kegagalan, dan berbeda pula dari nol keluhan.

## Menjalankan pada Vercel

`vercel.json`, `middleware.js`, dan `api/*.js` menyiapkan aplikasi untuk Vercel Functions:

- `/api/data`, `/api/status`, dan `/api/analyze` dilayani function Node; halaman statis tetap dari repo.
- Function membaca environment deployment, jadi `APIFY_API_TOKEN`, `YOUTUBE_API_KEY`, dan `GOOGLE_PLACES_API_KEY` yang Anda pasang di Vercel benar-benar dipakai.
- `api/analyze.js` diberi `maxDuration` 300 detik karena actor Apify dapat berjalan beberapa menit. Actor yang belum selesai saat function habis waktu tidak diulang: `coverage.runId` tersimpan dan penarikan berikutnya melanjutkan run yang sama.
- `middleware.js` meminta kredensial Basic pada seluruh halaman bila `DASHBOARD_USER` dan `DASHBOARD_PASSWORD` diisi. Bila keduanya kosong, halaman tetap terbuka tetapi `/api/analyze` diblokir agar pengunjung lain tidak memakai kuota Apify Anda. `api/analyze.js` memeriksa kredensial yang sama sekali lagi di dalam function (penjagaan kedua) sehingga endpoint berbayar tidak pernah terbuka walaupun middleware dilewati.
- Middleware berjalan pada Edge Runtime Vercel: hanya API Web yang boleh dipakai (`atob`, `TextDecoder`, `Response`). `Buffer` dan `node:crypto` tidak tersedia di sana — pernah menyebabkan seluruh situs gagal dengan `500 MIDDLEWARE_INVOCATION_FAILED`.

Batas yang perlu diketahui: disk Vercel Function (`/tmp`, atau `DATA_PATH` yang Anda tentukan) hanya hidup selama instance function berjalan. Riwayat penarikan dapat kembali ke dataset awal ketika instance berganti. Untuk riwayat jangka panjang, pakai host Node berkelanjutan di bawah dan arahkan `DATA_PATH` ke disk permanen.

## Menjalankan pada host Node berkelanjutan

`server.mjs` menjalankan satu proses Node yang hidup terus, sehingga cocok untuk Render, Railway, Fly.io, atau VPS dan menyimpan riwayat pada `DATA_PATH`.

Cara tercepat di Render: sambungkan repo ini ke akun Anda, lalu pilih service dari `render.yaml` yang sudah tersedia. Render akan meminta nilai `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `GOOGLE_API_KEY`, `GOOGLE_PLACES_API_KEY`, dan `APIFY_API_TOKEN` saat pembuatan — nilai itu tidak pernah tersimpan di repository. Setelah service dibuat, salin domain yang diberikan Render ke variabel `ALLOWED_HOSTS` lalu redeploy.

| Variabel | Fungsi |
| --- | --- |
| `PORT` | Port yang disediakan host. |
| `BIND_HOST` | `0.0.0.0` agar dapat diakses dari luar; bawaannya `127.0.0.1`. |
| `ALLOWED_HOSTS` | Daftar domain yang dilayani, dipisah koma. |
| `PUBLIC_SCHEME` | `https` (bawaan saat mode publik) atau `http`. |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Wajib pada mode publik. |
| `DATA_PATH` | Lokasi berkas data, misalnya disk yang dipasang permanen. |
| `APIFY_WAIT_MS` | Anggaran tunggu actor Apify per penarikan (milidetik). |

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

Kanal YouTube memakai YouTube Data API v3, kanal Google Reviews memakai Google Places API (New), sedangkan kanal X, Instagram, TikTok, dan Facebook memakai actor Apify. Semua kanal itu butuh kredensial pada environment server; tanpa itu statusnya **perlu konfigurasi API** dan tidak ada satu baris pun yang diambil. Forum, blog, dan portal berita tidak memiliki konektor karena hasil pencarian dan berita bukan pengalaman pelanggan. Status **tidak diambil** tidak sama dengan nol keluhan.

Google Places API (New) tidak lagi menyertakan teks ulasan pada respons bagi pemanggil baru. Kanal ini melaporkan place yang benar-benar dikembalikan pencarian resmi dan jumlah teks ulasan yang tersedia; bila tidak ada place yang bernama produk, ulasan Google Maps tidak dikarang dan juga tidak dihitung.

Hasil penarikan daring pada 24 Oktober 2026 dengan kredensial pada server, tercatat apa adanya dari respons sumber:

| Kanal | Status | Teks tersimpan | Bukti yang dikembalikan sumber |
| --- | --- | --- | --- |
| Google Play | berhasil | 55 | 38 baris kumpulan bahasa Indonesia + 17 baris kumpulan bahasa Inggris, masing-masing 1 halaman, tidak ada halaman berikutnya |
| App Store | berhasil | 9 | 9 ulasan pada halaman ulasan (1 halaman) dan 9 pada feed resmi (1 halaman); 9 dikonfirmasi kedua jalur |
| YouTube | berhasil | 10 | 10 komentar unik dari 7 video yang metadatanya menyebut wondr merchant; seluruh halaman API diproses termasuk balasan |
| TikTok | berhasil | 2 | 94 item dataset diperiksa; 91 teks tidak menyebut identitas produk sehingga tidak disimpan, 2 teks tersisa berasal dari akun resmi `bni46` |
| X / Twitter | berhasil, tanpa hasil | 0 | 10 item dataset seluruhnya penanda `noResults` untuk kueri produk |
| Instagram | berhasil, tanpa hasil | 0 | 1 item penanda `no_items` ("Empty or private data for provided input") |
| Facebook | berhasil, tanpa hasil | 0 | 1 item penanda `no_items` ("Empty or private data for provided input") |
| Google Reviews | berhasil, tanpa hasil | 0 | 2 kueri dijawab, 4 halaman, 59 place; 0 place bernama wondr merchant dan 0 teks ulasan disertakan API |
| Forum, blog, berita | tidak diambil | 0 | Tidak ada konektor; hasil pencarian dan berita bukan pengalaman pelanggan |

Dari 76 baris yang tersimpan, 64 ulasan toko membawa label (41 positif, 22 negatif, 1 netral; NSS 29,6875). Dua belas teks sosial disimpan sebagai bukti tetapi **tidak** dinilai sebagai sentimen pelanggan: dua-dua konten akun resmi BNI dan sepuluh komentar YouTube yang membahas BNI secara umum atau belum jelas targetnya. Angka dasar toko tidak berubah karena konten sosial tidak masuk penyebut NSS.

Pencarian sosial bekerja longgar. Kueri `wondr merchant` pada TikTok mengembalikan 94 item yang sebagian besar adalah "Wandering Merchant" (game), "Wonder — Natalie Merchant", dan merek "Wondr" di negara lain; teks seperti itu dibuang pada tahap pengambilan **dan** jumlahnya dilaporkan, sehingga tidak ada penyaringan diam-diam.

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
- `dashboard-core.mjs` — penyusun dataset yang sama untuk server lokal dan function serverless.
- `dashboard-store.mjs`, `api/*.js`, `middleware.js`, `vercel.json` — lapisan Vercel Function dan gerbang masuknya.
- `collectors.mjs` — pengambilan dan penguraian ulasan publik serta komentar kanal yang berkredensial.
- `local-env.mjs` — pembacaan `.env` / `.env.local` tanpa pernah menampilkan nilainya.
- `model.js` — perhitungan sentimen, kategori, filter, dan ekspor CSV.
- `data.js` — data awal dan daftar platform.
- `app.js`, `index.html`, `styles.css` — antarmuka dasbor.

## Pernyataan Independensi

Dasbor dan laporan ini merupakan produk independen, bukan produk resmi BNI, dan tidak mewakili pandangan atau kebijakan PT Bank Negara Indonesia (Persero) Tbk.
