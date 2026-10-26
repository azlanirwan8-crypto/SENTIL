# Sentil — analisis ulasan otomatis

Platform analisis sentimen untuk ulasan publik Google Play dan App Store. Satu pintu data (`/api/sync`), satu mesin statistik yang mempelajari korpusnya sendiri, dan ruang analisis multi-workspace yang tersimpan di peramban.

## Yang tidak dilakukan aplikasi ini

- **Tidak ada API key, token, atau kredensial.** Tidak ada variabel lingkungan wajib untuk menjalankan analisis. Karena tidak ada kunci yang dipakai, tidak ada tempat penyimpanan kunci yang dikelola; yang dipantau adalah batas sumber publik itu sendiri (lihat panel **Source limits** pada menu **Platform**).
- **Tidak ada kamus manual.** Tidak ada daftar kata sentimen, daftar kata alay, atau kategori keluhan yang ditulis tangan.
- **Tidak ada pelabelan manual.** Semua label dihasilkan mesin dari data yang ditarik.
- **Tidak ada impor berkas.** Tidak ada unggah CSV/Excel; sumbernya hanya halaman publik toko aplikasi.
- **Tidak ada login atau akun.** Workspace disimpan di `localStorage` peramban, bukan di server multi-tenant.
- **Tidak ada bypass proteksi situs.** Yang dibaca adalah halaman ulasan publik, suaka RSS resmi, dan API resmi (YouTube Data API v3, Reddit OAuth, actor Apify untuk kanal yang tidak punya API publik). Permintaan membawa user-agent tanpa menyamar sebagai peramban, dan tembok login atau batas anti-bot tidak ditembus — bila sebuah jalur tidak mengizinkan, kanal itu melaporkan kegagalannya.
- **Kanal berbayar hanya aktif atas keputusan pemilik akun.** Facebook, Instagram, TikTok, dan X mengambil data lewat actor Apify yang **memungut biaya**. Tidak ada kolom di aplikasi untuk memasukkan token: kanal-kanal itu baru berjalan bila `APIFY_API_TOKEN` dipasang sendiri di environment server. Tanpa token, statusnya `needs_setup` dan nol permintaan yang dikirim.

## Alur

1. **Dua isian.** Pengguna mengisi nama analisis dan nama entitas. Kandidat dicari otomatis ke `gplay.search` dan iTunes Search dengan pool lebar (24 dan 25 hasil), lalu disaring `lib/name-match.mjs`: hanya aplikasi yang namanya memuat **semua** kata yang dicari yang ditampilkan, sehingga pencarian "Wondr Merchant" tidak lagi memunculkan "Livin' Merchant" atau "Merchant BCA". Kata struktur (`by`, `pt`, `tbk`, `aplikasi`, …) diabaikan dan kata yang muncul di hampir semua hasil turun bobotnya; jumlah kandidat yang dibuang selalu dinyatakan di antarmuka. Bila tidak ada satu pun yang memuat semua kata, kanal dilaporkan kosong dengan alasan — bukan diisi hasil tak berelasi. Kanal dengan tepat satu kandidat bernama persis sudah tidak ambigu, jadi kandidat itu terpilih lebih dulu di dialog dan tetap bisa diganti.
2. **Penarikan paralel.** Semua kanal yang aktif dibaca bersamaan dengan `Promise.allSettled` dan anggaran waktu masing-masing di bawah `maxDuration` function, sehingga satu kanal lambat tidak membatalkan kanal lain. Kanal toko: Google Play (dua kumpulan bahasa `id/id` dan `en/us`, berpaginasi) dan App Store (halaman ulasan publik + feed pelanggan). Kanal sosial dan web: lihat tabel **Kanal** di bawah.
3. **Analisis korpus.** Seluruh baris yang terbaca dianalisis; tidak ada pembatasan sampel.
4. **Visualisasi.** Empat grafik, tabel ulasan, dan panel metode mengikuti workspace aktif.

Cache berlaku satu jam per kanal dan per penemuan identitas. Tombol **Perbarui** melewatkan cache (force sync).

## Kanal

Satu registry (`lib/channels.mjs`) dipakai server dan klien, jadi menambah kanal tidak lagi berarti menyunting dua tempat. `lib/sync-core.mjs` menyusun pekerjaan dari katalog ini; setiap kolektor mengembalikan bentuk yang sama (`status`, `reviews`, `fetched`, `coverage`, `limits.issues`, `limits.paths`, `truncated`) sehingga monitor batas sumber dan mesin korpus tidak perlu tahu sumber mana yang sedang dibaca.

