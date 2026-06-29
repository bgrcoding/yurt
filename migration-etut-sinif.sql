-- Etüt/kitap yoklaması SINIF bazlı alınır (gece ise ODA bazlı).
-- Bu migration'ı Supabase > SQL Editor'da bir kez çalıştır.

-- 1) Öğrenciye etüt sınıfı atayabilmek için yeni alan
alter table room_students add column if not exists etut_sinif text;

-- 2) Yoklama kayıtlarında etüt sınıfını saklamak için yeni alan
alter table rollcalls add column if not exists etut_sinif text;

-- 3) Etüt/kitap kayıtlarında oda boş olacağı için room_id null olabilmeli
alter table rollcalls alter column room_id drop not null;
