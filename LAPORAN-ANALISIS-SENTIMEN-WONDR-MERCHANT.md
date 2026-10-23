# LAPORAN ANALISIS SENTIMEN KOMPREHENSIF
## Aplikasi: wondr merchant by BNI
**Periode Observasi:** 20 Agustus – 23 Oktober 2026  
**Tanggal Laporan:** 23 Oktober 2026  
**Disusun oleh:** Lead Data Scientist & Senior CX Analyst

---

## RINGKASAN EKSEKUTIF

Laporan ini menyajikan analisis sentimen mendalam terhadap aplikasi **wondr merchant by BNI** (paket: `id.bni.wfb`), aplikasi merchant QRIS resmi PT Bank Negara Indonesia (Persero) Tbk. Analisis mencakup data dari **Google Play Store** dan **Apple App Store**, dengan total **43 ulasan tertulis** yang berhasil dikumpulkan dan dianalisis.

> **Cakupan data:** Seluruh **43 ulasan tertulis** yang dapat diakses publik pada snapshot ini dianalisis tanpa sampling. Google Play menampilkan **35 teks dari 68 penilaian listing**; 33 penilaian tanpa teks tidak mempublikasikan nama atau isi sehingga tidak dapat dihitung. App Store menampilkan **8 teks dari 15 penilaian**. Kekosongan ini bukan sentimen netral dan bukan bukti tidak ada keluhan. ID paket terverifikasi adalah `id.bni.wfb`, **bukan** `id.bni.wondrmerchant`. Data ditarik melalui tombol **Tarik Analisa** ke server lokal secara batch sesuai permintaan, bukan live feed.

### Temuan Kunci:
- **Overall App Health Rating: 3.72/5.0** (berdasarkan sampel ulasan)
- **Net Sentiment Score (NSS): +23.3 poin** (cenderung positif)
- **60.5% ulasan positif**, 37.2% negatif, 2.3% netral
- **Pendaftaran (Onboarding)** merupakan pain point utama dengan 6 keluhan
- **Media sosial, forum, dan web:** belum tersedia melalui konektor; statusnya **N/A / tidak dicoba**, bukan nol keluhan

---

## 1. METRIK DASHBOARD EKSEKUTIF & RATING INDEX

### 1.1 Volume Ulasan per Kanal

| Kanal | Status | Jumlah Ulasan | Rating Listing | Sampel Dianalisis |
|-------|--------|---------------|----------------|-------------------|
| **Google Play Store** | ✅ Tersedia | 68 rating (35 teks ulasan) | 3.9/5 | 35 ulasan |
| **Apple App Store** | ✅ Tersedia | 15 rating (8 teks ulasan) | 4.7/5 | 8 ulasan |
| **Facebook** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |
| **Instagram** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |
| **TikTok** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |
| **YouTube** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |
| **X (Twitter)** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |
| **Forum (Kaskus/Reddit)** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |
| **Blog/Berita** | ❌ Tidak tersedia | N/A | N/A | 0 ulasan |

**Total Volume Ulasan Dianalisis: 43 ulasan**

### 1.2 Overall App Health Rating

**Combined Weighted Score: 3.72/5.0**

Perhitungan berdasarkan rata-rata tertimbang dari sampel ulasan aktual:
- Google Play: 35 ulasan × rata-rata 3.43 = 120 poin
- Apple App Store: 8 ulasan × rata-rata 5.00 = 40 poin
- Total: 160 poin ÷ 43 ulasan = **3.72/5.0**

**Catatan:** Angka ini berdasarkan sampel ulasan tertulis, bukan seluruh rating listing (68 Play + 15 Apple = 83 rating).

### 1.3 Breakdown Rating per Kanal

#### Google Play Store
- **Average Rating (sampel):** 3.43/5.0
- **Sebaran Bintang:**
  - ★★★★★ (5 bintang): 18 ulasan (51.4%)
  - ★★★★☆ (4 bintang): 2 ulasan (5.7%)
  - ★★★☆☆ (3 bintang): 2 ulasan (5.7%)
  - ★★☆☆☆ (2 bintang): 3 ulasan (8.6%)
  - ★☆☆☆☆ (1 bintang): 10 ulasan (28.6%)

