-- ODA DÜZENİ PUANLAMA
-- Her odaya, bir tarihte, 1–10 arası düzen puanı (+ opsiyonel not).
-- Aynı oda+tarih için tek kayıt; tekrar kaydetmek GÜNCELLEME olur (upsert).
create table if not exists room_scores (
  id          bigint generated always as identity primary key,
  room_id     text not null references rooms(id) on delete cascade,
  date        date not null,
  score       smallint not null check (score between 1 and 10),
  note        text default '',
  created_by  text,
  created_at  timestamptz default now(),
  unique (room_id, date)
);

create index if not exists room_scores_date_idx on room_scores(date);

-- RLS: diğer tablolarla aynı desen — herkes okur, sadece giriş yapan yazar.
alter table room_scores enable row level security;

drop policy if exists "room_scores read"  on room_scores;
drop policy if exists "room_scores write" on room_scores;

create policy "room_scores read"  on room_scores for select using (true);
create policy "room_scores write" on room_scores for all
  to authenticated using (true) with check (true);
