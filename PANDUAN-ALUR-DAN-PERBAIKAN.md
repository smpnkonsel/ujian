# Panduan Alur, Struktur, dan Daftar Perbaikan

## 1. Struktur data (5 Firebase)
| Project | Isi |
|---|---|
| cbt-6a20d / cbt-viii / cbt-ix | `tokens`, `hasil`, `sesi`, `nilai`, `pengaturan`, `akunGuru` (per tingkat VII/VIII/IX) |
| dat-guru-siswa | `siswa` (id = NIS), `guru` (id = NIP), `kelas`, `Daftar/mapel`, `akunGuru` |
| bank-soal-edaf4 | `paket`, `jadwal`, `pengaturan`, `akunGuru` |

ID dokumen penting: `hasil/{token_nis}` dan `sesi/{token_nis}`.

## 2. Alur
**Admin menyiapkan:** Data Siswa/Guru -> Akun Guru (Aktifkan) -> Bank Soal (paket, file DOCX di Drive) -> Jadwal -> Token (dibuat dari jadwal).
**Siswa:** `ujian.html` -> NIS + token. Digit pertama token = tingkat. Dibaca: token, jadwal, paket, siswa, hasil (cegah dobel), sesi (waktu tidak diulang). Soal diunduh dan disimpan di IndexedDB. Jawaban disimpan lokal; sesi dicatat berkala; saat selesai `hasil` ditulis dan sesi ditutup.
**Pengawas:** Ruang, Monitoring, Aktivitas membaca `sesi`; Nilai/Jawaban membaca `hasil`.
**Login:** `login.html` -> `auth.js` (admin: 5 project; guru: akun aktif). `guard.js` menjaga tiap halaman.

## 3. Perbaikan di versi ini
**Keamanan/logika**
- Waktu ujian tidak bisa diulang (batas dibaca dari sesi di server) dan memakai jam server.
- Rules: `pengaturan` hanya admin; `Daftar` hanya staf; `sesi` bisa dibaca per dokumen oleh siswa.
- Hapus guru mencabut `akunGuru` di kelima project.
- Paket guru dikenali lewat email (tahan ganti NIP).
- Hapus jadwal menghapus token terkait; hapus paket memperingatkan bila dipakai jadwal.
- Token memakai kelas dari jadwal lebih dulu.
- Simpan rekap nilai mendeteksi tabrakan edit.
- Ganti NIS memberi peringatan.
- Halaman baru **Reset Ujian Siswa** (menu Hasil Ujian).

**Hemat Firebase**
- Detak sesi 30 dtk -> 60 dtk (dilewati bila baru menulis); sinkron jawaban 5 -> 15 dtk; pindah tab ditulis berjeda. Ambang online monitor 180 dtk.
- Siswa/jadwal/paket dibaca sekali dan di-cache (`cache.js`) lintas halaman.
- Listener realtime dihapus dari Data Siswa dan paket; monitoring berhenti saat tab tersembunyi.
- Aktivitas hanya sesi hari ini, polling 3 menit; Ruang 3 menit; Dasbor 2 menit.

## 3b. Tambahan fitur
- **Kirim ulang hasil otomatis** (tiap 20 detik dan saat internet kembali) bila pengiriman gagal.
- **Pengingat waktu** untuk siswa pada sisa 10, 5, dan 1 menit.
- **Cadangan & Pemeriksaan Data** (menu Pengaturan): unduh cadangan JSON (tanpa sandi guru) dan temukan data tak nyambung (jadwal tanpa paket, token yatim, guru aktif tanpa akses, paket tanpa file, kelas siswa tak terbaca).
- Halaman Nilai Ujian, Jawaban, dan Rekap Nilai kini memakai cache siswa bersama.

## 3c. Pemilih periode & jenis ujian (data lama tidak dimuat otomatis)
Setiap daftar kini punya **Periode** (Hari ini, 7 hari terakhir, Hari ini & mendatang, Bulan ini, Bulan lalu, Semester ini/lalu, Pilih bulan, Pilih tanggal, Semua waktu) dan **Jenis ujian** (SAS, PTS, dll., diambil dari field `jenis` pada paket). Pilihan diingat selama sesi browser.

| Halaman | Bawaan | Cara kerja |
|---|---|---|
| Nilai Ujian, Jawaban Siswa (admin & guru) | Bulan ini | Hanya hasil periode itu yang dibaca dari Firebase (terbaru dulu). Bila satu tingkat melebihi batas (1000/3000 per tingkat), muncul peringatan agar periode dipersempit. |
| Jadwal Ujian | Hari ini & mendatang | Disaring di layar; ada catatan jumlah jadwal yang disembunyikan. |
| Token Ujian | Hari ini & mendatang | Menyaring daftar jadwal dan tabel token. Tautan dari halaman Jadwal ke jadwal lama otomatis melebarkan periode. |
| Monitoring (dropdown jadwal) | 7 hari terakhir | Jadwal yang sedang berjalan dan yang sedang dipilih selalu ikut tampil. |
| Ruang Ujian, Aktivitas Siswa | Hari ini | Sudah hanya hari ini. |
| Rekap Nilai | Per semester | Tidak berubah. |

Catatan: sebelumnya halaman Jawaban Siswa membaca 500 dokumen tanpa urutan, sehingga bukan selalu yang terbaru. Sekarang diurutkan dan dibatasi periode.

## 3d. Jenis ujian pada paket
Saat menambah paket, **Jenis ujian** kini berupa pilihan: **SAS** (Sumatif Akhir Semester), **PTS** (Penilaian Tengah Semester), **UH** (Ulangan Harian). Disimpan sebagai singkatan di field `jenis`. Paket lama bernama "UTS" dibaca sebagai PTS dan "Ulangan Harian" sebagai UH pada filter jenis; data lama tidak diubah di Firebase.

## 4. Cara memasang
1. Tempel rules di `firebase-rules/` ke Firestore (ganti email admin bila perlu).
2. Unggah seluruh folder; pasang `ujian.js` dan halaman monitoring bersamaan.
3. Uji: satu siswa uji (mulai, refresh, ganti perangkat), monitoring, hapus guru uji, Reset Ujian.

## 5. Keterbatasan yang tetap ada
Kunci jawaban ikut terunduh ke browser siswa; hasil bisa dipalsukan siswa yang paham teknis; sandi awal guru tersimpan polos; API key Drive publik (batasi di Google Cloud). Acak urutan soal/opsi belum ada (perlu pemetaan ulang kode jawaban agar halaman Jawaban Siswa tetap benar).