#### Apple App Store
- **Average Rating (sampel):** 5.00/5.0
- **Sebaran Bintang:**
  - ★★★★★ (5 bintang): 8 ulasan (100%)
  - ★★★★☆ hingga ★☆☆☆☆: 0 ulasan

**Peringatan:** Sampel Apple sangat kecil (8 ulasan) dan seluruhnya positif. Ini **tidak membuktikan** pengalaman iOS lebih baik daripada Android.

#### Media Sosial & Web
- **Social Perception Score:** N/A (kanal sosial belum memiliki konektor; data tidak dikumpulkan)
- **Web Review Index:** N/A (kanal web belum memiliki konektor; data tidak dikumpulkan)

### 1.4 Rasio Sentimen & Net Sentiment Score

| Metrik | Nilai |
|--------|-------|
| **Total Ulasan** | 43 |
| **Ulasan Positif** | 26 (60.5%) |
| **Ulasan Negatif** | 16 (37.2%) |
| **Ulasan Netral** | 1 (2.3%) |
| **Net Sentiment Score (NSS)** | **+23.3 poin** |

**Formula:** NSS = (% Positif − % Negatif) = 60.5% − 37.2% = **+23.3 poin**

**Interpretasi:** NSS positif menunjukkan sentimen cenderung positif, namun 37.2% ulasan negatif tetap memerlukan perhatian serius.

### 1.5 Top 10 Active Voices (Pengguna Paling Aktif)

**Catatan:** Seluruh 43 pengguna memiliki 1 ulasan masing-masing. Tidak ada pengguna yang memberikan multiple reviews. Berikut 10 pengguna terbaru berdasarkan tanggal:

| No | Username | Platform | Rating | Sentimen | Tanggal |
|----|----------|----------|--------|----------|---------|
| 1 | Prasenda Valentina Ramadhani | Google Play | 1★ | Negatif | 2026-10-21 |
| 2 | Yessi Ma | Google Play | 2★ | Negatif | 2026-10-21 |
| 3 | Titin Rohayah | Google Play | 4★ | Positif | 2026-10-20 |
| 4 | Muhammad K. Alfikhri | Google Play | 1★ | Negatif | 2026-10-16 |
| 5 | Bos AteQ | Google Play | 2★ | Negatif | 2026-10-10 |
| 6 | Boy Antoni | Google Play | 2★ | Negatif | 2026-10-08 |
| 7 | Tanamo | Google Play | 4★ | Negatif | 2026-10-04 |
| 8 | Ninis Sweet | Google Play | 1★ | Negatif | 2026-10-01 |
| 9 | Siti asiah | Google Play | 5★ | Positif | 2026-09-30 |
| 10 | Coky_04 HM | Google Play | 5★ | Positif | 2026-09-25 |

---

## 2. DEEP-DIVE PAIN POINTS & ROOT CAUSE ANALYSIS

### 2.1 Distribusi Keluhan Negatif

**Total Ulasan Negatif: 16 ulasan (37.2%)**

| Kategori Isu | Jumlah | % dari Negatif | Severity |
|--------------|--------|----------------|----------|
| **Pendaftaran belum tuntas** | 6 | 37.5% | 🔴 Critical |
| **Notifikasi & pembaruan laporan** | 4 | 25.0% | 🟠 High |
| **Akses & performa aplikasi** | 4 | 25.0% | 🟠 High |
| **Migrasi kurang jelas** | 3 | 18.8% | 🟡 Medium |
| **Penanganan layanan** | 1 | 6.3% | 🟡 Medium |

**Catatan:** Satu ulasan dapat masuk ke beberapa kategori (multi-label).

### 2.2 Analisis Detail per Kategori

#### 🔴 P0: Pendaftaran Belum Tuntas (6 ulasan, 37.5%)

**Root Cause:** Proses verifikasi merchant memakan waktu lebih lama dari estimasi 1 hari kerja, tanpa status yang jelas.

