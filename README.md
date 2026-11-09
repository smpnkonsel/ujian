# KW Learning — CBT SMPN 20 Konawe Selatan

## Struktur
```
index.html            -> mengarahkan ke login
login.html            -> login admin & guru (satu halaman)
logout.html           -> keluar sungguhan dari kelima Firebase
ujian.html            -> halaman ujian siswa (tanpa login, pakai token)
dasbor.html           -> dasbor admin
Dasbor guru/          -> dasbor & halaman guru (hanya baca data master)
Data Master/ Manajemen Ujian/ Monitoring/ Hasil Ujian/ Pengaturan/   -> halaman admin
assets/css/neumorph.css  -> desain utama (dari dasbor.css Anda) dipakai semua halaman
assets/css/sidebar.css, ujian.css      -> gaya khusus
assets/js/cache.js                    -> cache data master (hemat Firestore)
assets/js/auth.js, guard.js  -> login, peran, penjaga halaman
assets/js/data.js            -> baca data gabungan VII/VIII/IX
assets/js/firebase-pusat.js  -> konfigurasi 5 Firebase
firebase-rules/              -> rules Firestore untuk kelima project
```

## Alur login
- Admin: email + sandi yang SAMA di kelima Firebase -> `dasbor.html`.
- Guru : akun dibuat/diaktifkan admin di *Data Akun* -> `Dasbor guru/Dasbor-guru.html`.
- Halaman admin menolak guru (dan sebaliknya); belum login selalu ke `login.html`.

## Langkah wajib sebelum dipakai
1. Authentication > Sign-in method: aktifkan **Email/Password** di kelima project.
2. Buat akun admin (email & sandi sama) di kelima project.
3. Buka `firebase-rules/`, ganti `GANTI_DENGAN_EMAIL_ADMIN@contoh.com` dengan email admin, lalu tempel ke Firestore > Rules:
   - `kelas-VII-VIII-IX.rules`  -> cbt-6a20d, cbt-viii, cbt-ix (isi sama, tempel di ketiganya)
   - `siswa-guru.rules`         -> dat-guru-siswa
   - `bank-soal.rules`          -> bank-soal-edaf4
4. Di halaman *Data Akun*, tekan **Aktifkan** ulang untuk guru yang sudah ada
   (agar emailnya masuk daftar `akunGuru` yang dibaca rules).
5. Setelah semua akun dibuat, matikan pendaftaran mandiri: Authentication > Settings > User actions
   (nonaktifkan "Enable create (sign-up)"), nyalakan sementara hanya saat membuat akun guru.

## Catatan keamanan
- Sandi awal guru tersimpan di dokumen `guru` (`akunSandi`) agar admin bisa membagikannya. Hanya admin dan guru pemilik dokumen yang bisa membacanya.
- Nilai ujian dihitung di browser siswa; rules membatasi bentuk data tapi tidak bisa menjamin nilai asli.
- API key Google Drive di `assets/js/storageConfig.js` terlihat publik; batasi di Google Cloud (HTTP referrer + hanya Drive API).
- Pengaturan Aplikasi (`Pengaturan/pengaturan.html`) tersimpan di Firestore (Bank Soal, dokumen `pengaturan/kop_sekolah`); hanya admin yang menulis.
