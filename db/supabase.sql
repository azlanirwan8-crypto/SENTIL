-- Skema penyimpanan Sentil untuk Supabase.
-- Jalankan sekali di Supabase Studio → SQL Editor. Tabel dibuat di schema `public`
-- pada database default project, karena hanya database itulah yang dilayani API
-- PostgREST (https://<project>.supabase.co/rest/v1).
--
-- Tidak ada data contoh yang dibuat di sini: semua baris berasal dari penarikan
-- nyata yang dijalankan aplikasi.

begin;

-- Satu baris per ruang analisis. `snapshot` hanya ringkasan kecil untuk daftar.
create table if not exists public.sentil_workspace (
  id              text primary key,
  label           text not null,
  entity          text not null,
  stores          jsonb not null default '{}'::jsonb,
  channels        jsonb not null default '{}'::jsonb,
  snapshot        jsonb,
  created_at      timestamptz,
  updated_at      timestamptz,
  last_synced_at  timestamptz
);

-- Pointer ke hasil penarikan terakhir per ruang. `revision` menunjuk kumpulan baris
-- ulasan yang sedang aktif, sehingga penulisan batch berikutnya tidak pernah membuat
-- pembaca melihat data setengah terganti.
create table if not exists public.sentil_dataset (
  workspace_id   text primary key references public.sentil_workspace (id) on delete cascade,
  revision       integer not null default 1,
  entity         text,
  engine         jsonb,
  summary        jsonb,
  model          jsonb,
  channels       jsonb,
  limits         jsonb,
  cache          jsonb,
  fetched_at     timestamptz,
  review_count   integer not null default 0,
  updated_at     timestamptz not null default now()
);

-- Satu baris per ulasan yang terbaca. `payload` adalah objek persis seperti yang
-- dihasilkan mesin — tidak ada kolom yang dihitung ulang atau dibulatkan di sini.
create table if not exists public.sentil_review (
  workspace_id  text not null references public.sentil_workspace (id) on delete cascade,
  revision      integer not null,
  ordinal       integer not null,
  review_id     text,
  platform      text,
  rating        integer,
  published_at  timestamptz,
  payload       jsonb not null,
  primary key (workspace_id, revision, ordinal)
);

create index if not exists sentil_review_lookup_idx
  on public.sentil_review (workspace_id, revision, ordinal);

-- Riwayat penarikan, supaya jumlah baris yang terbaca bisa ditelusuri kembali.
create table if not exists public.sentil_sync_run (
  id            bigint generated always as identity primary key,
  workspace_id  text,
  entity        text,
  status        text,
  reviews       integer,
  channels      jsonb,
  error         text,
  elapsed_ms    integer,
  progress      jsonb,
  created_at    timestamptz not null default now()
);

-- Progres penarikan per fase (baris terbaca, tahap analisis, potongan tulis) ditulis ke baris
-- riwayat yang sedang berjalan, supaya instance function lain yang menerima permintaan polling
-- tetap bisa menjawab. Installasi lama menaikkan kolom ini dengan satu baris di bawah; tanpa
-- kolomnya aplikasi tetap jalan — progres dibaca dari memori instance saja dan kegagalan tulisnya
-- sengaja diabaikan (persen tidak boleh menggagalkan penarikan).
alter table public.sentil_sync_run add column if not exists progress jsonb;

create index if not exists sentil_sync_run_workspace_idx
  on public.sentil_sync_run (workspace_id, created_at desc);

-- Catatan timezone (terukur 27 Oktober di instalasi ini): `created_at` terkirim ke klien sebagai
-- "2026-10-27T03:51:36+00:00" ketika UTC sedang 11:51 — sesi Postgres membaca zona waktunya delapan
-- jam di belakang UTC, dan offsetnya ikut dilabeli +00:00. Aplikasi sudah tidak membandingkan
-- kolom ini dengan jam function (aturan umur baris riwayat dihapus karena membuat penarikan yang
-- baru mulai dinyatakan mati di plafon platform), tapi siapa pun yang membaca riwayat dari SQL
-- harus tahu angkanya tidak UTC. Untuk memulihkan:
--   alter database postgres set timezone = 'UTC';   -- lalu restart koneksi/instance Supabase
-- (Kolomnya sendiri sudah `timestamptz`; yang salah hanya zona waktu sesi tempat nilainya
-- dirender, bukan jam internal Postgres.)

-- Pemakai yang menyedot kuota tidak punya akun di proyek ini (keputusan pemilik), jadi
-- yang dihitung adalah pengunjung x jendela waktu x aksi. `scope` sudah di-hash di
-- server (aksi:hash-ip) sehingga tabel ini bukan log alamat IP. `bucket` adalah awal
-- jendela dalam detik epoch, jadi satu baris mewakili satu jendela dan tidak ada
-- penghapusan berbasis waktu yang perlu dijadwalkan.
create table if not exists public.sentil_quota (
  scope       text not null,
  bucket      bigint not null,
  hits        integer not null,
  updated_at  timestamptz not null default now(),
  primary key (scope, bucket)
);

create index if not exists sentil_quota_updated_idx
  on public.sentil_quota (updated_at);

-- Mengambil satu jatah dan membaca hasilnya harus satu statement: dua permintaan serentak
-- yang sama-sama "baca lalu tulis" akan melihat dirinya sebagai yang pertama. Naik hanya
-- selama belum melewati batas, supaya mencoba-coba setelah penuh tetap terhitung sebagai
-- percobaan dan tidak menurunkan penghitungnya.
create or replace function public.sentil_take_slot(
  p_scope text,
  p_bucket bigint,
  p_limit integer,
  p_window_seconds integer
) returns table (allowed boolean, hits integer, reset_at timestamptz)
language sql
as $$
  with taken as (
    insert into public.sentil_quota as q (scope, bucket, hits, updated_at)
    values (p_scope, p_bucket, 1, now())
    on conflict (scope, bucket) do update
      set hits = q.hits + 1,
          updated_at = now()
      where q.hits < p_limit
    returning q.hits
  ),
  current_hits as (
    select coalesce(
      (select hits from taken),
      (select q.hits from public.sentil_quota q where q.scope = p_scope and q.bucket = p_bucket)
    ) as hits
  )
  select (select hits from current_hits) <= p_limit,
         (select hits from current_hits),
         to_timestamp(p_bucket) + make_interval(secs => p_window_seconds);
$$;

revoke all on function public.sentil_take_slot(text, bigint, integer, integer) from public, anon, authenticated;

-- Kunci akses. Row Level Security diaktifkan di semua tabel dan tidak ada kebijakan
-- untuk peran publik: hanya `service_role` (punya BYPASSRLS) yang boleh lewat, yaitu
-- fungsi server milik aplikasi ini.
alter table public.sentil_workspace enable row level security;
alter table public.sentil_dataset   enable row level security;
alter table public.sentil_review    enable row level security;
alter table public.sentil_sync_run  enable row level security;
alter table public.sentil_quota     enable row level security;

-- Supabase memberi hak awal ke `anon` dan `authenticated` pada schema public.
-- Dicabut eksplisit supaya publishable key tidak pernah bisa membaca atau menulis.
revoke all on public.sentil_workspace from anon, authenticated;
revoke all on public.sentil_dataset   from anon, authenticated;
revoke all on public.sentil_review    from anon, authenticated;
revoke all on public.sentil_sync_run  from anon, authenticated;
revoke all on public.sentil_quota     from anon, authenticated;

grant select, insert, update, delete on public.sentil_workspace to service_role;
grant select, insert, update, delete on public.sentil_dataset   to service_role;
grant select, insert, update, delete on public.sentil_review    to service_role;
grant select, insert, update, delete on public.sentil_sync_run  to service_role;
-- Tabel kuota hanya boleh berubah lewat fungsi di atas: aplikasi membaca hasilnya,
-- tidak pernah menulis angkanya sendiri.
grant select on public.sentil_quota to service_role;
grant execute on function public.sentil_take_slot(text, bigint, integer, integer) to service_role;

commit;

-- Kalau suatu hari kamu ingin peramban membaca langsung memakai publishable key
-- (bukan konfigurasi saat ini), baru aktifkan kebijakan baca berikut — tulis tetap
-- hanya lewat server:
--
-- create policy "read workspaces" on public.sentil_workspace for select to anon using (true);
-- create policy "read datasets"   on public.sentil_dataset   for select to anon using (true);
-- create policy "read reviews"    on public.sentil_review    for select to anon using (true);