| Kanal | Sumber data | Kredensial yang diperlukan | Biaya |
| --- | --- | --- | --- |
| `play` | Halaman ulasan publik Google Play (`google-play-scraper`) | tidak ada | gratis |
| `appstore` | Halaman ulasan publik + feed pelanggan App Store | tidak ada | gratis |
| `news` | Pencarian Google News RSS + suaka tambahan dari `NEWS_RSS_URLS` | tidak ada | gratis |
| `youtube` | YouTube Data API v3: komentar atas dan balasan di bawah video | `YOUTUBE_API_KEY` | gratis, kena kuota harian API |
| `reddit` | OAuth2 aplikasi Reddit: utas yang menyebut nama entitas | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | gratis untuk penggunaan non-komersial |
| `facebook`, `instagram`, `tiktok`, `x` | Actor Apify (`apify/facebook-search-scraper`, `apify/instagram-scraper`, `clockworks/tiktok-scraper`, `apidojo/tweet-scraper`) | `APIFY_API_TOKEN` | **berbayar** per run/hasil |

Kenapa tidak semuanya tanpa kunci: jalur publik Reddit (`www.reddit.com`, `old.`, `api.`, dan suaka `.rss`) terbukti membalas **HTTP 403 dari jaringan server** pada 26 Oktober 2026, dan Facebook/Instagram/TikTok tidak menyediakan API publik tanpa autentikasi. Kanal yang belum punya kredensial mengembalikan status `needs_setup` dengan pesan sebabnya, **bukan** baris kosong yang bisa disalahpahami sebagai "tidak ada ulasan". Panel **Source limits** di menu **Platform** menampilkannya sebagai **Needs credentials**.

```bash
# Hanya untuk environment server / .env lokal. Tidak pernah lewat browser, kolom chat, atau commit.
YOUTUBE_API_KEY=...            # YouTube Data API v3
YOUTUBE_VIDEO_IDS=...          # opsional, patoki cakupan video
YOUTUBE_CHANNEL_IDS=...        # opsional, batasi pencarian ke kanal tertentu
NEWS_RSS_URLS=...              # opsional, suaka RSS tambahan
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
APIFY_API_TOKEN=...            # menagih biaya actor
```

## Menjalankan

```bash
npm install
cp .env.example .env   # opsional: isi SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY agar data tersimpan di database
npm run build          # bundel React (esbuild) + Tailwind -> public/app.js, public/styles.css
npm start              # build lalu pratinjau lokal di http://localhost:5173
```

Tanpa `.env` aplikasi tetap jalan, hanya saja melaporkan bahwa database belum dipasang dan tidak ada yang tersimpan antar kunjungan. `npm run dev` menjalankan build lalu server.

| Skrip | Fungsi |
| --- | --- |
| `npm run build` | Membangun ke `public/`: `app.js` (esbuild), `styles.css` (Tailwind), salinan `index.html`, dan `assets/`. Hanya isi folder ini yang boleh disajikan publik. |
| `npm run build:js` / `build:css` | Salah satu tahap build saja. |
| `npm start` | Build lebih dulu, lalu server statis dari `public/` + meneruskan `/api/sync`; memuat `.env.local` bila ada. |
| `npm test` | `node --test tests` — 174 pengujian mesin, kolektor, kanal, sinkronisasi, monitor batas, frasa keluhan, matriks perbandingan, hitung ulang filter dasbor, database, API, dan server. |

## API

Satu-satunya endpoint adalah `POST /api/sync`. Gerbangnya bukan akun, melainkan penolakan permintaan lintas situs (`sec-fetch-site`, `Origin`, `Host`) — perlindungan CSRF untuk titik tulis yang tidak punya sesi, bukan penjatah kuota. Isi permintaan dibatasi 16 KB dan setiap bidang divalidasi di server.

Aksi yang dikenal: `discover`, `sync`, `limits`, `limits-reset`, `state`, `dataset`, `workspace-save`, `workspace-delete`. Empat aksi terakhir hanya menyentuh database di sisi server; kunci Supabase tidak pernah dikirim ke peramban dan tidak muncul di respons. Kegagalan tulis dilaporkan apa adanya lewat bidang `stored` pada respons `sync` — hasil penarikan tetap dikembalikan utuh.

```jsonc
// penemuan identitas
{ "action": "discover", "entity": "nama aplikasi", "force": false }

// penarikan + analisis (kanal sosial/web aktif lewat `social`)
{
  "action": "sync",
  "entity": "nama aplikasi",
  "playAppId": "com.tes",
  "appleAppId": "12345",
  "social": { "news": { "enabled": true }, "youtube": { "enabled": true, "videoIds": ["ABCDEFGHIJK"] } },
  "force": true
}

// pemantauan batas sumber (dari memori instance yang hangat)
{ "action": "limits", "entity": "nama aplikasi", "playAppId": "com.tes", "appleAppId": "12345", "social": { "news": { "enabled": true } } }

// kosongkan catatan percobaan + lepas cache kanal
{ "action": "limits-reset", "entity": "nama aplikasi", "playAppId": "com.tes", "appleAppId": "12345" }
```

