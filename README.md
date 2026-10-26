# Sentil — analisis ulasan otomatis

Platform analisis sentimen untuk ulasan publik Google Play dan App Store. Satu pintu data (`/api/sync`), satu mesin statistik yang mempelajari korpusnya sendiri, dan ruang analisis multi-workspace yang tersimpan di peramban.

## Yang tidak dilakukan aplikasi ini

- **Tidak ada API key, token, atau kredensial.** Tidak ada variabel lingkungan wajib untuk menjalankan analisis. Karena tidak ada kunci yang dipakai, tidak ada tempat penyimpanan kunci yang dikelola; yang dipantau adalah batas sumber publik itu sendiri (lihat panel **Source limits** pada menu **Platform**).
- **Tidak ada kamus manual.** Tidak ada daftar kata sentimen, daftar kata alay, atau kategori keluhan yang ditulis tangan.
- **Tidak ada pelabelan manual.** Semua label dihasilkan mesin dari data yang ditarik.
- **Tidak ada impor berkas.** Tidak ada unggah CSV/Excel; sumbernya hanya halaman publik toko aplikasi.
- **Tidak ada login atau akun.** Workspace disimpan di database server (Supabase) tanpa ruang pribadi per pengguna; `localStorage` peramban hanya menahan workspace mana yang sedang dibuka.
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
| `npm test` | `node --test tests` — 228 pengujian mesin, kolektor, kanal, sinkronisasi, monitor batas, frasa keluhan, gerombol label, penamaan kategori, lapisan sinyal, matriks perbandingan, hitung ulang filter dasbor, jepit tooltip chart, database, API, dan server. |

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

Versi mesin: `corpus-rating-v2` (lapisan frasa `pain-phrase-v3`, lapisan label `pain-label-v5`, lapisan sinyal `signal-v1`, lapisan penamaan `label-naming-v1`). Semua angka di bawah dipelajari dari dataset yang sedang dibuka, sehingga berbeda untuk setiap workspace. Angka yang masih berupa keputusan manusia **didaftarkan di `model.parameters`** dengan label `conventions` dan `structural`, bukan disembunyikan; lapisan label mendaftarkan aturannya sendiri di `model.painPoints.labelRules` dan lapisan sinyal di `model.signals.rules`.

