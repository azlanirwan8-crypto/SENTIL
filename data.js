export const observationDate = '2026-10-23';
export const playUrl = 'https://play.google.com/store/apps/details?id=id.bni.wfb&hl=id';
export const platforms = [
  { id: 'play', name: 'Google Play', short: 'Play Store', icon: 'play', color: '#159777', type: 'Toko aplikasi', url: playUrl, status: 'Tersedia', note: '35 ulasan tertulis diambil dengan urutan terbaru. Halaman toko menampilkan 68 penilaian dengan nilai 3,9/5. Jumlah penilaian tidak sama dengan jumlah teks ulasan yang dianalisis.', rating: 3.9, ratingCount: 68 },
  { id: 'appstore', name: 'Apple App Store', short: 'App Store', icon: 'apple', color: '#3485ed', type: 'Toko aplikasi', url: 'https://apps.apple.com/id/app/wondr-merchant-by-bni/id6741567238?l=id', status: 'Tersedia', note: '8 ulasan tertulis unik dari halaman publik App Store. Halaman toko menampilkan nilai 4,7/5 dari 15 penilaian, bukan 15 teks ulasan. Seluruh teks yang dapat diakses bersifat positif; jumlah ini belum mewakili seluruh pengguna iOS.', rating: 4.7, ratingCount: 15 },
  { id: 'x', name: 'X / Twitter', short: 'X / Twitter', icon: 'x', color: '#1c2433', type: 'Media sosial', status: 'Belum terhubung', note: 'Belum ada saluran pengambilan data. Konten promosi tidak dihitung sebagai pengalaman pelanggan.' },
  { id: 'instagram', name: 'Instagram', short: 'Instagram', icon: 'instagram', color: '#ce568c', type: 'Media sosial', status: 'Belum terhubung', note: 'Komentar pengguna belum tersedia. Unggahan resmi merek tidak digunakan sebagai sentimen pelanggan.' },
  { id: 'tiktok', name: 'TikTok', short: 'TikTok', icon: 'music', color: '#334155', type: 'Media sosial', status: 'Belum terhubung', note: 'Komentar pengguna belum tersedia dan belum ada pengambilan data otomatis.' },
  { id: 'youtube', name: 'YouTube', short: 'YouTube', icon: 'youtube', color: '#e35454', type: 'Media sosial', status: 'Belum terhubung', note: 'Saluran komentar belum terhubung. Video promosi tidak dihitung sebagai ulasan pelanggan.' },
  { id: 'facebook', name: 'Facebook', short: 'Facebook', icon: 'message', color: '#3485ed', type: 'Media sosial', status: 'Belum terhubung', note: 'Belum ada saluran komentar publik yang terhubung. Grup privat dan konten yang memerlukan proses masuk tidak diambil.' },
  { id: 'forum', name: 'Forum publik', short: 'Forum', icon: 'message', color: '#bb7655', type: 'Web', status: 'Belum terhubung', note: 'Belum ada saluran diskusi terverifikasi tentang aplikasi ini. Tidak tersedianya data tidak berarti tidak ada percakapan.' },
  { id: 'blog', name: 'Blog & ulasan web', short: 'Blog', icon: 'book', color: '#8a72ad', type: 'Web', status: 'Belum terhubung', note: 'Belum ada saluran ulasan pengalaman langsung. Artikel promosi tidak diperlakukan sebagai sentimen pelanggan.' },
  { id: 'news', name: 'Portal berita', short: 'Berita', icon: 'book', color: '#63859a', type: 'Web', status: 'Belum terhubung', note: 'Berita bukan ulasan pelanggan dan tidak dihitung sebagai sentimen merchant.' },
  { id: 'googlemaps', name: 'Google Reviews', short: 'Google Reviews', icon: 'layers', color: '#659476', type: 'Web', status: 'Belum terhubung', note: 'Belum ada entitas ulasan terverifikasi khusus untuk aplikasi. Ulasan kantor cabang tidak disamakan dengan ulasan aplikasi.' },
];

export const tags = {
  onboarding: 'Pendaftaran', login: 'Masuk aplikasi', transactions: 'Transaksi QRIS', notifications: 'Notifikasi',
  settlement: 'Laporan & pencairan dana', performance: 'Performa', ux: 'Kemudahan & tampilan', features: 'Fitur',
  support: 'Layanan pelanggan', migration: 'Migrasi aplikasi', benefit: 'Manfaat usaha', general: 'Penilaian umum',
};