**Dampak Bisnis:**
- Cash flow merchant terganggu karena tidak bisa menerima pembayaran QRIS
- Kehilangan kepercayaan nasabah terhadap janji layanan
- Potensi churn ke kompetitor

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Barokah Channel | 1★ | *"pemrosesan pendaftaran kata nya nunggu 1 hari kerja, tapi saat ini belum ada keterangan dan lama bgt gak seperti bank lain"* |
| Ambo Asek Official | 1★ | *"Keterangan 1 hari kerja sudah berhari hari tidak ada notifikasi di approve atau di tolak"* |
| Roziqin Ziqin | 1★ | *"pendaftaran lama ga acc, tanya csnya tidak menyelesaikan masalah"* |
| Heri Setiawan | 1★ | *"udah dftr 2 hari g jadi gagal atau berhasil aplikasi g jelas"* |
| Iksan Ramadhan | 1★ | *"sudah 2 hari daftar masih diproses terus"* |
| Prasenda Valentina Ramadhani | 1★ | *"proses bikin QRIS nya lama banget.. awal ngajuin pake aplikasi yg lama, infonya udah mau discontinue dan suruh ngajuin lagi pake aplikasi wondr merchant. Pas udah ngajuin ada info 1HK, udah lbh 1HK gaada pergerakan. Gak gercep sama sekali 👎🏻"* |

**Rekomendasi:**
- Tampilkan progres verifikasi real-time dengan status detail
- Kirim notifikasi otomatis saat estimasi terlewati
- Sediakan jalur eskalasi khusus untuk kasus >24 jam

---

#### 🟠 P1: Notifikasi & Pembaruan Laporan (4 ulasan, 25.0%)

**Root Cause:** Notifikasi tidak sinkron antara aplikasi lama dan baru, atau fitur notifikasi suara nominal belum tersedia.

**Dampak Bisnis:**
- Merchant tidak tahu transaksi berhasil tanpa membuka aplikasi
- Risiko kehilangan pelanggan karena antrean menumpuk
- Ketidakpastian status settlement

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Andry Teguh Aryanto | 5★ | *"admin ini untuk transaksi2 masuk lewat wondr merchant sudah bisa blm ya.. apa masih di aplikasi lama.. soalnya beberp hari krmn sampai skrg notifnya masih aplikasi lama. yg baru blm update otomatis"* |
| Hamid Aly ubaid | 3★ | *"masih perlu banyak pengembangan, 1. notif suara nominal 2. pilihan pencairan realtime 3. menu menghapus toko yang sudah tidak di gunakan 4. laporan delay aplikasi biru sebelah sudah bisa semua"* |
| Tanamo | 4★ | *"suara notifnya ga ada, ga kayak aplikasi sebelumnya"* |
| Muhammad K. Alfikhri | 1★ | *"Settlement tidak update"* |

**Rekomendasi:**
- Audit latensi notifikasi dan sinkronisasi antar-aplikasi
- Tambahkan fitur notifikasi suara dengan nominal transaksi
- Perbaiki delay pembaruan settlement

---

#### 🟠 P1: Akses & Performa Aplikasi (4 ulasan, 25.0%)

**Root Cause:** Loading lambat, login gagal berulang, atau performa menurun dibanding aplikasi lama.

**Dampak Bisnis:**
- Merchant tidak bisa memproses transaksi saat sibuk
- Frustrasi pengguna dan potensi uninstall
- Hilangnya kepercayaan terhadap stabilitas sistem

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Boy Antoni | 2★ | *"sering nggak bisa, msh kurang cepat, enaksn yg lama. ini sering ga ngguan, tlng diperbaiki sy pindah dari bank yg lain kebni karena lancar, ni mulai payah pula."* |
| Bos AteQ | 2★ | *"Loading Lama.. Login lbh bnyk gagal daripada berhasilx"* |
| Ninis Sweet | 1★ | *"ribet beralih ke aplikasi ini tanpa info sama sekali mau masuk ribet skali. marketing tdk brtanggung jawab"* |
| Yessi Ma | 2★ | *"blum ada sidik jari tampilan jumlah setiap waktu TDK ada repotlah kalo masuk ngecek harus pake pasword ...maunya sidik jari cukup masih bagus bni marchant"* |