1. **Normalisasi algoritmik.** HTML, entity, tautan, dan emoji dibuang; token di-normalisasi NFKD; huruf yang berulang tiga kali atau lebih direduksi (`ngelaggggg` → `ngelag`), dan pengulangan utuh direduksi (`sukasuka` → `suka`). Tidak ada daftar kata.
2. **Pemisah kosakata dari uji kemaknaan.** Suatu istilah dianggap beban kosakata kalau bobotnya **tidak bisa dibedakan dari nol** pada korpus ini — diukur dengan membandingkan |log-odds| terhadap simpangan baku estimasinya sendiri (delta method, α Jeffreys 0,5). Tidak ada fraksi frekuensi dan tidak ada daftar kata. Catatan hasil uji: aturan berbasis hukum Zipf dan aturan "df tinggi + z rendah" **keduanya terbukti lebih buruk** pada korpus nyata dan tidak dipakai.
3. **Bobot berkorelasi bintang.** Bobot kata adalah rasio log kemunculan dokumen pada ulasan 4–5★ terhadap 1–2★, dengan penghalusan Jeffreys (α = 0,5), penyusutan dukungan `n/(n+2)`, dan cekaman pada **kuantil empirik sebaran bobot korpus itu sendiri** (bukan angka ±4 tetap).
4. **Klasifikasi berbatas data.** Skor dokumen adalah jumlah bobot istilah terpelajari dibagi akar jumlah istilah yang cocok. Batas kelas adalah titik tengah median rendah dan median tinggi. Pita netralnya adalah jarak tipikal skor ulasan 3★ ke batas itu; **kalau korpus tidak punya ulasan 3★ yang bisa dinilai, pita netralnya nol** — versi lama mengarang pita `0,1 × selisih`, dan itu sudah dihapus karena mengada-ada.
5. **NSS.** `(positif − negatif) / terklasifikasi × 100`. Ulasan tanpa istilah terpelajari tetap dihitung sebagai baris dan dilaporkan sebagai *tak terklasifikasi*; tidak dipaksa ke kelas mana pun.
6. **Topik keluhan.** Namanya diambil dari **teks daftar aplikasi yang ditarik dari toko** (judul, ringkasan, deskripsi, kategori, catatan rilis dari Google Play, ditambah deskripsi iTunes). Sebuah istilah toko menjadi topik bila: panjangnya ≥ 6 huruf **atau** penulisannya seperti nama (huruf besar di tengah kalimat / akronim kapital, mis. `QRIS`, `EDC`); bukan bagian nama proyek yang sedang dianalisis; bukan bentuk berjulukan (`...nya`, `...pun`, `...kah`); muncul di ≥ 1% ulasan 1–2★; dan, kalau penulisannya biasa, lebih sering dipakai di keluhan daripada di pujian. Setiap topik lalu dihitung pada ulasan: jumlah 1–2★, 3★, 4–5★, dan tanpa bintang. Tidak ada kamus aspek buatan; kosakatanya berasal dari sumber.
7. **Frasa keluhan** (`pain-phrase-v3`, lapisan kedua di atas topik unigram). Semua urutan 2–4 token yang bersebelahan di ulasan 1–2★ menjadi kandidat; daftar pemisah kosakata dari poin 2 dipakai sebagai batas ujung frasa. Sebuah frasa dipertahankan hanya bila **dua hal**: kemunculannya bisa dibedakan dari nol (|log-odds| > simpangan bakunya sendiri, α Jeffreys 0,5) dan arahnya memang condong ke keluhan. Tidak ada ambang dukungan `max(3, 0,2%)` lagi — frasa yang terlalu tipis buktinya gugur dengan sendirinya. Bobot urut = `min(batas empirik, log-odds) × √jumlah ulasan negatif`. Frasa pendek yang tidak pernah muncul tanpa frasa panjang yang sudah diambil (`document frequency`-nya persis sama) dihitung sebagai varian (`droppedCovered`), bukan keluhan baru. Setiap frasa dikelompokkan di bawah **kata jangkar** yang dipilih dari statistik korpus (token dengan log-odds tertinggi di dalam frasa itu). Keluaran: `model.painPoints` dengan `anchors`, `items`, `pools`, `parameters`, `labels`, `labelMetrics`, `labelRules`, dan `metrics` yang melaporkan berapa kandidat gugur beserta alasannya (`droppedNotDistinct`, `droppedWrongDirection`, `droppedCovered`, `trimmedItems`).

   **Yang tetap keputusan manusia, dan itu disengaja:** panjang frasa 2–4 (definisi "ungkapan"), batas pencarian kosakata, dan anggaran tampilan 10 jangkar / 40 frasa. Pemilihan ordo n-gram secara otomatis sudah dicoba dua cara dan **dua-duanya gagal terukur** pada 32.610 ulasan nyata: PMUI mentah naik monoton antar ordo (0,42 → 5,63 → 12,72 → 20,28) dan PMUI inkremental juga (−5,74 → −2,10 → −0,42 → −0,07), keduanya artefak perbandingan — konteks yang lebih panjang memang selalu lebih prediktif — bukan sinyal. Nilainya dilaporkan lewat `model.painPoints.parameters` supaya bisa dinilai pembaca.

   Terverifikasi pada korpus nyata. Penarikan kanal toko (tanpa kunci API) atas Livin' by Mandiri menghasilkan 32.610 ulasan → 320.118 kandidat frasa, 40 dilaporkan di bawah 10 kata jangkar, dan **setiap frasa yang keluar adalah urutan token yang benar-benar ada di ulasan, dengan jumlah ulasan per frasa cocok sampai satuan terakhir** (dihitung ulang dari teks sumber, bukan dari angka mesin).

   **Perbaikan kinerja terukur (penting untuk klaim "tanpa sampling").** Penyisihan varian (`droppedCovered`) semula memindai *seluruh* frasa yang sudah diambil untuk setiap kandidat: kuadratik terhadap jumlah frasa yang lolos uji kemaknaan. Diukur per fase pada korpus nyata: langkah itu sendiri memakan **90 detik dari 91 detik total** untuk 8.000 ulasan, dan pada 45.000 ulasan mesinnya praktis tidak pernah selesai — inilah penyebab sebenarnya "penarikan data banyak" terasa menggantung, bukan database dan bukan kolektor. Sekarang frasa yang diambil diindeks dua tingkat (`document frequency` → urutan bersebelahan yang lebih pendek), jadi satu lookup menggantikan pemindaian. Hasilnya **identik byte per byte** dengan implementasi lama pada 2.000 / 4.000 / 8.000 ulasan nyata (kedua implementasi dijalankan berdampingan dan dibandingkan), dan waktunya turun ±97×: 93,9 s → 0,96 s pada 8.000 ulasan; lapisan frasa penuh pada 45.900 ulasan = 5,8 s. Satu penarikan ujung-ke-ujung (kolektor Play 32,4 s + seluruh analisis) selesai dalam **38,1 s untuk 44.400 ulasan**, heap 325 MB — di bawah batas 60 detik fungsi serverless.

