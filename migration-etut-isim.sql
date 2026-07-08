-- Etüt sınıflarının adı değişti: "Sınıf 1/2/3" → "Etüt 1/2/3"
-- Eski atamalar yeni isimle eşleşsin diye mevcut kayıtları günceller.
-- Supabase > SQL Editor'da bir kez çalıştır.

-- Öğrenci atamaları
update room_students set etut_sinif = 'Etüt 1' where etut_sinif = 'Sınıf 1';
update room_students set etut_sinif = 'Etüt 2' where etut_sinif = 'Sınıf 2';
update room_students set etut_sinif = 'Etüt 3' where etut_sinif = 'Sınıf 3';

-- Geçmiş yoklama kayıtları
update rollcalls set etut_sinif = 'Etüt 1' where etut_sinif = 'Sınıf 1';
update rollcalls set etut_sinif = 'Etüt 2' where etut_sinif = 'Sınıf 2';
update rollcalls set etut_sinif = 'Etüt 3' where etut_sinif = 'Sınıf 3';