**Rekomendasi:**
- Investigasi root cause login failure dan loading time
- Evaluasi implementasi biometrik (fingerprint/Face ID) sebagai alternatif
- Optimasi performa aplikasi secara keseluruhan

---

#### 🟡 P2: Migrasi Kurang Jelas (3 ulasan, 18.8%)

**Root Cause:** Pengguna dipaksa migrasi dari aplikasi lama tanpa informasi yang memadai tentang proses perpindahan.

**Dampak Bisnis:**
- Kebingungan pengguna tentang status akun lama
- Duplikasi pendaftaran yang tidak perlu
- Kritik terhadap tim pemasaran

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Andry Teguh Aryanto | 5★ | *"admin ini untuk transaksi2 masuk lewat wondr merchant sudah bisa blm ya.. apa masih di aplikasi lama.. soalnya beberp hari krmn sampai skrg notifnya masih aplikasi lama. yg baru blm update otomatis"* |
| Ninis Sweet | 1★ | *"ribet beralih ke aplikasi ini tanpa info sama sekali mau masuk ribet skali. marketing tdk brtanggung jawab"* |
| Prasenda Valentina Ramadhani | 1★ | *"proses bikin QRIS nya lama banget.. awal ngajuin pake aplikasi yg lama, infonya udah mau discontinue dan suruh ngajuin lagi pake aplikasi wondr merchant..."* |

**Rekomendasi:**
- Sediakan panduan migrasi step-by-step
- Jelaskan status akun lama vs baru dengan jelas
- Koordinasi tim pemasaran dengan tim produk untuk messaging yang konsisten

---

#### 🟡 P2: Penanganan Layanan (1 ulasan, 6.3%)

**Root Cause:** Customer service tidak menyelesaikan masalah dengan efektif.

**Verbatim Quote:**

| Username | Rating | Quote |
|----------|--------|-------|
| Roziqin Ziqin | 1★ | *"pendaftaran lama ga acc, tanya csnya tidak menyelesaikan masalah"* |

**Rekomendasi:**
- Berikan pemilik tiket yang jelas dan estimasi penyelesaian
- Sediakan jalur eskalasi untuk kasus yang menggantung

---

## 3. DELIGHTERS & VALUE DRIVERS (SENTIMEN POSITIF)

### 3.1 Distribusi Pujian Positif

**Total Ulasan Positif: 26 ulasan (60.5%)**

| Kategori Keunggulan | Jumlah | % dari Positif |
|---------------------|--------|----------------|
| **Kemudahan penggunaan & manfaat usaha** | 10 | 38.5% |
| **Transaksi & notifikasi membantu** | 7 | 26.9% |
| **Penggunaan terasa lancar** | 4 | 15.4% |
| **Kelengkapan fitur** | 3 | 11.5% |
| **Pelayanan memuaskan** | 2 | 7.7% |

### 3.2 Analisis Detail per Kategori

#### ✅ Kemudahan Penggunaan & Manfaat Usaha (10 ulasan)

**Key Highlights:**
- UI modern dan simpel
- Membantu pengelolaan usaha
- Proses mudah dipahami

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Intan Ramdani | 5★ | *"tampilan lebih simpel dan fiturnya lebih lengkap dr Apk Merchant sebelumnya. Semoga makin sukses BNI."* |
| Siti nurjanah | 5★ | *"sangat mudah digunakan"* |
| Rizky Perdana | 5★ | *"keren sangat membantu"* |
| Coky_04 HM | 5★ | *"Mempermudah Para usahawan"* |
| Motoshop Biel (Apple) | 5★ | *"sangat membantu usaha saya naik kelas"* |

---

#### ✅ Transaksi & Notifikasi Membantu (7 ulasan)

**Key Highlights:**
- Settlement cepat (hingga 5x sehari)
- Notifikasi real-time akurat
- QRIS tanpa biaya admin (persepsi pengguna)

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| boyo 76 | 5★ | *"aplikasi fresh, akurat notifikasinya, lancar jaya, sangat rekomendasi untuk laporan transaksi"* |
| Avengers1403 (Apple) | 5★ | *"Tampilan menarik, modern, pencairan dana lebih cepat"* |
| Stellaelisam (Apple) | 5★ | *"Oke banget mantap real time 5x settelment"* |
| Rizki Ramadhan | 5★ | *"QRIS Gratis Biaya Admin"* |