8. **Label keluhan** (`pain-label-v5`, lapisan ketiga di atas frasa — `lib/label-clusters.mjs`). Inilah jawaban atas tabel yang sebelumnya mengarang: **tidak ada satu pun nama label yang ditulis tangan, dan nama label itu sendiri tidak dibentuk oleh model bahasa.** Semua yang terbaca sebagai "tema" di panel adalah kata yang benar-benar ditulis reviewers, dan enam hal dijaga oleh modul ini:
   - **Ikatan diuji, bukan dipilih.** Dua frasa digabung hanya kalau ada **lebih dari satu ulasan berbeda** memuat keduanya *dan* kelebihannya di atas kebetulan lolos uji **dua arah**: proporsi satu sampel dengan smoothing Jeffreys α = 0,5, latar bebas `dfB/N`, z > 1 — konvensi kemaknaan yang sama dipakai lapisan topik dan frasa, jadi tidak ada ambang baru yang dipilih tangan. Aturan dua-arah diuji berdampingan dengan aturan satu-arah pada kedua korpus nyata dan menghasilkan **keluaran yang persis sama**, jadi arah yang lebih ketat dipakai tanpa mengorbankan apa pun.
   - **Gerombol harus menutup (complete-linkage), bukan menyatu karena rantai.** Penggabungan dilakukan berurutan dari ikatan TERKUAT, dan sebuah gabungan diterima hanya kalau **setiap** frasa di kubu kiri punya ikatan yang lolos uji dengan **setiap** frasa di kubu kanan. Ini memperbaiki cacat yang terukur: dengan union-find biasa, penarikan 41.047 ulasan Shopee melahap **seluruh 40 frasa menjadi SATU label**. Dengan aturan penutupan yang sama, korpus yang sama menghasilkan 256 ikatan → 24 gabungan diterima → **187 gabungan ditolak karena tidak menutup** → 16 gerombol. Penolakan dihitung dan dikirim lewat `labelMetrics.rejectedMerges`, tidak dibuang diam-diam.
   - **Dukungan dihitung dari union ulasan, bukan penjumlahan frasa.** Satu ulasan yang menyebut tiga frasa tetap **satu** temuan. Terukur pada data nyata: gerombol `iklan` berisi 35 frasa yang jumlah mention-nya **4.228**, tetapi union ulasan 1–2★ yang benar adalah **2.880** — 1.348 "temuan" yang selama ini hanya pengulangan orang yang sama hilang. `ads` (62 + 43 + 63 mention) adalah **122** ulasan.
   - **Nama label dipilih mesin dari kata jangkar yang paling membedakan.** Setiap frasa sudah punya **jangkar** — token paling membedakan di dalam frasa itu, dihitung dari statistik korpus oleh lapisan frasa. Kandidat nama adalah jangkar yang **dijagokan lebih dari satu anggota**; kalau ada lebih dari satu kandidat, yang dipilih adalah yang **paling sedikit dipakai gerombol lain** (`spread` dihitung lintas seluruh gerombol korpus itu), jadi judulnya membedakan tema ini dari tema lain — bukan sekadar kata yang padat di keluhan. Tanpa calon yang memenuhi itu, frasa terberat dipakai apa adanya, dan satu istilah tidak boleh dipakai dua label. Tidak ada satu karakter pun yang dirangkai: `name` selalu sebuah token dari frasa tersimpan atau sebuah frasa tersimpan utuh, dan itu diuji.
   - **Arah dan kanal label dihitung dari baris yang sama.** Momentum = laju harian paruh kedua terhadap paruh pertama dari rentang tanggal korpus itu sendiri — konvensi yang sama dengan baris *Momentum* di matriks perbandingan, bukan jendela "30 hari" yang dipilih tangan; titik belahnya adalah tengah rentang teramati, dan pool keluhan tiap paruh (`earlyNegative`/`lateNegative`) dihitung dari indeks ulasan yang sama sehingga uji arah di lapisan sinyal memakai dasar yang identik dengan angka "per hari". Selain itu setiap label membawa `channels`: jumlah ulasan label itu per kanal **beserta pool keluhan kanal tersebut**, yang dibutuhkan lapisan sinyal untuk menguji "menumpuk di kanal X" dan bukan hanya mendeskripsikan.

   - **Kategori hanya boleh istilah yang ditulis penerbit.** Kolom `category` diisi dari kosakata halaman toko: sebuah istilah menjadi kategori gerombol kalau ia muncul di **lebih dari satu** ulasan gerombol itu *dan* porsinya di dalam gerombol bisa dibedakan dari porsinya di keluhan lain (uji `isSignal` yang sama, α Jeffreys 0,5). Yang menang adalah istilah dengan z terbesar, bukan yang paling sering muncul secara mentah. Terukur pada 73 ulasan Wondr merchant: dengan gerbang satu ulasan, 21 dari 40 gerombol "dapat" kategori — dan contohnya membuktikan itu kebetulan (`hari kerja` → `notifikasi`, ditopang 1 dari 1 ulasan). Dengan gerbang dua ulasan yang sama dipakai seluruh modul ini, hasilnya **0 dari 40**: pada 18 keluhan tidak ada istilah toko yang menopang satu tema, dan panelnya menampilkan kosong, bukan nama karangan.

   Keluaran: `model.painPoints.labels` (dengan `name`, `nameSource`, `evidence`, `reviewCount`, `share`, `praiseCount`, `early`/`late`/`undated`/`momentum`, `channels`, `category`, dan `phrases` **seluruh** anggota), `labelMetrics` (`links`, `merges`, `rejectedMerges`, `clusters`, `reportedLabels`, `trimmedLabels`, `singletons`, `namedFromTerm`, `categorized`, `trend`), dan `labelRules`. Tidak ada angka yang harus disetel di antarmuka: satu-satunya konstanta tetap adalah "lebih dari satu ulasan", yang adalah definisi bukti — sama seperti "dua kata" adalah definisi frasa.

   **Verifikasi fidelitas pada dua korpus nyata** (tarikan lewat URL produksi, mesin yang sama dijalankan di luar server): **Shopee Indonesia** 33.600 ulasan Google Play → pool 1–2★ 13.129, 507.916 kandidat frasa → 30.656 lolos uji → 40 dilaporkan → **36 ikatan, 4 gerombol** (`iklan` 2.756 ulasan = 20,99% pool; `ads` 119; `jelek bgt` 52; `your ads` 38). **Wondr merchant** 73 ulasan → pool 1–2★ 18 → 40 frasa, **0 ikatan, 40 gerombol beranggota satu**: korpus sekecil ini tidak punya cukup ulasan berulang untuk menggabungkan apa pun, dan panelnya melaporkan itu apa adanya, alih-alih memaksakan kategori. Keempat label Shopee dan keduabelas label Wondr **cocok sampai satuan terakhir** dengan penghitungan ulang langsung dari teks mentah (token hasil normalisasi, urutan bersebelahan), termasuk jumlah pujian 4–5★-nya. Waktu analisis seluruh korpus Shopee: **3,2 detik** (4,7 s pada penarikan sebelumnya, mesin yang sama).

   Penarikan ulang yang lebih besar lewat antarmuka produksi (35.797 ulasan, tersimpan di Supabase) menghasilkan **struktur gerombol yang sama persis** — 36 ikatan, 4 label, anggota tetap 35 frasa untuk `iklan` — sementara dukungannya ikut naik bersama datanya: 2.756 → **2.880** ulasan berbeda (20,73% pool) dan pujian 252 → 262; `ads` 119 → 122. Tidak ada label baru yang muncul dari kosakata yang tidak tersedia pada penarikan pertama. Nama yang terbaca di panel sekarang: **iklan**, **ads**, `jelek bgt`, `your ads` — dua yang pertama adalah jangkar yang dijagokan banyak anggota (`namedFromTerm` = 2), dua yang terakhir jatuh ke frasa utuh karena gerombolnya beranggota satu. Arah dari rentang 2025-07-17 sampai 2026-10-26 (34.830 ulasan bertanggal): `iklan` **4,24×/hari** (552 → 2.328), `ads` **4,83×/hari** (21 → 101), `your ads` **5,36×/hari** (6 → 32), `jelek bgt` 1,85×/hari. Semua dukungan dan arah itu dihitung ulang dari teks mentah dan cocok sampai satuan terakhir.

   Catatan hasil yang perlu dibaca jujur: penutupan lengkap membuat setiap anggota satu gerombol **terbukti berbagi ulasan** dengan setiap anggota lain — itu yang dijamin mesin. Yang tetap **tidak** diklaim adalah bahwa mereka membahas penyebab yang sama. Nama label selalu **kata yang sungguh-sungguh tertulis di ulasan** (jangkar bersama anggotanya, atau frasa utuh kalau tidak ada), tidak pernah kalimat hasil rangkuman — dan daftar lengkap anggota selalu ditampilkan supaya pembaca bisa menilai isinya sendiri.

