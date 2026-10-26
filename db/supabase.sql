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
  created_at    timestamptz not null default now()
);

create index if not exists sentil_sync_run_workspace_idx
  on public.sentil_sync_run (workspace_id, created_at desc);

-- Kunci akses. Row Level Security diaktifkan di semua tabel dan tidak ada kebijakan
-- untuk peran publik: hanya `service_role` (punya BYPASSRLS) yang boleh lewat, yaitu
-- fungsi server milik aplikasi ini.
alter table public.sentil_workspace enable row level security;
alter table public.sentil_dataset   enable row level security;
alter table public.sentil_review    enable row level security;
alter table public.sentil_sync_run  enable row level security;

-- Supabase memberi hak awal ke `anon` dan `authenticated` pada schema public.
-- Dicabut eksplisit supaya publishable key tidak pernah bisa membaca atau menulis.
revoke all on public.sentil_workspace from anon, authenticated;
revoke all on public.sentil_dataset   from anon, authenticated;
revoke all on public.sentil_review    from anon, authenticated;
revoke all on public.sentil_sync_run  from anon, authenticated;

grant select, insert, update, delete on public.sentil_workspace to service_role;
grant select, insert, update, delete on public.sentil_dataset   to service_role;
grant select, insert, update, delete on public.sentil_review    to service_role;
grant select, insert, update, delete on public.sentil_sync_run  to service_role;

commit;

-- Kalau suatu hari kamu ingin peramban membaca langsung memakai publishable key
-- (bukan konfigurasi saat ini), baru aktifkan kebijakan baca berikut — tulis tetap
-- hanya lewat server:
--
-- create policy "read workspaces" on public.sentil_workspace for select to anon using (true);
-- create policy "read datasets"   on public.sentil_dataset   for select to anon using (true);
-- create policy "read reviews"    on public.sentil_review    for select to anon using (true);
