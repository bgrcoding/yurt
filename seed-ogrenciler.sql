-- ============================================================
-- TÜM kayıtlı veriyi siler ve A/B/C sınıf listelerini yükler.
-- Supabase > SQL Editor'da çalıştır.
-- DİKKAT: Mevcut tüm oda / öğrenci / yoklama / ceza / uyarı
-- kayıtları KALICI olarak silinir. Geri alınamaz.
-- (program ve app_state tablolarına dokunulmaz.)
--
-- Not: C sınıfı oda 406 verisi eksik olduğu için eklenmedi.
-- ============================================================

begin;

-- 1) Mevcut verileri temizle (önce bağımlı tablolar, sonra odalar)
delete from rollcalls;
delete from penalties;
delete from warnings;
delete from room_students;
delete from rooms;

-- 2) Odalar  (3. kat: 302-319, 4. kat: 403-406)
insert into rooms (id, floor) values
('302',3),('303',3),('304',3),('305',3),('306',3),('307',3),('308',3),('309',3),
('310',3),('311',3),('312',3),('313',3),('314',3),('315',3),('316',3),('317',3),
('318',3),('319',3),
('403',4),('404',4),('405',4),('406',4);

-- 3) Öğrenciler  (class_name = SINIFI: A / B / C)  — oda bazlı, her odada A,B,C
insert into room_students (room_id, student_name, class_name) values
('302','MUHAMMED EMİR BAŞOĞLU','A'),
('302','ÖMER FARUK DAŞ','B'),
('302','SÜLEYMAN ÜNAL','C'),
('303','TARIK EYMEN ÇANKAYA','A'),
('303','YAVUZ SELİM GÜLTEKİN','B'),
('303','ENES BURAK UZUN','C'),
('304','YUSUF BOZKAYA','A'),
('304','FURKAN İNALKAÇ','B'),
('304','YUSUF ŞİMŞEK','C'),
('305','MAHMUD HÜDAYİ KARADUMAN','A'),
('305','MUHAMMED ENES KIRYATAN','B'),
('305','ATLAS TELLİOĞLU','C'),
('306','MUSAB EMİR KAVAK','A'),
('306','MEHMET KEREM SARI','B'),
('306','YUNUS EMRE YAZICI','C'),
('307','İSMAİL EMRE ÖZGÜVEN','A'),
('307','AHMET DAVUT UZUN','B'),
('307','ABDULLAH YILDIRIMTEPE','C'),
('308','MUSTAFA SELİM ERBAY','A'),
('308','AHMET GÜMÜŞ','B'),
('308','AHMET YİĞİT ŞAHBAZ','C'),
('309','ÖMER TALHA TERZİ','A'),
('309','TALHA ÖZSÖZ','B'),
('309','ÖMER ASAF SOYLU','C'),
('310','SALİM EMRE ÇAKMAK','A'),
('310','ABDULLAH TAMİNCE','B'),
('310','FURKAN KEREM TÜZEK','C'),
('311','EYMEN BAŞOĞLU','A'),
('311','MEHMET EYMEN ERSOY','B'),
('311','AHMET SAİD KOÇ','C'),
('312','MUHAMMED YUSUF DİVLELİ','A'),
('312','MUHAMMED YUŞA KARTAL','B'),
('312','CEMAL GEMİCİ','C'),
('313','FURKAN ARSLAN','A'),
('313','AHMED FATİH BAYAZITOĞLU','B'),
('313','ENES SEYHAN','C'),
('314','MUHAMMED EMİN AŞKIN','A'),
('314','MEHMET ALİ ÇOŞKUN','B'),
('314','yusuf turan DEMİR','C'),
('315','MELİH SAMİ AKAY','A'),
('315','YUSUF BERA DUMAN','B'),
('315','TALHA ULUSOY','C'),
('316','BURAK EMRE ÇETİNKAYA','A'),
('316','CAFER YAĞIZ KARAFAZLI','B'),
('316','MUHAMMED EFE POLAT','C'),
('317','ENSAR CAN DURAK','A'),
('317','ÖMER ASAF SOLAKOĞLU','B'),
('317','ÖMER TAN','C'),
('318','AHMET EMİN ALPAYDIN','A'),
('318','HAKAN ÜNSAL KIRAÇ','B'),
('318','KAYRA TÜRK','C'),
('319','YUSUF AÇIKGÖZ','A'),
('319','ÖMER METE DEMİRCAN','B'),
('319','MUHAMMED EMRE ÖZMEN','C'),
('403','ÖMER MUHTAR AYYILDIZ','A'),
('403','MUSTAFA YAVUZ BOZER','B'),
('403','AHMET EFE GÖRGÜN','C'),
('404','ALİ ACAR BAL','A'),
('404','İDRİS PEKTEZ','B'),
('404','ÖMER FARUK TEKBAŞ','C'),
('405','MERT NURİ KAVAK','A'),
('405','MUHAMMED TARIK TUNÇ','B'),
('405','ÖMER FARUK YAZICI','C'),
('406','MUHAMMED SELİM AYDIN','A'),
('406','İSMAİL ÖZTÜRK','B');

commit;