9. **Sinyal analis** (`signal-v1`, lapisan keempat — `lib/insights.mjs`). Permintaan yang sama muncul berulang:分析报告 yang terbaca seperti tulisan analis, bukan seperti tumpukan tabel. Lapisan ini menulis kalimatnya sendiri dari angka korpus, dan aturannya dibuat supaya tidak bisa mengarang:
   - **Satu baris = satu uji.** Setiap sinyal membandingkan dua proporsi (paruh waktu vs paruh waktu, kanal vs seluruh kanal lain, pujian vs keluhan) dengan `isSignal()` yang dipakai lapisan frasa dan topik: |log-odds| harus melampaui simpangan baku estimasinya sendiri. Gagal uji → tidak ada baris, bukan baris dengan kata "mungkin".
   - **Urutan laporan, bukan urutan array.** Temuan terbesar lebih dulu, lalu arah waktu (satu sinyal naik dan satu turun — yang terkuat di arahnya masing-masing), lalu konsentrasi kanal (maksimal dua, dan tidak boleh dua-duanya dari label yang sama), lalu pembacaan tandingan, lalu struktur gerombol, lalu batas klaim. Di dalam kelompok, yang ujinya paling kuat berbicara lebih dulu.
   - **Angka kalimat = angka data.** Setiap sinyal membawa `facts` bertipe (`count`/`percent`/`ratio`/`text`) dan kalimatnya hanya merangkai nilai yang ada di `facts`. Sebuah pengujian mengekstrak **setiap token angka** dari setiap kalimat yang dikirim dan menuntutnya cocok dengan salah satu `facts` — dan sebaliknya, setiap `facts` harus benar-benar tertulis di kalimatnya. Tidak ada pembacaan yang lolos kalau ia menambahkan angka yang tidak diukur.
   - **Yang tidak bisa disimpulkan juga ditulis.** Gerombol yang tidak bisa disatukan (`links = 0`), gabungan yang ditolak aturan penutupan, gerombol di luar anggaran tampil, keluhan yang tidak mendapat frasa, dan ulasan yang tidak terklasifikasi — semuanya menjadi sinyal `structure`/`coverage`, supaya panel yang tipis tetap menjelaskan dirinya sendiri.
   - **Koridor tetap, angka tidak.** Anggaran tampil 8 baris mengikuti pola lapisan frasa/label dan pemangkasan dilaporkan lewat `metrics.candidates`/`reported`/`trimmed`. Nama kanal di-prettify dari katalog kanal, dan `refs` tiap sinyal menunjuk id label/kanal yang benar-benar ada — diverifikasi pengujian terhadap model yang dikirim.

   Keluaran: `model.signals` dengan `version`, `status`, `rules`, `basis` (jumlah ulasan, jumlah label, kedua pool, rentang arah dan pool tiap paruh), `metrics`, dan `items`. Panel **Analyst signals** di Dashboard dan panel **Sinyal analis** di Metode hanya membaca lapisan ini; keduanya menampilkan `facts` apa adanya dan memakai bahasa Inggris untuk teks sinyal karena teks itu bagian dari data yang dihitung di server. Snapshot lama (sebelum `signal-v1`) menampilkan keadaan "belum ada" yang jujur, bukan sinyal kosong yang dikarang.