`normalizeSocialTargets()` menyaring isi `social` sebelum dipakai: hanya flag `enabled` bertipe boolean dan target berbetuk sah (ID video 11 karakter, nama subreddit) yang dipertahankan; bidang lain — termasuk apa pun yang menyerupai token — dibuang. Respons `sync` memuat `reviews` (setiap baris membawa `analysis`), `model` (metrik korpus, istilah, `topics` beserta `topicSource`, agregat harian/kanal), `channels` (status, cakupan, pesan sumber, sinyal batas di `limits.issues`/`limits.paths`, `budgetMs`, `elapsedMs`, cache; kanal toko juga mengembalikan `app.listing` — teks daftar aplikasi yang menjadi kosakata topik), `limits` (monitor gabungan seluruh kanal + riwayat percobaan), `credentials` (hanya status siap/tidak siap per kanal, tanpa nilai kredensial), `summary`, dan `engine`. Respons `discover` memuat per kanal `candidates` (setiap kandidat membawa `match` berisi `tier`, `score`, `matched`, `missing`), `matchMode` (`matched`/`nearest`/`empty`), `matched`, `filteredOut`, `searched`, dan `message`. Batas isi permintaan 16 KB; kesalahan validasi dikembalikan sebagai JSON dengan kode error.

## Mesin korpus

Versi mesin: `corpus-rating-v2` (lapisan frasa `pain-phrase-v2`). Semua angka di bawah dipelajari dari dataset yang sedang dibuka, sehingga berbeda untuk setiap workspace. Angka yang masih berupa keputusan manusia **didaftarkan di `model.parameters`** dengan label `conventions` dan `structural`, bukan disembunyikan.

1. **Normalisasi algoritmik.** HTML, entity, tautan, dan emoji dibuang; token di-normalisasi NFKD; huruf yang berulang tiga kali atau lebih direduksi (`ngelaggggg` → `ngelag`), dan pengulangan utuh direduksi (`sukasuka` → `suka`). Tidak ada daftar kata.
2. **Pemisah kosakata dari uji kemaknaan.** Suatu istilah dianggap beban kosakata kalau bobotnya **tidak bisa dibedakan dari nol** pada korpus ini — diukur dengan membandingkan |log-odds| terhadap simpangan baku estimasinya sendiri (delta method, α Jeffreys 0,5). Tidak ada fraksi frekuensi dan tidak ada daftar kata. Catatan hasil uji: aturan berbasis hukum Zipf dan aturan "df tinggi + z rendah" **keduanya terbukti lebih buruk** pada korpus nyata dan tidak dipakai.
3. **Bobot berkorelasi bintang.** Bobot kata adalah rasio log kemunculan dokumen pada ulasan 4–5★ terhadap 1–2★, dengan penghalusan Jeffreys (α = 0,5), penyusutan dukungan `n/(n+2)`, dan cekaman pada **kuantil empirik sebaran bobot korpus itu sendiri** (bukan angka ±4 tetap).
4. **Klasifikasi berbatas data.** Skor dokumen adalah jumlah bobot istilah terpelajari dibagi akar jumlah istilah yang cocok. Batas kelas adalah titik tengah median rendah dan median tinggi. Pita netralnya adalah jarak tipikal skor ulasan 3★ ke batas itu; **kalau korpus tidak punya ulasan 3★ yang bisa dinilai, pita netralnya nol** — versi lama mengarang pita `0,1 × selisih`, dan itu sudah dihapus karena mengada-ada.
5. **NSS.** `(positif − negatif) / terklasifikasi × 100`. Ulasan tanpa istilah terpelajari tetap dihitung sebagai baris dan dilaporkan sebagai *tak terklasifikasi*; tidak dipaksa ke kelas mana pun.
6. **Topik keluhan.** Namanya diambil dari **teks daftar aplikasi yang ditarik dari toko** (judul, ringkasan, deskripsi, kategori, catatan rilis dari Google Play, ditambah deskripsi iTunes). Sebuah istilah toko menjadi topik bila: panjangnya ≥ 6 huruf **atau** penulisannya seperti nama (huruf besar di tengah kalimat / akronim kapital, mis. `QRIS`, `EDC`); bukan bagian nama proyek yang sedang dianalisis; bukan bentuk berjulukan (`...nya`, `...pun`, `...kah`); muncul di ≥ 1% ulasan 1–2★; dan, kalau penulisannya biasa, lebih sering dipakai di keluhan daripada di pujian. Setiap topik lalu dihitung pada ulasan: jumlah 1–2★, 3★, 4–5★, dan tanpa bintang. Tidak ada kamus aspek buatan; kosakatanya berasal dari sumber.
7. **Frasa keluhan** (`pain-phrase-v2`, lapisan kedua di atas topik unigram). Semua urutan 2–4 token yang bersebelahan di ulasan 1–2★ menjadi kandidat; daftar pemisah kosakata dari poin 2 dipakai sebagai batas ujung frasa. Sebuah frasa dipertahankan hanya bila **dua hal**: kemunculannya bisa dibedakan dari nol (|log-odds| > simpangan bakunya sendiri, α Jeffreys 0,5) dan arahnya memang condong ke keluhan. Tidak ada ambang dukungan `max(3, 0,2%)` lagi — frasa yang terlalu tipis buktinya gugur dengan sendirinya. Bobot urut = `min(batas empirik, log-odds) × √jumlah ulasan negatif`. Frasa pendek yang tidak pernah muncul tanpa frasa panjang yang sudah diambil (`document frequency`-nya persis sama) dihitung sebagai varian (`droppedCovered`), bukan keluhan baru. Setiap frasa dikelompokkan di bawah **kata jangkar** yang dipilih dari statistik korpus (token dengan log-odds tertinggi di dalam frasa itu). Keluaran: `model.painPoints` dengan `anchors`, `items`, `pools`, `parameters`, dan `metrics` yang melaporkan berapa kandidat gugur beserta alasannya (`droppedNotDistinct`, `droppedWrongDirection`, `droppedCovered`, `trimmedItems`).

   **Yang tetap keputusan manusia, dan itu disengaja:** panjang frasa 2–4 (definisi "ungkapan"), batas pencarian kosakata, dan anggaran tampilan 10 jangkar / 40 frasa. Pemilihan ordo n-gram secara otomatis sudah dicoba dua cara dan **dua-duanya gagal terukur** pada 32.610 ulasan nyata: PMUI mentah naik monoton antar ordo (0,42 → 5,63 → 12,72 → 20,28) dan PMUI inkremental juga (−5,74 → −2,10 → −0,42 → −0,07), keduanya artefak perbandingan — konteks yang lebih panjang memang selalu lebih prediktif — bukan sinyal. Nilainya dilaporkan lewat `model.painPoints.parameters` supaya bisa dinilai pembaca.

   Terverifikasi pada korpus nyata. Penarikan kanal toko (tanpa kunci API) atas Livin' by Mandiri menghasilkan 32.610 ulasan → 320.118 kandidat frasa, 40 dilaporkan di bawah 10 kata jangkar, dan **setiap frasa yang keluar adalah urutan token yang benar-benar ada di ulasan, dengan jumlah ulasan per frasa cocok sampai satuan terakhir** (dihitung ulang dari teks sumber, bukan dari angka mesin).

   **Perbaikan kinerja terukur (penting untuk klaim "tanpa sampling").** Penyisihan varian (`droppedCovered`) semula memindai *seluruh* frasa yang sudah diambil untuk setiap kandidat: kuadratik terhadap jumlah frasa yang lolos uji kemaknaan. Diukur per fase pada korpus nyata: langkah itu sendiri memakan **90 detik dari 91 detik total** untuk 8.000 ulasan, dan pada 45.000 ulasan mesinnya praktis tidak pernah selesai — inilah penyebab sebenarnya "penarikan data banyak" terasa menggantung, bukan database dan bukan kolektor. Sekarang frasa yang diambil diindeks dua tingkat (`document frequency` → urutan bersebelahan yang lebih pendek), jadi satu lookup menggantikan pemindaian. Hasilnya **identik byte per byte** dengan implementasi lama pada 2.000 / 4.000 / 8.000 ulasan nyata (kedua implementasi dijalankan berdampingan dan dibandingkan), dan waktunya turun ±97×: 93,9 s → 0,96 s pada 8.000 ulasan; lapisan frasa penuh pada 45.900 ulasan = 5,8 s. Satu penarikan ujung-ke-ujung (kolektor Play 32,4 s + seluruh analisis) selesai dalam **38,1 s untuk 44.400 ulasan**, heap 325 MB — di bawah batas 60 detik fungsi serverless.