**Catatan:** Klaim "QRIS gratis biaya admin" adalah persepsi pengguna, bukan verifikasi kebijakan resmi BNI.

---

#### ✅ Penggunaan Terasa Lancar (4 ulasan)

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| boyo 76 | 5★ | *"aplikasi fresh, akurat notifikasinya, lancar jaya..."* |
| Siti asiah | 5★ | *"lancar banget"* |
| Titin Rohayah | 4★ | *"layanan transaksi lebih cepat dan lebih akurat serta mudah dipahami oleh pengguna"* |

---

#### ✅ Kelengkapan Fitur (3 ulasan)

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Intan Ramdani | 5★ | *"tampilan lebih simpel dan fiturnya lebih lengkap dr Apk Merchant sebelumnya"* |
| taufik azhar | 5★ | *"aplikasi nya lengkap"* |
| Acequatra (Apple) | 5★ | *"Menarik, ada program qris 0% dan qris dinamis juga"* |

---

#### ✅ Pelayanan Memuaskan (2 ulasan)

**Verbatim Quotes:**

| Username | Rating | Quote |
|----------|--------|-------|
| Titi Duriati | 5★ | *"pelayanan memuaskan"* |

---

## 4. GEOGRAPHIC & BRANCH MENTION DETECTOR

**Temuan:** Tidak ada indikasi lokasi spesifik (nama kota, daerah, atau cabang BNI) yang tertulis eksplisit dalam ulasan yang dianalisis.

**Catatan:** Ulasan dari Google Play dan App Store tidak menyertakan metadata lokasi yang dapat diverifikasi. Analisis geografis memerlukan data tambahan dari internal BNI atau survei langsung.

---

## 5. OMNICHANNEL PATTERN & BEHAVIORAL DIFFERENCES

### 5.1 Play Store vs App Store

| Aspek | Google Play | Apple App Store |
|-------|-------------|-----------------|
| **Jumlah Ulasan** | 35 | 8 |
| **Average Rating** | 3.43/5.0 | 5.00/5.0 |
| **Sentimen Dominan** | Campuran (51.4% positif, 45.7% negatif) | 100% positif |
| **Isu Spesifik** | Pendaftaran lambat, notifikasi tidak sinkron, loading lama | Tidak ada keluhan eksplisit |
| **Pujian Dominan** | Kemudahan penggunaan, kelengkapan fitur | Tampilan modern, settlement cepat |

**Analisis:**
- Sampel Apple sangat kecil (8 ulasan) dan seluruhnya positif, sehingga **tidak dapat disimpulkan** bahwa iOS lebih stabil atau pengguna lebih puas.
- Google Play memiliki variasi sentimen yang lebih representatif.
- Tidak ada bug spesifik OS yang teridentifikasi dari sampel ini.

### 5.2 Media Sosial & Web

**Status data: N/A — belum ada konektor.**

Batch ini hanya mengambil Google Play dan Apple App Store. Tidak ada pengambilan data dari Facebook, Instagram, TikTok, YouTube, X, forum, blog, berita, atau Google Reviews; karena itu:

- Tidak dapat diklaim bahwa ada atau tidak ada ulasan pelanggan di kanal tersebut.
- Angka 0 pada tabel kanal berarti **tidak dicoba / tidak tersedia**, bukan hasil pengukuran sentimen.
- Diperlukan konektor resmi atau izin akses untuk menilai kanal sosial, forum, dan web secara sah.

**Implikasi:**
- Perbandingan omnichannel yang dapat dipertanggungjawabkan hanya antara Google Play dan App Store.
- Monitoring media sosial memerlukan sumber dan metode tersendiri; konten promosi resmi tidak boleh diperlakukan sebagai suara pelanggan.

---

## 6. AUDIT EXPLORER TABLE (20 Sampel Representatif)

