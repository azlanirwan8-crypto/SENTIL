# Sentiment Intelligence — analisis ulasan otomatis

Platform analisis sentimen untuk ulasan publik Google Play dan App Store. Satu pintu data (`/api/sync`), satu mesin statistik yang mempelajari korpusnya sendiri, dan ruang analisis multi-workspace yang tersimpan di peramban.

## Yang tidak dilakukan aplikasi ini

- **Tidak ada API key, token, atau kredensial.** Tidak ada variabel lingkungan wajib untuk menjalankan analisis.
- **Tidak ada kamus manual.** Tidak ada daftar kata sentimen, daftar kata alay, atau kategori keluhan yang ditulis tangan.
- **Tidak ada pelabelan manual.** Semua label dihasilkan mesin dari data yang ditarik.
- **Tidak ada impor berkas.** Tidak ada unggah CSV/Excel; sumbernya hanya halaman publik toko aplikasi.
- **Tidak ada login atau akun.** Workspace disimpan di `localStorage` peramban, bukan di server multi-tenant.
- **Tidak ada bypass proteksi situs.** Hanya halaman ulasan publik yang dibaca, tanpa menyamar sebagai peramban atau menembus batas anti-bot.
- **Tidak ada kanal berbayar.** Actor berbayar tidak dipakai dan tidak dapat dipicu dari aplikasi ini.

## Alur

1. **Dua isian.** Pengguna mengisi nama analisis dan nama entitas. Kandidat aplikasi dicari otomatis ke `gplay.search` dan iTunes Search; tidak ada ID yang perlu diketik manual, dan mesin tidak memilihkan kandidat.
2. **Penarikan paralel.** Kanal Google Play (dua kumpulan bahasa: `id/id` dan `en/us`, urut terbaru, berpaginasi) dan App Store (halaman ulasan publik + feed pelanggan) dibaca bersamaan dengan `Promise.allSettled` dan anggaran waktu di bawah `maxDuration` function, sehingga satu kanal lambat tidak membatalkan kanal lain.
3. **Analisis korpus.** Seluruh baris yang terbaca dianalisis; tidak ada pembatasan sampel.
4. **Visualisasi.** Empat grafik, tabel ulasan, dan panel metode mengikuti workspace aktif.

Cache berlaku satu jam per kanal dan per penemuan identitas. Tombol **Perbarui** melewatkan cache (force sync).

## Menjalankan

```bash
npm install
npm run build      # bundel React (esbuild) + Tailwind -> app.js, styles.css
npm start          # pratinjau lokal di http://localhost:5173
```

Tidak ada langkah konfigurasi. `npm run dev` menjalankan build lalu server.

| Skrip | Fungsi |
| --- | --- |
| `npm run build` | Membangun `app.js` (esbuild) dan `styles.css` (Tailwind). |
| `npm run build:js` / `build:css` | Salah satu tahap build saja. |
| `npm start` | Server statis lokal + meneruskan `/api/sync`. |
| `npm test` | `node --test tests` — 47 pengujian mesin, sinkronisasi, API, dan server. |

## API

Satu-satunya endpoint adalah `POST /api/sync`. Gerbangnya bukan akun, melainkan penolakan permintaan lintas situs (`sec-fetch-site`, `Origin`, `Host`) agar kuota sumber publik tidak dipicu dari halaman lain, ditambah validasi masukan di server.

```jsonc
// penemuan identitas
{ "action": "discover", "entity": "nama aplikasi", "force": false }

// penarikan + analisis
{ "action": "sync", "entity": "nama aplikasi", "playAppId": "com.tes", "appleAppId": "12345", "force": true }
```

Respons `sync` memuat `reviews` (setiap baris membawa `analysis`), `model` (metrik korpus, istilah, klaster, agregat harian/kanal), `channels` (status, cakupan, pesan sumber, cache), `summary`, dan `engine`. Batas isi permintaan 16 KB; kesalahan validasi dikembalikan sebagai JSON dengan kode error.

## Mesin korpus

Versi mesin: `corpus-rating-v1`. Semua angka di bawah dipelajari dari dataset yang sedang dibuka, sehingga berbeda untuk setiap workspace.

1. **Normalisasi algoritmik.** HTML, entity, tautan, dan emoji dibuang; token di-normalisasi NFKD; huruf yang berulang tiga kali atau lebih direduksi (`ngelaggggg` → `ngelag`), dan pengulangan utuh direduksi (`sukasuka` → `suka`). Tidak ada daftar kata.
2. **Stopwords frekuensi dinamis.** 2% token dengan frekuensi tertinggi pada korpus menjadi kandidat buang. Kandidat yang distribusinya sangat berbeda antara ulasan berbintang rendah dan tinggi (dukungan ≥ 3 dan sinyal ≥ 1,2) **dipertahankan sebagai fitur** — pada korpus nyata kata seperti `tidak` dan `lama` justru pembawa sinyal, bukan kata struktur.
3. **Bobot berkorelasi bintang.** Bobot kata adalah rasio log kemunculan dokumen pada ulasan 4–5★ terhadap 1–2★, dengan smoothing Jeffreys (α = 0,5) agar tidak bias pada kelas yang tidak seimbang, penyusutan dukungan `n/(n+2)`, dan cekaman ±4.
4. **Klasifikasi berbatas data.** Skor dokumen adalah jumlah bobot istilah terpelajari dibagi akar jumlah istilah yang cocok. Batas kelas adalah titik tengah median rendah dan median tinggi, dengan pita netral yang lebarnya dipelajari dari sebaran skor ulasan 3★. Skor di luar pita menjadi positif/negatif.
5. **NSS.** `(positif − negatif) / terklasifikasi × 100`. Ulasan tanpa istilah terpelajari tetap dihitung sebagai baris dan dilaporkan sebagai *tak terklasifikasi*; tidak dipaksa ke kelas mana pun.
6. **Klaster keluhan.** Dari ulasan 1–2★, istilah berbobot negatif dikelompokkan berdasarkan ko-okurensi satu langkah dengan ambang yang diturunkan dari sebaran kemiripan korpus. Nama klaster diambil dari istilah teratas, bukan kategori buatan.