### Batas klaim (jujur soal ini)

- Bintang 1–5 adalah **sinyal lemah**, bukan label emas. Karena bobot dipelajari dari bintang, mesin ini **tidak sepenuhnya unsupervised** secara ketat.
- **AUC yang ditampilkan adalah in-sample** — dihitung pada data yang sama yang membentuk bobot. Angka itu mengukur pemisahan internal, **bukan akurasi luar sampel**, dan tidak ada klaim kalibrasi probabilitas.
- Topik adalah istilah yang ditawarkan penerbit di halaman tokonya, dihitung pada teks ulasan. Ini **bukan penyebab produk yang terverifikasi**, dan satu ulasan dapat menyebut beberapa topik sehingga angkanya beririsan (tidak menjumlah jadi 100%).
- Frasa keluhan hanya menangkap urutan 2–4 token **setelah** normalisasi, jadi ejaan yang berbeda untuk maksud yang sama tidak disatukan secara semantik (`tertahan` dan `menggantung` tetap dua frasa). Batas cekaman membuat frasa berdukungan besar berdesakan di skor yang sama, jadi urutan teratas dibaca sebagai "paling banyak dikeluhkan", bukan "paling parah".
- **Lapisan topik tidak dibuat tanpa-ambang, dan itu hasil eksperimen, bukan kemalasan.** Tiga aturan tanpa angka tetap dicoba pada 32.610 ulasan: elbow kurva Zipf, "df tinggi + z rendah", dan kontrol pengganggu berupa stratifikasi panjang ulasan. Ketiganya menghasilkan 44–52 topik yang didominasi `bisa`, `ini`, `dan`, `yang`, `dari`, `and`, `for`, `you` — jauh lebih buruk dari 12 topik aturan bentuk lama. Penyebabnya terukur: ulasan 1–2★ rata-rata **11,1 token** sedangkan 4–5★ **7,0**, jadi kata bantu membawa sinyal kelas yang nyata secara statistik, dan tidak ada ambang yang diturunkan dari statistik yang sama bisa memisahkan itu. Aturan bentuk (`≥ 6 huruf` atau penulisan seperti nama) dipertahankan sebagai **proxy struktural yang jujur**.
- Balasan pengembang tidak dibaca. Jumlah yang dilaporkan toko (mis. jumlah ulasan/penilaian) ditampilkan apa adanya dan **tidak dipaksa sama** dengan jumlah yang benar-benar terbaca.