| No | Tanggal | Username | Platform | Rating | Sentimen | Lokasi | Kategori Fitur | Root Cause / Key Highlight | Verbatim Quote |
|----|---------|----------|----------|--------|----------|--------|----------------|---------------------------|----------------|
| 1 | 2026-10-21 | Prasenda Valentina Ramadhani | Play | 1★ | Negatif | N/A | Onboarding, Migrasi | Pendaftaran QRIS lambat saat migrasi | *"proses bikin QRIS nya lama banget.. awal ngajuin pake aplikasi yg lama, infonya udah mau discontinue dan suruh ngajuin lagi pake aplikasi wondr merchant. Pas udah ngajuin ada info 1HK, udah lbh 1HK gaada pergerakan. Gak gercep sama sekali 👎🏻"* |
| 2 | 2026-10-21 | Yessi Ma | Play | 2★ | Negatif | N/A | Login, Fitur | Tidak ada fingerprint login | *"blum ada sidik jari tampilan jumlah setiap waktu TDK ada repotlah kalo masuk ngecek harus pake pasword ...maunya sidik jari cukup masih bagus bni marchant"* |
| 3 | 2026-10-20 | Titin Rohayah | Play | 4★ | Positif | N/A | Transaksi, UX | Transaksi cepat dan akurat | *"layanan transaksi lebih cepat dan lebih akurat serta mudah dipahami oleh pengguna"* |
| 4 | 2026-10-16 | Muhammad K. Alfikhri | Play | 1★ | Negatif | N/A | Settlement | Settlement tidak update | *"Settlement tidak update"* |
| 5 | 2026-10-10 | Bos AteQ | Play | 2★ | Negatif | N/A | Login, Performa | Loading lama, login gagal | *"Loading Lama.. Login lbh bnyk gagal daripada berhasilx"* |
| 6 | 2026-10-08 | Boy Antoni | Play | 2★ | Negatif | N/A | Performa | Sering tidak bisa, kurang cepat | *"sering nggak bisa, msh kurang cepat, enaksn yg lama. ini sering ga ngguan, tlng diperbaiki sy pindah dari bank yg lain kebni karena lancar, ni mulai payah pula."* |
| 7 | 2026-10-04 | Tanamo | Play | 4★ | Negatif | N/A | Notifikasi | Tidak ada suara notif | *"suara notifnya ga ada, ga kayak aplikasi sebelumnya"* |
| 8 | 2026-10-01 | Ninis Sweet | Play | 1★ | Negatif | N/A | Migrasi, Login | Migrasi ribet tanpa info | *"ribet beralih ke aplikasi ini tanpa info sama sekali mau masuk ribet skali. marketing tdk brtanggung jawab"* |
| 9 | 2026-09-30 | Siti asiah | Play | 5★ | Positif | N/A | Performa | Sangat lancar | *"lancar banget"* |
| 10 | 2026-09-25 | Coky_04 HM | Play | 5★ | Positif | N/A | Benefit | Mempermudah usahawan | *"Mempermudah Para usahawan"* |
| 11 | 2026-09-24 | Hamid Aly ubaid | Play | 3★ | Negatif | N/A | Notifikasi, Settlement, Fitur | Banyak fitur belum ada | *"masih perlu banyak pengembangan, 1. notif suara nominal 2. pilihan pencairan realtime 3. menu menghapus toko yang sudah tidak di gunakan 4. laporan delay aplikasi biru sebelah sudah bisa semua"* |
| 12 | 2026-09-23 | ABD RASYID AZ Aci | Play | 5★ | Positif | N/A | General | Pujian singkat | *"ok"* |
| 13 | 2026-09-22 | Avengers1403 | App Store | 5★ | Positif | N/A | UX, Settlement | Tampilan modern, pencairan cepat | *"Tampilan menarik, modern, pencairan dana lebih cepat"* |
| 14 | 2026-09-20 | Tri Handoyo | Play | 1★ | Negatif | N/A | General | Ketidakpuasan tanpa rincian | *"bankke"* |
| 15 | 2026-09-20 | Intan Ramdani | Play | 5★ | Positif | N/A | UX, Fitur | Tampilan simpel, fitur lengkap | *"tampilan lebih simpel dan fiturnya lebih lengkap dr Apk Merchant sebelumnya. Semoga makin sukses BNI."* |
| 16 | 2026-09-17 | Su herman | Play | 3★ | Netral | N/A | General | Penilaian ditunda | *"3 bintang dulu"* |
| 17 | 2026-09-17 | Heri Setiawan | Play | 1★ | Negatif | N/A | Onboarding | Status pendaftaran tidak jelas | *"udah dftr 2 hari g jadi gagal atau berhasil aplikasi g jelas"* |
| 18 | 2026-09-17 | Rizky Perdana | Play | 5★ | Positif | N/A | Benefit | Sangat membantu | *"keren sangat membantu"* |
| 19 | 2026-09-08 | Barokah Channel | Play | 1★ | Negatif | N/A | Onboarding | Pendaftaran lama | *"pemrosesan pendaftaran kata nya nunggu 1 hari kerja, tapi saat ini belum ada keterangan dan lama bgt gak seperti bank lain"* |
| 20 | 2026-09-08 | boyo 76 | Play | 5★ | Positif | N/A | Notifikasi, Performa, Settlement | Notifikasi akurat, lancar | *"aplikasi fresh, akurat notifikasinya, lancar jaya, sangat rekomendasi untuk laporan transaksi"* |