const rows = [
  ['d5b9468a-9564-4878-a578-f4e1ace2442d','Andry Teguh Aryanto','2026-08-29',5,'negative',['notifications','migration'],'admin ini untuk transaksi2 masuk lewat wondr merchant sudah bisa blm ya.. apa masih di aplikasi lama.. soalnya beberp hari krmn sampai skrg notifnya masih aplikasi lama. yg baru blm update otomatis','Pertanyaan disertai laporan bahwa notifikasi belum berpindah atau diperbarui di aplikasi baru. Teksnya bersifat negatif meskipun penilaian bintang 5.'],
  ['9c61240e-b3f0-46af-a1fb-2ae9443e9117','boyo 76','2026-09-08',5,'positive',['notifications','performance','settlement'],'aplikasi fresh, akurat notifikasinya, lancar jaya, sangat rekomendasi untuk laporan transaksi','Pujian eksplisit terhadap akurasi notifikasi, kelancaran, dan laporan transaksi.'],
  ['4af161b7-3a29-4511-bd68-2d077439d726','Barokah Channel','2026-09-08',1,'negative',['onboarding'],'pemrosesan pendaftaran kata nya nunggu 1 hari kerja , tapi saat ini belum ada keterangan dan lama bgt gak seperti bank lain','Mengeluhkan proses pendaftaran dan ketidakjelasan status setelah estimasi waktu.'],
  ['8b37099c-3ae9-4d55-8293-3bbf3c4b02a2','Ambo Asek Official','2026-09-04',1,'negative',['onboarding'],'Keterangan 1 hari kerja sudah berhari hari tidak ada notifikasi di approve atau di tolak','Keluhan keterlambatan persetujuan atau penolakan pendaftaran.'],
  ['19f83edd-f59f-485b-b3d6-f722f8bef7e9','Hamid Aly ubaid','2026-09-24',3,'negative',['notifications','settlement','features'],'masih perlu banyak pengembangan, 1. notif suara nominal 2. pilihan pencairan realtime 3. menu menghapus toko yang sudah tidak di gunakan 4. laporan delay aplikasi biru sebelah sudah bisa semua','Mengeluhkan fitur yang belum tersedia dan laporan yang terlambat. Ulasan ini tidak membuktikan adanya keterlambatan pencairan dana.'],
  ['1650f767-a9a4-45e4-ab30-6449a9f99a38','Boy Antoni','2026-10-08',2,'negative',['performance'],'sering nggak bisa, msh kurang cepat, enaksn yg lama. ini sering ga ngguan , tlng diperbaiki sy pindah dari bank yg lain kebni karena lancar, ni mulai payah pula.','Melaporkan gangguan penggunaan dan kecepatan yang menurun menurut pengalaman pengguna.'],
  ['60496778-4583-40cb-96f1-d88892370fa9','Roziqin Ziqin','2026-08-28',1,'negative',['onboarding','support'],'pendaftaran lama ga acc, tanya csnya tidak menyelesaikan masalah','Mengeluhkan pendaftaran yang lama disetujui dan layanan pelanggan yang dinilai belum menyelesaikan masalah.'],
  ['eb5f8dd8-8e08-4793-b6b3-9de9e9324d4a','Intan Ramdani','2026-09-20',5,'positive',['ux','features'],'tampilan lebih simpel dan fiturnya lebih lengkap dr Apk Merchant sebelumnya. Semoga makin sukses BNI.','Apresiasi eksplisit atas tampilan sederhana dan kelengkapan fitur.'],
  ['814091df-b977-43ac-b355-d97d097f3512','Tanamo','2026-10-04',4,'negative',['notifications'],'suara notifnya ga ada, ga kayak aplikasi sebelumnya','Keluhan tidak adanya suara notifikasi. Makna teks berbeda dari rating 4 bintang.'],
  ['f2943178-9d3b-4bae-a70a-2a39114bfef8','Ninis Sweet','2026-10-01',1,'negative',['migration','login'],'ribet beralih ke aplikasi ini tanpa info sama sekali mau masuk ribet skali. marketing tdk brtanggung jawab','Mengeluhkan proses migrasi dan kesulitan masuk aplikasi. Kritik terhadap petugas pemasaran tidak otomatis digolongkan sebagai layanan pelanggan.'],
  ['c38d34af-d4d2-4ac1-a473-775380a54ba8','Heri Setiawan','2026-09-17',1,'negative',['onboarding'],'udah dftr 2 hari g jadi gagal atau berhasil aplikasi g jelas','Status hasil pendaftaran dinilai tidak jelas setelah dua hari.'],
  ['e601acc1-a1d1-4c55-8123-d1677e99cdae','Fugo Frinks','2026-09-06',1,'negative',['general'],'seminggu ga jadi2 \uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9\uD83D\uDCA9 tol loL kalah sama sbelah uninstall aj k\uD83D\uDCA9\uD83D\uDCA9n7000L','Ungkapan ketidakpuasan yang kuat disertai niat berhenti menggunakan aplikasi. Objek keluhan tidak disebutkan secara jelas sehingga tidak dimasukkan ke kategori pendaftaran.'],
  ['40cd2c79-e604-4b9d-a930-bf72366f4d5c','Iksan Ramadhan','2026-08-28',1,'negative',['onboarding'],'sudah 2 hari daftar masih diproses terus','Keluhan proses pendaftaran yang belum selesai.'],
  ['88b5d63e-43d4-4195-b6e2-cbd47ba92f7e','Rizky Perdana','2026-09-17',5,'positive',['benefit'],'keren sangat membantu','Pujian dan manfaat umum; tidak menyebut fitur spesifik.'],
  ['de42ea83-1b8e-4952-a2d5-d5aff635ec59','Iqbal Rasis','2026-08-22',5,'positive',['general'],'Bagus mntp dan good','Pujian umum tanpa aspek fitur spesifik.'],
  ['ea02f902-c143-4a69-96d5-6ab702e8cc83','taufik azhar','2026-08-23',5,'positive',['features'],'aplikasi nya lengkap','Pujian terhadap kelengkapan aplikasi.'],
  ['2f34de68-1cb5-4ede-ba33-7a5e7e59af6a','Bos AteQ','2026-10-10',2,'negative',['login','performance'],'Loading Lama.. Login lbh bnyk gagal daripada berhasilx','Melaporkan waktu muat yang lama serta kegagalan masuk aplikasi.'],
  ['03caf5d3-bd5b-46c7-9e30-fa1226e22cf6','Watini Purnomo','2026-08-23',5,'positive',['general'],'Bagus bgt aplikasinya','Pujian umum terhadap aplikasi.'],
  ['374dab04-a5d3-4aa0-a71a-0b411e4197ad','Coky_04 HM','2026-09-25',5,'positive',['benefit'],'Mempermudah Para usahawan','Mengapresiasi manfaat aplikasi bagi pelaku usaha.'],
  ['ee8cefb6-f779-4796-91b2-4276f9585750','Su herman','2026-09-17',3,'neutral',['general'],'3 bintang dulu','Tidak ada pujian atau keluhan eksplisit; penilaian ditunda.'],
  ['aecd5b01-2cb2-46c9-aebf-ef2dd2ead165','Rizki Ramadhan','2026-08-22',5,'positive',['transactions'],'QRIS Gratis Biaya Admin','Menyebut QRIS tanpa biaya admin sebagai manfaat. Ini pendapat penulis, bukan verifikasi kebijakan biaya BNI.'],
  ['642a189c-9cdb-4e23-b5c9-84dbfa54e545','Rani Nurjamilah','2026-08-22',5,'positive',['transactions','benefit'],'memudahkan transaksi finansial saya','Pujian atas kemudahan bertransaksi.'],
  ['38c0b098-de06-4747-b48c-d6e0ccc63476','Siti nurjanah','2026-08-23',5,'positive',['ux'],'sangat mudah digunakan','Apresiasi kemudahan penggunaan.'],
  ['5ef8d6cb-e77d-4c71-8c15-e13011d3a073','Titi Duriati','2026-08-22',5,'positive',['support'],'pelayanan memuaskan','Kepuasan terhadap pelayanan secara umum; saluran layanan tidak disebutkan.'],
  ['5c7f31ff-6fc1-4bae-8bfe-58345adcbe8b','Prasenda Valentina Ramadhani','2026-10-21',1,'negative',['onboarding','migration'],'proses bikin QRIS nya lama banget.. awal ngajuin pake aplikasi yg lama, infonya udah mau discontinue dan suruh ngajuin lagi pake aplikasi wondr merchant. Pas udah ngajuin ada info 1HK, udah lbh 1HK gaada pergerakan. Gak gercep sama sekali \uD83D\uDC4E\uD83C\uDFFB','Mengeluhkan proses pendaftaran QRIS yang lama dan pengajuan ulang saat migrasi. Ulasan ini tidak digolongkan sebagai kegagalan transaksi.'],
  ['9b8eb6b4-9c43-433a-8d4d-649e7ee89f94','Yessi Ma','2026-10-21',2,'negative',['login','features'],'blum ada sidik jari tampilan jumlah setiap waktu TDK ada repotlah kalo masuk ngecek harus pake pasword ...maunya sidik jari cukup masih bagus bni marchant','Mengeluhkan belum tersedianya masuk aplikasi dengan sidik jari. Ulasan ini tidak membuktikan adanya kegagalan masuk.'],
  ['d25e7c9e-45eb-4f32-b9e8-ee74dddc0cbf','Titin Rohayah','2026-10-20',4,'positive',['transactions','ux'],'layanan transaksi lebih cepat dan lebih akurat serta mudah dipahami oleh pengguna','Pujian atas kecepatan, akurasi transaksi, dan kemudahan pemahaman.'],
  ['1c1c73f0-c05d-4e62-bf73-2d5dca6bff69','Muhammad K. Alfikhri','2026-10-16',1,'negative',['settlement'],'Settlement tidak update','Melaporkan pembaruan settlement tidak tampil. Tidak cukup bukti untuk menyimpulkan keterlambatan dana.'],
  ['414e0e9f-5b59-4321-8302-b1262e1dfbdd','Arys 12 Nan mo rua','2026-09-06',5,'positive',['general'],'ok','Persetujuan singkat dengan informasi yang sangat terbatas.'],
  ['54d6631d-aef6-4de4-83dc-3916912fb794','ABD RASYID AZ Aci','2026-09-23',5,'positive',['general'],'ok','Persetujuan singkat dengan informasi yang sangat terbatas.'],
  ['3fd6a28e-329e-497f-aed0-9e08d69ba189','Mz_dj Mz_dj','2026-08-23',5,'positive',['ux'],'proses Mudah','Pujian kemudahan proses tanpa menyebut tahap pendaftaran secara eksplisit.'],
  ['58231cfc-d87e-429a-9b79-5db4fac7b9d8','Kantiasih Wulandari','2026-08-23',5,'positive',['general'],'kereen bgt','Pujian umum.'],
  ['08f51883-3666-4cf3-b28a-2fa8ee27d040','Siti asiah','2026-09-30',5,'positive',['performance'],'lancar banget','Pujian atas kelancaran penggunaan.'],
  ['1c72d1ba-1ad6-467e-a7a7-3857fa83f5e6','Tri Handoyo','2026-09-20',1,'negative',['general'],'bankke','Ungkapan ketidakpuasan tanpa rincian masalah.'],
  ['a30335a5-8bea-49ed-a0c9-3d6741766a1e','Natalia Natalia','2026-08-22',5,'positive',['general'],'good','Pujian singkat, tidak menyebut fitur tertentu.'],
];
export const seedReviews = rows.map(([id, author, date, rating, sentiment, reviewTags, text, rationale]) => ({
  id, author, date, rating, sentiment, tags: reviewTags, text, rationale, platform: 'play', sourceUrl: playUrl,
  observedAt: observationDate, labeling: 'manual', provenance: 'Halaman publik Google Play; diambil dengan urutan terbaru',
}));
const appleRows = [
  ['14579262452','Avengers1403','2026-09-22','QRIS Merchant','Tampilan menarik, modern, pencairan dana lebih cepat',['ux','settlement'],'Memuji tampilan dan kecepatan pencairan dana menurut pengalamannya; bukan pemeriksaan standar layanan.'],
  ['14462224596','Motoshop Biel','2026-08-23','sangat bagus','sangat membantu usaha saya naik kelas',['benefit'],'Apresiasi manfaat bagi usaha.'],
  ['14458941772','Stellaelisam','2026-08-22','Merchant','Oke banget mantap real time 5x settelment',['settlement'],'Memuji pencairan dana; klaim frekuensi merupakan pernyataan pengguna, bukan verifikasi kebijakan bank.'],
  ['14458459854','geeslys','2026-08-22','my fav bniii','love bnii',['general'],'Pujian umum terhadap merek; bukti pengalaman fitur sangat terbatas.'],
  ['14458459082','klfh88888','2026-08-22','Kerennnnn','Keren bnaget aplikasi nyaaaa',['general'],'Pujian umum terhadap aplikasi.'],
  ['14458049978','Acequatra','2026-08-22','Qris','Menarik, ada program qris 0% dan qris dinamis juga',['transactions','features'],'Apresiasi program QRIS dan fitur QRIS dinamis; bukan verifikasi tarif atau promosi yang berlaku.'],
  ['14449743005','IMAAASSSSSAA','2026-08-20','ih oke juga nih aplikasi :)','Nice app',['general'],'Pujian singkat tanpa rincian fitur.'],
  ['14449530776','reny rosita','2026-08-20','Aplikasi merchant BNI bagus','Aplikasinya keren banget, tampilannya fresh. Membantu banget bagi pengusaha',['ux','benefit'],'Apresiasi tampilan dan manfaat bagi pengusaha.'],
];
seedReviews.push(...appleRows.map(([id,author,date,title,text,reviewTags,rationale]) => ({
  id: `apple-${id}`, author, date, title, text, tags: reviewTags, rationale, rating: 5, sentiment: 'positive', platform: 'appstore',
  sourceUrl: 'https://apps.apple.com/id/app/wondr-merchant-by-bni/id6741567238?see-all=reviews&platform=iphone',
  labeling: 'manual', observedAt: observationDate, provenance: 'Halaman ulasan publik App Store; ID dan tanggal mengikuti data ulasan Apple',
})));