10. **Penamaan kategori oleh model** (`label-naming-v1`, lapisan kelima — `lib/label-naming.mjs`). Kolom **Category** di panel Complaint labels adalah satu-satunya tempat di aplikasi ini yang boleh berisi kata yang tidak ditulis siapa pun. Itu pilihan yang disengaja dan dibatasi empat hal:
    - **Model tidak pernah melihat angka.** Yang dikirim ke Gemini hanya `id` gerombol dan frasa verbatim reviewers (maksimal 6 frasa per gerombol, 40 gerombol per penarikan). Sebuah pengujian menuntut bahwa badan permintaan **tidak memuat satu digit pun** — jadi model tidak bisa mengubah, membulatkan, atau mengulang angka yang salah, karena angkanya memang tidak ada di sana.
    - **Yang kembali hanya boleh id yang dikirim.** Id asing dibuang; nama yang mengandung angka ditolak; nama di luar 2–60 karakter ditolak. Model tidak bisa menambah gerombol, dan tidak bisa menyelundupkan metrik ke kolom interpretasi.
    - **Sumber nama selalu tertulis.** Baris yang memakai nama model menyebut modelnya di tooltip dan di catatan kaki panel; baris yang memakai istilah toko berkata "dari teks toko"; baris yang tidak lolos apa pun menampilkan `—`/N/A, bukan nama paling mirip.
    - **Bukan bagian dari pengukuran.** Penamaan terjadi sekali per penarikan, setelah seluruh statistik selesai, dan hasilnya disimpan di snapshot. Tanpa `GEMINI_API_KEY`, atau saat kuota habis / respons tidak terbaca, lapisan ini melapor `skipped`/`failed` dan panel jatuh ke nama korpus — **penarikan data tidak pernah gagal karena penamaan**, dan tidak ada metrik yang berubah nilainya.

    Keluaran: `model.painPoints.naming` dengan `version`, `status` (`named`/`skipped`/`failed`), `provider`, `model`, `clusters`, `named`, `names` (`{ id: { category, subLabel } }`), dan `reason` saat tidak jadi. Kunci dibaca dari env server (`GEMINI_API_KEY`, model bisa diganti lewat `GEMINI_MODEL`), tidak pernah masuk bundle klien, log, atau berkas JSON yang diunduh.

### Batas klaim (jujur soal ini)

- Bintang 1–5 adalah **sinyal lemah**, bukan label emas. Karena bobot dipelajari dari bintang, mesin ini **tidak sepenuhnya unsupervised** secara ketat.
- **AUC yang ditampilkan adalah in-sample** — dihitung pada data yang sama yang membentuk bobot. Angka itu mengukur pemisahan internal, **bukan akurasi luar sampel**, dan tidak ada klaim kalibrasi probabilitas.
- Topik adalah istilah yang ditawarkan penerbit di halaman tokonya, dihitung pada teks ulasan. Ini **bukan penyebab produk yang terverifikasi**, dan satu ulasan dapat menyebut beberapa topik sehingga angkanya beririsan (tidak menjumlah jadi 100%).
- Frasa keluhan hanya menangkap urutan 2–4 token **setelah** normalisasi, jadi ejaan yang berbeda untuk maksud yang sama tidak disatukan secara semantik (`tertahan` dan `menggantung` tetap dua frasa). Batas cekaman membuat frasa berdukungan besar berdesakan di skor yang sama, jadi urutan teratas dibaca sebagai "paling banyak dikeluhkan", bukan "paling parah".
- **Kolom Category boleh berupa interpretasi — dan itu ditulis.** Nama kategori dari `label-naming-v1` adalah kata yang tidak diucapkan reviewer mana pun; yang dijamin hanyalah bahwa ia merujuk ke gerombol yang benar dan tidak membawa angka. Klaim yang sah: "mesin mengelompokkan keluhan ini bersama-sama, dan model menyebutnya X". Yang **tidak** diklaim: bahwa X adalah penyebab produk yang terverifikasi. Kolom lain di tabel yang sama (ulasan, porsi, pujian, arah, kanal) tetap pengukuran.
- **Label gerombol mengukur berbagi ulasan, bukan berbagi penyebab.** Dua frasa disatukan karena ulasan yang sama memuat keduanya, bukan karena mesin menyimpulkan keduanya keluhan yang sama; aturan penutupan menjamin setiap pasangan anggota berbagi ulasan, tetapi tidak menjamin keduanya keluhan yang sama. Nama label adalah token/frasa yang sungguh tertulis di korpus (dijamin pengujian), tetapi **memilih satu kata sebagai judul** tetap sebuah ringkasan: klaim yang sah adalah "kata ini dijagokan lebih dari satu anggota gerombol ini dan paling sedikit dipakai gerombol lain", bukan "penyebabnya sudah dipastikan". Pada korpus kecil tidak ada ikatan yang lolos (terukur: 73 ulasan → 0 ikatan), jadi tabel label menjadi daftar frasa beranggota satu — itu keadaan bukti yang sebenarnya, bukan kegagalan pencarian. Arah label juga hanya bisa dihitung kalau paruh pertama rentang punya ulasan berlabel; kalau tidak, kolom arahnya kosong, bukan nol.
- **Sinyal analis adalah kesimpulan statistik, bukan penjelasan kausal.** "Menumpuk di Google Play" berarti porsi ulasan label itu di kanal tersebut tidak bisa dibedakan dari kebetulan dengan porsi di kanal lain; ia tidak menyatakan penyebabnya platform. Sinyal `shared` justru ditulis ketika ujis **gagal** membedakan keluhan dan pujian — itu alasan untuk tidak menyebutnya kerusakan, bukan bukti bahwa semuanya baik-baik saja. Satu arah waktu saja yang ditampilkan per arah (naik/turun) supaya daftar tidak mengulang angka yang sama, dan baris di luar anggaran tampil tetap dihitung di `metrics`.
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