## Workspace dan penyimpanan

Workspace, snapshot hasil penarikan, dan riwayat penarikan hidup di PostgreSQL Supabase (`db/supabase.sql`), diakses fungsi server lewat API PostgREST — tanpa driver TCP, tanpa pooler, tanpa allowlist IP.

| Tabel | Isi |
| --- | --- |
| `sentil_workspace` | id, label, entitas, target toko, flag kanal, snapshot ringkas |
| `sentil_dataset` | penanda `revision` aktif + engine, summary, model, kanal, limits |
| `sentil_review` | satu baris per ulasan yang terbaca, `payload` jsonb utuh |
| `sentil_sync_run` | riwayat setiap penarikan: status, jumlah baris, kanal, durasi |

- **Create:** dialog dua isian + grid kandidat dua kolom; workspace disimpan lebih dulu, lalu penarikan pertama berjalan otomatis.
- **Read:** memilih workspace memanggil aksi `dataset`, dan baris ulasan dibaca per 1000 baris sampai halaman terakhir pendek.
- **Update:** force sync menulis revisi baru sampai lengkap, memindahkan penanda di `sentil_dataset`, baru membuang revisi lama — pembaca tidak pernah melihat data setengah terganti.
- **Delete:** konfirmasi eksplisit; cascade ikut menghapus dataset dan baris ulasan milik workspace itu. Sumber publik tidak berubah.

Row Level Security diaktifkan di semua tabel dan hak `anon`/`authenticated` dicabut, jadi hanya `service_role` (fungsi server) yang bisa lewat. Karena aplikasi ini tanpa akun, siapa pun yang mencapai situs akan melihat workspace yang sama — konsekuensi yang disengaja dari keputusan "tanpa login".

`localStorage` peramban hanya menyimpan satu nilai: workspace mana yang sedang dibuka. Salinan data tidak pernah ditulis ke peramban lagi, jadi kegagalan kuota penyimpanan tidak bisa terjadi. Ekspor JSON tetap berisi seluruh ulasan, analisis per baris, model, dan metadata kanal — tanpa potongan sampel.

## Dashboard

Satu baris filter di atas grafik, keduanya aktif bersamaan:

- **Channel** — hanya muncul kalau korpus benar-benar punya lebih dari satu kanal.
- **Topic** — 12 topik yang dibentuk mesin dari teks daftar aplikasi.

Filter dihitung ulang dari `dataset.reviews` di peramban (`src/lib/scope.js`), bukan dari angka yang sudah dibulatkan: KPI, tren harian, sebaran kanal, peta keluhan, dan kanal × sentimen semuanya disusun dari baris yang tersaring, dan statusnya ditulis apa adanya (`510 of 43.110 reviews`). Yang **tidak** dihitung ulang adalah bobot kata, frasa keluhan, dan senarai topik — itu hasil analisis seluruh korpus, jadi filter mengubah *siapa yang dihitung*, bukan *bagaimana cara menilainya*. Karena itu jumlah "with text / without text" (hasil tokenisasi mesin) sengaja hilang saat tersaring, daripada ditiru dari teks mentah dan terlihat sama padahal tidak. Porsi topik tetap terhadap pool 1–2★ dari baris yang sedang terlihat; bedanya cuma ulasan tanpa teks, dan itu diuji.

Empat grafik dibuat sendiri dengan SVG (tanpa pustaka grafik eksternal):

1. **Tren harian** — batang bertumpuk positif/netral/negatif/tak terklasifikasi per tanggal publikasi, dengan rincian saat disorot atau difokuskan.
2. **Sebaran kanal** — donut jumlah ulasan terbaca per kanal; kanal yang gagal tidak diisi angka perkiraan.
3. **Peta keluhan** — batang per topik fitur dari teks daftar aplikasi, dihitung pada ulasan 1–2★; segmen hijau di belakang batang menunjukkan ulasan 4–5★ yang menyebut istilah sama. Baris dapat dipilih untuk melihat rincian.
4. **Kanal × sentimen** — batang berkelompok per kanal beserta NSS kanal.