---

## 7. ACTIONABLE ROADMAP & PRIORITIZATION MATRIX

### 🔴 P0: Critical - Urgent (Perbaikan < 48 jam)

| Issue | Impact | Action Item | Owner | Success Metric |
|-------|--------|-------------|-------|----------------|
| **Pendaftaran lambat (>1 hari kerja)** | 6 merchant tidak bisa bertransaksi | Tampilkan progres verifikasi real-time + notifikasi otomatis saat SLA terlewati | Operasional Merchant | Waktu persetujuan P95 < 24 jam |
| **Login gagal berulang** | Merchant tidak bisa akses aplikasi | Investigasi root cause + hotfix | Engineering QA | Login success rate > 99% |

### 🟠 P1: High Impact (Sprint Berikutnya)

| Issue | Impact | Action Item | Owner | Success Metric |
|-------|--------|-------------|-------|----------------|
| **Notifikasi tidak sinkron** | Merchant tidak tahu transaksi berhasil | Audit latensi notifikasi + sinkronisasi antar-aplikasi | Engineering Pembayaran | Notifikasi terdeliver < 5 detik |
| **Loading lambat** | Frustrasi pengguna | Optimasi performa aplikasi | Engineering QA | Loading time P95 < 3 detik |
| **Settlement tidak update** | Ketidakpastian status dana | Perbaiki delay pembaruan settlement | Engineering Pembayaran | Settlement update real-time |

### 🟡 P2: Enhancement (Feature Request)

| Issue | Impact | Action Item | Owner | Success Metric |
|-------|--------|-------------|-------|----------------|
| **Tidak ada fingerprint login** | Repot harus input password | Implementasi biometrik (fingerprint/Face ID) | Engineering Mobile | Adoption rate > 50% |
| **Tidak ada notifikasi suara nominal** | Merchant harus buka aplikasi untuk cek nominal | Tambahkan fitur notifikasi suara dengan nominal | Engineering Mobile | User satisfaction > 4.0/5.0 |
| **Menu hapus toko tidak ada** | Toko tidak terpakai tetap tampil | Tambahkan fitur hapus toko | Engineering Mobile | N/A |
| **Panduan migrasi tidak jelas** | Kebingungan pengguna | Buat panduan step-by-step + video tutorial | Produk Operasional | Reduction in migration-related complaints |

---

## 8. KETERBATASAN & REKOMENDASI PENGUMPULAN DATA LANJUTAN

### 8.1 Keterbatasan Analisis Ini