### Batas klaim (jujur soal ini)

- Bintang 1–5 adalah **sinyal lemah**, bukan label emas. Karena bobot dipelajari dari bintang, mesin ini **tidak sepenuhnya unsupervised** secara ketat.
- **AUC yang ditampilkan adalah in-sample** — dihitung pada data yang sama yang membentuk bobot. Angka itu mengukur pemisahan internal, **bukan akurasi luar sampel**, dan tidak ada klaim kalibrasi probabilitas.
- Klaster adalah kelompok statistik, bukan penyebab produk yang terverifikasi. Satu ulasan dapat masuk beberapa klaster.
- Balasan pengembang tidak dibaca. Jumlah yang dilaporkan toko (mis. jumlah ulasan/penilaian) ditampilkan apa adanya dan **tidak dipaksa sama** dengan jumlah yang benar-benar terbaca.

## Workspace dan penyimpanan

Kunci `localStorage`: `si.workspaces.v1` (metadata), `si.dataset.v1.<id>` (salinan data penuh), `si.active.v1` (workspace aktif).

- **Create:** dialog dua isian + grid kandidat dua kolom, lalu penarikan pertama berjalan otomatis.
- **Read:** pemilih workspace di bilah atas berpindah instan tanpa permintaan jaringan.
- **Update:** force sync per workspace; metadata dan snapshot diperbarui dari hasil terbaru.
- **Delete:** konfirmasi eksplisit; hanya menghapus salinan lokal, sumber publik tidak berubah.

Bila kuota penyimpanan peramban penuh, aplikasi tetap berjalan di memori dan menampilkan peringatan beserta tombol ekspor JSON — datanya tidak dipotong atau disampel diam-diam. Ekspor berisi seluruh ulasan, analisis per baris, model, dan metadata kanal.

## Dasbor

Empat grafik dibuat sendiri dengan SVG (tanpa pustaka grafik eksternal):

1. **Tren harian** — batang bertumpuk positif/netral/negatif/tak terklasifikasi per tanggal publikasi, dengan rincian saat disorot atau difokuskan.
2. **Sebaran kanal** — donut jumlah ulasan terbaca per kanal; kanal yang gagal tidak diisi angka perkiraan.
3. **Peta keluhan** — treemap squarified dari klaster istilah ulasan 1–2★; blok dapat dipilih untuk melihat istilah penyusunnya.
4. **Kanal × sentimen** — batang berkelompok per kanal beserta NSS kanal.

Setiap keadaan kosong ditampilkan sebagai keadaan kosong yang menjelaskan alasannya (kanal tidak dipilih, sumber mengembalikan nol ulasan, kanal gagal, atau ambang statistik belum terpenuhi) — bukan angka nol yang menyamar sebagai hasil.

## Struktur

```
api/sync.js              function Vercel, satu pintu API
lib/corpus-engine.mjs    normalisasi, stopword, bobot, klaster, agregat
lib/googleplay.mjs       penemuan + penarikan ulasan Play publik
lib/appstore.mjs         penemuan iTunes + halaman ulasan + feed publik
lib/sync-core.mjs        orkestrasi, cache 1 jam, anggaran waktu, ringkasan
server.mjs               server statis lokal + penerusan /api/sync
build.mjs                bundel esbuild -> app.js
src/                     React (workspace, dialog, 4 grafik, tabel ulasan, panel metode)
tests/                   node:test untuk mesin, sinkronisasi, API, dan server
```

## Deploy ke Vercel

Proyek ini statis + function serverless; **tidak memerlukan environment variable apa pun**. `vercel.json` memasang header keamanan dan CSP `self` (font dilayani dari `assets/fonts/`, tanpa aset eksternal). Function `api/sync.js` memakai `maxDuration: 60` dengan anggaran internal Play 30 detik dan App Store 24 detik.

Cache satu jam bersifat *per instance* function: setelah instance baru, penarikan pertama kembali penuh. Ini disengaja — tidak ada penyimpanan bersama yang perlu kredensial.

## Keterbatasan

- Hanya ulasan tertulis publik yang dapat dibaca; halaman ulasan umumnya membatasi riwayat yang ditampilkan, dan aplikasi melaporkan hasil parsial apa adanya.
- Bahasa campuran (Indonesia/Inggris) diproses dalam satu korpus; bobot bersifat per-korpus, bukan model bahasa.
- Tanpa akun berarti tanpa sinkronisasi antar-perangkat: workspace hanya ada di peramban tempat ia dibuat.
- Angka toko bisa berubah antar penarikan; snapshot menyimpan waktu tarik agar selalu jelas data mana yang sedang dibaca.

## Pernyataan independensi

Aplikasi ini tidak berafiliasi dengan Google LLC, Apple Inc., atau penerbit aplikasi yang dianalisis. Nama dan angka aplikasi ditampilkan sebagai data publik dari halaman toko resmi; ikon toko digambar ulang secara umum, bukan menggunakan aset berhak milik toko.
