-- Oda düzeni puanlamasını 1–5'ten 1–10'a genişlet.
-- Bu migration'ı Supabase > SQL Editor'da bir kez çalıştır.

-- 1) Eski kısıtı kaldır (1-5 aralığını zorluyordu)
alter table room_scores drop constraint if exists room_scores_score_check;

-- 2) Geçmiş verileri yeni ölçeğe taşı: eski puanın iki katını al (5 = en düzenli → 10 = en düzenli)
update room_scores set score = score * 2;

-- 3) Yeni kısıtı ekle (1-10 aralığı)
alter table room_scores add constraint room_scores_score_check check (score between 1 and 10);