Di atas keempat chart, panel **Analyst signals** (`src/components/Signals.jsx`) menampilkan baris analisis yang ditulis lapisan `signal-v1`: satu kartu per pembacaan, dengan judul, kalimat penjelas, dan `facts` yang ditampilkan apa adanya di bawahnya (porsinya di kanal, laju per paruh waktu, jumlah ulasan). Tidak ada satu pun kalimat di panel itu yang ditulis di berkas klien — isinya datang dari model, dan klien hanya memformat angkanya. Di bawahnya, panel **Complaint labels** (`src/components/PainLabels.jsx`) menampilkan hasil lapisan label: satu baris per temuan, namanya kata yang benar-benar ditulis reviewers (jangkar bersama anggotanya yang paling sedikit dipakai gerombol lain, atau frasa utuh kalau tidak ada), dan kolom `1–2★` adalah **union ulasan berbeda** — bukan jumlah frasa. Kolom `Trend` adalah laju harian paruh kedua terhadap paruh pertama dari rentang tanggal korpus itu sendiri (naik = memburuk, hijau = mereda; `—` berarti tidak ada dasar paruh pertama, bukan nol). Barisnya dapat dibuka untuk melihat seluruh frasa anggota beserta jumlah mention-nya, plus satu baris yang menyebut kedua angka itu berdampingan supaya pembaca bisa melihat sendiri berapa "temuan" yang akan muncul kalau ulasan dihitung per frasa. Kolom `Category` adalah satu-satunya yang boleh berupa interpretasi: isinya nama dari model (`label-naming-v1`) atau istilah halaman toko yang lolos uji kepadatan, dan tooltip setiap baris menyebut sumbernya — kalau tidak ada yang lolos, kolomnya kosong, bukan diisi nama paling mirip. Tidak ada satu pun ambang angka yang ditampilkan di dasbor — aturan pembentuknya ditulis dalam kalimat, dan angka persisnya tetap ikut terkirim di berkas JSON hasil Ekspor. Angka gerombol yang terpangkas dan jumlah yang beranggota satu ikut tertulis di catatan kaki panel, dan isian kosong punya tiga keadaan berbeda yang dijelaskan apa adanya: korpus belum punya frasa, snapshot dibuat sebelum lapisan label versi ini (perlu ditarik ulang), atau frasanya ada tapi tidak ada ikatan yang lolos uji. Menu **Metode** menampilkan versi rincinya (langkah 05 untuk gerombol, langkah 06 untuk sinyal) termasuk panel **Sinyal analis** yang memuat rules lapisan sinyal, basis hitungannya, dan kolom `Kanal` pada tabel label.

Kontrak tooltip (`ChartTooltip`): panelnya **solid** (`bg-slate-950`, tanpa `backdrop-blur`) supaya warna bar tidak menembus teksnya; tingginya diukur sendiri, bukan diduga; dan posisinya dijepit ke **jendela gulir yang sedang terlihat** — bukan ke lebar konten — sehingga tooltip tidak pernah menutupi kepala kartu, tidak pernah keluar dari kartu di bar paling kiri/kanan, dan tidak menambah lebar gulir palsu. Jepitannya ada di `tooltipAnchor` (`chart-utils.js`) dan diuji per posisi; `DailyTrend` dan `PlatformBars` membacanya dari `scrollLeft` DOM saat render, bukan dari state hasil event `scroll` — event yang tertunda membuat tooltip menjepit ke offset lama, dan itu terukur di URL live pada korpus 29.707 ulasan: hari yang sedang difokus ada di dalam jendela, tapi tooltipnya keluar 1.029 px ke kiri.