Kontrak tooltip (`ChartTooltip`): panelnya **solid** (`bg-slate-950`, tanpa `backdrop-blur`) supaya warna bar tidak menembus teksnya; tingginya diukur sendiri, bukan diduga; dan posisinya dijepit ke **jendela gulir yang sedang terlihat** — bukan ke lebar konten — sehingga tooltip tidak pernah menutupi kepala kartu, tidak pernah keluar dari kartu di bar paling kiri/kanan, dan tidak menambah lebar gulir palsu. Semua itu diverifikasi pada 43.110 ulasan nyata dengan mengukur bounding box tooltip di enam posisi (kiri/tengah/kanan × dua chart).

Setiap keadaan kosong ditampilkan sebagai keadaan kosong yang menjelaskan alasannya (kanal tidak dipilih, sumber mengembalikan nol ulasan, kanal gagal, ambang statistik belum terpenuhi, atau kombinasi filter yang memang tidak punya baris) — bukan angka nol yang menyamar sebagai hasil.


## Compare (matriks lintas project)

Menu **Compare** membandingkan hingga 12 project sekaligus, head-to-head dalam satu tabel. Matriksnya dihitung **di server** (`lib/compare-engine.mjs`) dari `summary` + `model` yang sudah tersimpan di `sentil_dataset` — bukan dengan mengirim seluruh ulasan ke peramban, karena lima project @30.000 ulasan adalah 150.000 baris lewat jaringan. Karena itu hanya kolom ringkas yang dibaca (`loadDatasetHeads`), dan ia diuji secara eksplisit agar tidak pernah jatuh ke jalur baca penuh.

- **Acuan delta = median lintas kolom yang dipilih.** Tidak ada baseline yang ditulis tangan: mengubah isi matriks mengubah acuannya. Arah "mana yang lebih baik" adalah sifat semantik metrik (NSS naik itu baik, pangsa 1★ turun itu baik), dan `volume`/`velocity` sengaja ditandai *netral* — lebih banyak ulasan bukan berarti lebih bagus.
- **Baris metrik:** volume, jumlah terklasifikasi, cakupan, kecepatan ulasan/hari, momentum, NSS, tri-state %, rata-rata bintang, pangsa 1★, rating toko, tak terklasifikasi. Tiap sel menampilkan nilai, delta terhadap median, dan peringkat.
- **Kecepatan dan momentum** dihitung dari rentang tanggal project itu sendiri; momentum = paruh kedua ÷ paruh pertama dari rentang teramati, sehingga tidak ada jendela "30 hari" yang harus dipilih.
- **Dua populasi 1★ tidak pernah digabung:** pangsa 1★ dari ulasan yang terbaca dan pangsa 1★ dari histogram toko dilaporkan sebagai baris terpisah.
- **Heatmap pain point** adalah gabungan frasa yang mesin korpus laporkan per project. Sel kosong berarti *tidak terdeteksi*, bukan nol.
- **Leaderboard NSS** memberi jarak ke pemuncak; **Widest gaps** hanya menyebut pasangan kolom yang benar-benar berbeda — kalau dua kolom identik, insight-nya kosong, tidak dikarang.

Catat batasnya: kecepatan ulasan diukur dari ulasan yang benar-benar terbaca aplikasi ini, dan paginasi toko mengambil yang terbaru lebih dulu, jadi periode lama bisa kurang terwakili. Batas 12 kolom dan 24 baris heatmap adalah anggaran tampilan, dan jumlah yang dipangkas dilaporkan (`painPointTrimmed`).

Sudah dijalankan pada data nyata (tiga project toko yang ditarik langsung, tanpa database): 14 baris metrik, 115 frasa keluhan lintas project dengan 24 ditampilkan dan 91 dilaporkan terpangkas, 9 insight selisih, 3 catatan batas. Matriksnya memperlihatkan perbedaan yang seharusnya terlihat: pangsa 1★ dari ulasan yang terbaca (0,287) dan dari histogram toko (0,0877) untuk aplikasi yang sama berbeda jauh karena paginasi toko mengirim ulasan terbaru — keduanya memang populasi berbeda, dan tidak pernah disatukan.

## Platform (Source limits)

Menu **Platform** (dan satu badge di kepala workspace bila ada jalur yang terpotong) melaporkan keadaan setiap kanal dari sinyal yang benar-benar terlihat saat penarikan. Pustaka aturannya ada di `lib/limit-monitor.mjs` dan dipakai server maupun antarmuka, jadi tidak ada dua versi kebenaran.