1. **Cakupan terbatas:** 43 ulasan tertulis dari 2 kanal (Play Store & App Store); seluruh teks publik yang dapat diakses dianalisis, tetapi ini tidak mewakili seluruh pengguna.
2. **Kanal sosial belum tersedia:** Facebook, Instagram, TikTok, YouTube, dan X belum memiliki konektor; datanya N/A dan tidak boleh dibaca sebagai nol keluhan.
3. **Forum/web belum tersedia:** Belum ada konektor diskusi independen di Kaskus, Reddit, blog, berita, atau Google Reviews; tidak disimpulkan bahwa diskusi tersebut tidak ada.
4. **Cakupan penilaian:** Google Play memiliki 68 penilaian listing tetapi hanya 35 teks; App Store 15 penilaian tetapi 8 teks. Penilaian tanpa teks tidak menyediakan nama/isi publik sehingga tidak dapat dimasukkan tanpa mengarang data. Pengambilan Play memakai urutan terbaru, bukan sampel acak.
5. **Tidak ada metadata lokasi:** Tidak dapat menganalisis pola geografis.
6. **Klasifikasi campuran:** Snapshot awal dilabeli manual; ulasan baru memakai aturan kata kunci konservatif (`rules-v1`), bukan LLM. Negasi dan sarkasme dapat keliru; teks yang tidak dikenali ditandai perlu tinjauan.

### 8.2 Rekomendasi Pengumpulan Data Lanjutan

1. **Survei Langsung:** Lakukan survei kepada merchant aktif untuk mendapatkan feedback terstruktur.
2. **Focus Group Discussion:** Adakan FGD dengan merchant dari berbagai segmen (UMKM, retail, F&B).
3. **Monitoring Media Sosial:** Gunakan tools social listening untuk mendeteksi mention wondr merchant di media sosial.
4. **Internal Data Analysis:** Analisis data internal BNI (ticket CS, call center, chat) untuk melengkapi feedback publik.
5. **Competitor Benchmarking:** Bandingkan dengan aplikasi merchant bank lain (BCA, Mandiri, BRI) untuk identifikasi best practices.

---

## 9. KESIMPULAN

Aplikasi **wondr merchant by BNI** menunjukkan sentimen **cenderung positif** dengan NSS +23.3 poin, namun masih memiliki **37.2% ulasan negatif** yang memerlukan perhatian serius.

**Pain point utama** adalah proses pendaftaran yang lambat dan tidak transparan, diikuti oleh masalah notifikasi dan performa aplikasi. **Delighters utama** adalah kemudahan penggunaan, kelengkapan fitur, dan kecepatan settlement.

**Rekomendasi prioritas:**
1. **P0:** Perbaiki proses pendaftaran dan login blocker dalam 48 jam.
2. **P1:** Optimasi notifikasi dan performa aplikasi di sprint berikutnya.
3. **P2:** Tambahkan fitur fingerprint login dan notifikasi suara nominal.

**Catatan kritis:** Kanal media sosial, forum, dan web belum tercakup oleh konektor, sehingga persepsi publik di kanal tersebut **tidak dapat disimpulkan** dari laporan ini — bukan berarti tidak ada keluhan. Untuk mengukurnya diperlukan konektor resmi dan periode pengamatan yang setara.

---

## LAMPIRAN

### A. Metodologi

- **Data Collection:** Web scraping dari Google Play Store (RPC endpoint `oCPfdb`) dan Apple App Store (embedded JSON).
- **Sentiment Classification:** Rule-based keyword matching pada teks ulasan, bukan rating bintang.
- **Tagging:** Multi-label classification berdasarkan 12 kategori fitur.
- **Deduplication:** Berdasarkan platform + ID atau fingerprint (author + date + text).
- **Tools:** Node.js, dependency-free, local dashboard.

### B. Sumber Data

- Google Play Store: https://play.google.com/store/apps/details?id=id.bni.wfb&hl=id
- Apple App Store: https://apps.apple.com/id/app/wondr-merchant-by-bni/id6741567238?l=id

### C. Dashboard Lokal

Dashboard interaktif tersedia di: `http://127.0.0.1:4173/`

---

**Laporan ini disusun berdasarkan data publik yang tersedia per 23 Oktober 2026. Seluruh data, nama pengguna, dan kutipan berasal dari hasil pencarian publik tanpa fabrikasi.**

**Disclaimer:** Dashboard ini adalah produk independen dan bukan produk resmi BNI. Analisis ini tidak mewakili pandangan atau kebijakan resmi PT Bank Negara Indonesia (Persero) Tbk.