Setiap keadaan kosong ditampilkan sebagai keadaan kosong yang menjelaskan alasannya (kanal tidak dipilih, sumber mengembalikan nol ulasan, kanal gagal, ambang statistik belum terpenuhi, atau kombinasi filter yang memang tidak punya baris) — bukan angka nol yang menyamar sebagai hasil.


## Compare (matriks lintas project)

Menu **Compare** membandingkan hingga 12 project sekaligus, head-to-head dalam satu tabel. Matriksnya dihitung **di server** (`lib/compare-engine.mjs`) dari `summary` + `model` yang sudah tersimpan di `sentil_dataset` — bukan dengan mengirim seluruh ulasan ke peramban, karena lima project @30.000 ulasan adalah 150.000 baris lewat jaringan. Karena itu hanya kolom ringkas yang dibaca (`loadDatasetHeads`), dan ia diuji secara eksplisit agar tidak pernah jatuh ke jalur baca penuh.

- **Acuan delta = median lintas kolom yang dipilih.** Tidak ada baseline yang ditulis tangan: mengubah isi matriks mengubah acuannya. Arah "mana yang lebih baik" adalah sifat semantik metrik (NSS naik itu baik, pangsa 1★ turun itu baik), dan `volume`/`velocity` sengaja ditandai *netral* — lebih banyak ulasan bukan berarti lebih bagus.
- **Baris metrik:** volume, jumlah terklasifikasi, cakupan, kecepatan ulasan/hari, momentum, NSS, tri-state %, rata-rata bintang, pangsa 1★, rating toko, tak terklasifikasi. Tiap sel menampilkan nilai, delta terhadap median, dan peringkat.
- **Kecepatan dan momentum** dihitung dari rentang tanggal project itu sendiri; momentum = paruh kedua ÷ paruh pertama dari rentang teramati, sehingga tidak ada jendela "30 hari" yang harus dipilih.
- **Dua populasi 1★ tidak pernah digabung:** pangsa 1★ dari ulasan yang terbaca dan pangsa 1★ dari histogram toko dilaporkan sebagai baris terpisah.
- **Heatmap pain point** adalah gabungan frasa yang mesin korpus laporkan per project. Sel kosong berarti *tidak terdeteksi*, bukan nol.
- **Leaderboard NSS** memberi jarak ke pemuncak; **Widest gaps** hanya menyebut pasangan kolom yang benar-benar berbeda — kalau dua kolom identik, insight-nya kosong, tidak dikarang.
- **Tanpa database, matriks tidak dikarang.** Server menjawab `compare` dengan `db.reachable: false` dan array kosong; peramban menunjukan "Comparison unavailable" dan berhenti. Penjaga `attempted` di `CompareView` mencatat kunci pilihan yang sudah dicoba supaya effect otomatis tidak memicu permintaan berikutnya — tanpa penjaga itu jalur kosong ini mengulang permintaan tanpa batas (terukur **33 permintaan `/api/sync` dalam 15 detik** di URL produksi sebelum diperbaiki).
- **Bentuk kawat matriks adalah objek biasa, bukan `Map`.** Sel heatmap (`cells`) dulunya `Map`: di dalam proses ia terbaca, tapi `JSON.stringify` mengubahnya menjadi `{}` tanpa peringatan, sehingga peramban kehilangan semua sel dan view-nya crash. Satu pengujian kini melakukan round-trip `JSON.parse(JSON.stringify(...))` dan menuntut `projectCount` tetap sama dengan jumlah sel.

Catat batasnya: kecepatan ulasan diukur dari ulasan yang benar-benar terbaca aplikasi ini, dan paginasi toko mengambil yang terbaru lebih dulu, jadi periode lama bisa kurang terwakili. Batas 12 kolom dan 24 baris heatmap adalah anggaran tampilan, dan jumlah yang dipangkas dilaporkan (`painPointTrimmed`).

Dua kali dijalankan pada data nyata. **Lewat URL produksi, hasil tersimpan di Supabase** (dua project toko yang ditarik langsung): 14 baris metrik dan 24 baris heatmap per kolom, dan karena kedua kolom memang berisi data aplikasi yang sama, seluruh delta muncul sebagai ±0 — matriks tidak mengarang perbedaan. **Lewat penyimpanan berkas lokal** (tiga project): 115 frasa keluhan lintas project dengan 24 ditampilkan dan 91 dilaporkan terpangkas, 9 insight selisih, 3 catatan batas. Jalur yang terakhir ini juga memperlihatkan perbedaan yang seharusnya terlihat: pangsa 1★ dari ulasan yang terbaca (0,287) dan dari histogram toko (0,0877) untuk aplikasi yang sama berbeda jauh karena paginasi toko mengirim ulasan terbaru — keduanya memang populasi berbeda, dan tidak pernah disatukan.

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
lib/label-clusters.mjs   gerombol frasa jadi label (ikatan dua arah + penutupan lengkap + dukungan union ulasan)
lib/insights.mjs         sinyal analis: uji dua proporsi atas label, kanal, dan cakupan
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