| State | Muncul ketika |
| --- | --- |
| **Aktif** | Kanal `success`, tidak terpotong, tanpa sinyal batas. |
| **Terbatas** | Ada sinyal timeout/batas halaman/sumber tak tersedia/struktur berubah, atau kanal `partial`/`truncated`. Sebagian baris tidak terbaca. |
| **Limit habis** | Sumber menolak memberi data lebih lanjut: HTTP 429, `Retry-After`, teks quota/throttling, atau penolakan 401/403/451 pada kanal yang tidak mengembalikan baris. |
| **Gagal dibaca** | Kanal `error` tanpa sinyal pembatasan (mis. `network_error`). |
| **Sumber menjawab, nol ulasan** | Kanal `empty` — bukan berarti aplikasi tidak punya ulasan. |
| **Belum ditarik** | Instance hangat tidak punya salinan kanal ini dan tidak ada percobaan yang tercatat. Bila riwayat percobaan masih ada, panel menilainya `Gagal dibaca`/`Limit habis` (dengan catatan "riwayat ada, salinan kanal tidak"), bukan `Belum ditarik`. |

- **Jeda (cooldown).** `Retry-After` yang dikirim sumber dipakai apa adanya; tanpa informasi itu bakunya 60 detik, dan dipangkas ke plafon 15 menit. Panel menampilkan jam "layak dicoba lagi", bukan angka tebakan. Jeda ini bersifat anjuran yang dibaca manusia — server tidak memblokir permintaan di dalam masa jeda, karena pembatasannya ada di sisi sumber, bukan di aplikasi ini.
- **Fallback jalur nyata.** Google Play membaca dua kumpulan (`id/id` lalu `en/us`) dan App Store membaca halaman ulasan rak **ditambah** feed pelanggan; panel menyatakan jalur mana yang membawa hasil ketika satu jalur terpotong, beserta jumlah baris per jalur.
- **Catatan percobaan.** Sepanjang 24 percobaan terakhir per kanal disimpan di memori instance serverless yang hangat (waktu, durasi, baris terbaca, halaman, kode HTTP, cache/tarikan baru). Ini bukan database: saat instance berganti, catatan mulai dari nol lagi — dan panel mengatakannya.
- **Tidak ada angka kuota palsu.** Google Play dan App Store tidak memaparkan sisa kuota untuk halaman publik, jadi kolom "Dilaporkan sumber" berisi angka yang benar-benar disebut toko (mis. jumlah ulasan tertulis/penilaian) dan `N/A` bila tidak ada. Selisih antara yang dilaporkan dan yang terbaca ditampilkan apa adanya.
- **Baris yang dibuang tidak senyap.** Baris yang diterima sumber tetapi tidak dapat dipakai (tanpa ID ulasan, atau item yang bukan ulasan) dihitung sebagai `skipped` di `coverage` kedua kanal. Jumlah itu tampil di panel Audit sebagai **Dibuang**, menjadi sinyal `struktur data berubah` di monitor, dan memaksa status kanal ke `partial` (`truncated: true`) — karena tidak ada satu baris pun yang boleh hilang tanpa jejak.
- **Aksi.** `Cek ulang` memanggil `{"action":"limits"}`; `Reset` dan `Segarkan` memanggil `{"action":"limits-reset"}` yang mengosongkan catatan percobaan sekaligus melepas cache kanal tersebut agar penarikan berikutnya benar-benar meminta ulang ke sumber. Ketiganya tetap melewati gerbang same-origin dan tidak menghapus data workspace di peramban.

## Struktur

```
api/sync.js              function Vercel, satu pintu API
lib/channels.mjs         katalog kanal (label + kelompok), aman dibundel ke klien
lib/corpus-engine.mjs    normalisasi, stopword, bobot, topik dari teks toko, agregat
lib/pain-points.mjs      frasa keluhan 2–4 token dari klaster negatif + pengelompokan jangkar
lib/googleplay.mjs       penemuan + penarikan ulasan Play publik
lib/appstore.mjs         penemuan iTunes + halaman ulasan + feed publik
lib/news.mjs             suaka RSS publik (Google News pencarian + NEWS_RSS_URLS)
lib/youtube.mjs          komentar + balasan lewat YouTube Data API v3
lib/reddit.mjs           utas lewat OAuth2 aplikasi Reddit
lib/apify.mjs            Facebook/Instagram/TikTok/X lewat actor Apify + sambung run
lib/name-match.mjs       tokenisasi + penyaring kandidat berdasar kecocokan nama
lib/limit-monitor.mjs    klasifikasi sinyal batas sumber + status kanal untuk panel
lib/db.mjs               akses PostgREST: tulis bertahap, penanda revisi, baca berhalaman
lib/sync-core.mjs        registry kanal, cache 1 jam, anggaran waktu, ringkasan
db/supabase.sql          skema tabel sentil_* + RLS + pencabutan hak anon
server.mjs               server statis lokal + penerusan /api/sync
build.mjs                bundel esbuild + salinan index.html/assets -> public/
src/                     React (workspace, dialog, 4 grafik, tabel ulasan, panel metode)
tests/                   node:test untuk mesin, kolektor, kanal, sinkronisasi, database, API, dan server
```

## Deploy ke Vercel

Mode tanpa kredensial berjalan apa adanya: `play`, `appstore`, dan `news` tidak memerlukan environment variable apa pun. Kanal lainnya aktif sendiri begitu variabelnya dipasang di Project Settings → Environment Variables (lihat tabel **Kanal**); tanpa itu kanal melaporkan `needs_setup`, bukan data kosong. `vercel.json` memasang header keamanan dan CSP `self` (font dilayani dari `assets/fonts/`, tanpa aset eksternal). Function `api/sync.js` memakai `maxDuration: 60` dengan anggaran internal Play 30 detik, App Store 24 detik, YouTube 26 detik, Reddit 20 detik, berita 18 detik, dan Apify 40 detik.

Penyimpanan memakai dua variabel saja: `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`. Keduanya hanya dibaca fungsi server — tidak ada kunci yang masuk ke bundel, dan CSP tetap `connect-src 'self'` karena peramban tidak pernah terhubung langsung ke Supabase. Langkah pasang: (1) jalankan `db/supabase.sql` di Supabase Studio → SQL Editor; (2) `vercel env add SUPABASE_URL` lalu `vercel env add SUPABASE_SERVICE_ROLE_KEY`; (3) deploy ulang. Tanpa keduanya, aplikasi menampilkan peringatan bahwa database belum terpasang alih-alih berpura-pura menyimpan.

Run actor Apify bersifat asinkron dan bisa melewati anggaran 40 detik. Dalam keadaan itu kolektor mengembalikan status `partial` beserta ID run-nya; ID itu ditahan di memori instance hangat dan penarikan berikutnya **menyambungkan** run yang sama, bukan memulai run baru yang menagih biaya lagi. Reset kanal juga melepas run yang tertahan.

Cache satu jam bersifat *per instance* function: setelah instance baru, penarikan pertama kembali penuh. Ini disengaja — tidak ada penyimpanan bersama yang perlu kredensial.

**`outputDirectory: "public"` bukan hiasan.** Deployment pernah gagal dengan `No Output Directory named "public" found after the Build completed` karena project Vercel ini menyetel output ke `public` sementara hasil build dulu ditulis di root repo. Setelah build diarahkan ke `public/`, muncul konsekuensi yang lebih penting: Vercel menyajikan **seluruh isi output directory apa adanya**, jadi kalau output-nya root, `lib/db.mjs`, `server.mjs`, dan `api/sync.js` ikut terunduh sebagai berkas statis. Karena itu sumber server berada di luar `public/` dan hanya hasil build yang masuk ke sana — diverifikasi dengan `GET /lib/db.mjs`, `/server.mjs`, `/src/App.jsx`, `/.env.local` yang semuanya 404 di URL produksi.

Terukur di function yang sudah ter-deploy (bukan localhost): `discover` 1,4 detik; satu penarikan nyata 21.205 ulasan Google Play selesai **48,8 detik** dan mengembalikan `engine: corpus-rating-v2` dengan 40 frasa keluhan dan 7 topik. Itu dekat ke langit-langit `maxDuration: 60`, dan `summary.reviews` di atas ~40.000 sudah terbukti memakan 38 detik di antaranya — korpus yang lebih besar perlu anggaran kolektor diturunkan, bukan plafon function dinaikkan.

## Keterbatasan

- Hanya ulasan tertulis publik yang dapat dibaca; halaman ulasan umumnya membatasi riwayat yang ditampilkan, dan aplikasi melaporkan hasil parsial apa adanya.
- Bahasa campuran (Indonesia/Inggris) diproses dalam satu korpus; bobot bersifat per-korpus, bukan model bahasa.
- Tanpa akun berarti tanpa ruang pribadi: semua workspace tersimpan di satu database bersama dan terlihat dari perangkat mana pun yang mencapai situs ini. Yang dipisahkan adalah sumber daya per fungsi server, bukan per pengguna.
- Angka toko bisa berubah antar penarikan; snapshot menyimpan waktu tarik agar selalu jelas data mana yang sedang dibaca.
- **Tidak ada grafik demografi (jenis kelamin, umur, wilayah).** Google Play dan App Store tidak pernah mengekspos data itu untuk ulasan publik, dan kanal sosial hanya membawa nama penulis komentar. Kolom `author` bisa kosong dan `language` null di sumber resmi; keduanya ditampilkan sebagai `N/A`. Memprediksi jenis kelamin dari nama penulis adalah menebak, dan seluruh angka aplikasi ini harus bisa ditelusuri ke baris sumber — jadi fitur itu sengaja tidak dibuat, bukan belum dibuat. Yang benar-benar tersedia di payload dan belum dimanfaatkan hanyalah `meta.appVersion` dan `meta.helpfulCount` (sebagian ulasan Play), dan itu bisa dijadikan grafik nyata kalau diperlukan.

## Pernyataan independensi

Aplikasi ini tidak berafiliasi dengan Google LLC, Apple Inc., atau penerbit aplikasi yang dianalisis. Nama dan angka aplikasi ditampilkan sebagai data publik dari halaman toko resmi; ikon toko digambar ulang secara umum, bukan menggunakan aset berhak milik toko.