Mode tanpa kredensial berjalan apa adanya: `play`, `appstore`, dan `news` tidak memerlukan environment variable apa pun. Kanal lainnya aktif sendiri begitu variabelnya dipasang di Project Settings → Environment Variables (lihat tabel **Kanal**); tanpa itu kanal melaporkan `needs_setup`, bukan data kosong. `vercel.json` memasang header keamanan dan CSP `self` (font dilayani dari `assets/fonts/`, tanpa aset eksternal). Function `api/sync.js` memakai `maxDuration: 300` dengan anggaran internal Play 30 detik, App Store 24 detik, YouTube 26 detik, Reddit 20 detik, berita 18 detik, dan Apify 40 detik.

Penyimpanan memakai dua variabel saja: `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`. Keduanya hanya dibaca fungsi server — tidak ada kunci yang masuk ke bundel, dan CSP tetap `connect-src 'self'` karena peramban tidak pernah terhubung langsung ke Supabase. Langkah pasang: (1) jalankan `db/supabase.sql` di Supabase Studio → SQL Editor; (2) `vercel env add SUPABASE_URL` lalu `vercel env add SUPABASE_SERVICE_ROLE_KEY`; (3) deploy ulang. Tanpa keduanya, aplikasi menampilkan peringatan bahwa database belum terpasang alih-alih berpura-pura menyimpan.

Run actor Apify bersifat asinkron dan bisa melewati anggaran 40 detik. Dalam keadaan itu kolektor mengembalikan status `partial` beserta ID run-nya; ID itu ditahan di memori instance hangat dan penarikan berikutnya **menyambungkan** run yang sama, bukan memulai run baru yang menagih biaya lagi. Reset kanal juga melepas run yang tertahan.

Cache satu jam bersifat *per instance* function: setelah instance baru, penarikan pertama kembali penuh. Ini disengaja — tidak ada penyimpanan bersama yang perlu kredensial.

**`outputDirectory: "public"` bukan hiasan.** Deployment pernah gagal dengan `No Output Directory named "public" found after the Build completed` karena project Vercel ini menyetel output ke `public` sementara hasil build dulu ditulis di root repo. Setelah build diarahkan ke `public/`, muncul konsekuensi yang lebih penting: Vercel menyajikan **seluruh isi output directory apa adanya**, jadi kalau output-nya root, `lib/db.mjs`, `server.mjs`, dan `api/sync.js` ikut terunduh sebagai berkas statis. Karena itu sumber server berada di luar `public/` dan hanya hasil build yang masuk ke sana — diverifikasi dengan `GET /lib/db.mjs`, `/server.mjs`, `/src/App.jsx`, `/.env.local` yang semuanya 404 di URL produksi.

Terukur di function yang sudah ter-deploy (bukan localhost): `discover` 1,4 detik; satu penarikan nyata 21.205 ulasan Google Play selesai **48,8 detik** dan mengembalikan `engine: corpus-rating-v2` dengan 40 frasa keluhan dan 7 topik. Angka itu dulu mentok di plafon: dengan `maxDuration: 60` penarikan Spotify selesai dalam 57,1 detik (sisa 3 detik) dan penarikan Joox butuh **74,5 detik** — artinya akan dibunuh di tengah jalan. Plafon dinaikkan ke 300 detik dan diuji ulang: permintaan 74,5 detik sekarang mengembalikan 200 dengan 36.750 ulasan. Anggaran internal kolektor tetap membatai sendiri, jadi yang berubah hanya batas platform, bukan jumlah yang dibaca.

## Keterbatasan

- Hanya ulasan tertulis publik yang dapat dibaca; halaman ulasan umumnya membatasi riwayat yang ditampilkan, dan aplikasi melaporkan hasil parsial apa adanya.
- Bahasa campuran (Indonesia/Inggris) diproses dalam satu korpus; bobot bersifat per-korpus, bukan model bahasa.
- Tanpa akun berarti tanpa ruang pribadi: semua workspace tersimpan di satu database bersama dan terlihat dari perangkat mana pun yang mencapai situs ini. Yang dipisahkan adalah sumber daya per fungsi server, bukan per pengguna.
- Angka toko bisa berubah antar penarikan; snapshot menyimpan waktu tarik agar selalu jelas data mana yang sedang dibaca.
- **Tidak ada grafik demografi (jenis kelamin, umur, wilayah).** Google Play dan App Store tidak pernah mengekspos data itu untuk ulasan publik, dan kanal sosial hanya membawa nama penulis komentar. Kolom `author` bisa kosong dan `language` null di sumber resmi; keduanya ditampilkan sebagai `N/A`. Memprediksi jenis kelamin dari nama penulis adalah menebak, dan seluruh angka aplikasi ini harus bisa ditelusuri ke baris sumber — jadi fitur itu sengaja tidak dibuat, bukan belum dibuat. Yang benar-benar tersedia di payload dan belum dimanfaatkan hanyalah `meta.appVersion` dan `meta.helpfulCount` (sebagian ulasan Play), dan itu bisa dijadikan grafik nyata kalau diperlukan.

## Pernyataan independensi

Aplikasi ini tidak berafiliasi dengan Google LLC, Apple Inc., atau penerbit aplikasi yang dianalisis. Nama dan angka aplikasi ditampilkan sebagai data publik dari halaman toko resmi; ikon toko digambar ulang secara umum, bukan menggunakan aset berhak milik toko.
