import { DRIVE_API_KEY } from './storageConfig.js';

const MIME_DOCX =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* =========================================================
   PENGATURAN
========================================================= */

const BATAS_UNDUH_MS = 45000;   // batas total satu kali unduh
const JUMLAH_COBA = 3;          // percobaan unduh jika jaringan bermasalah
const DB_CACHE = 'kw-ujian-cache';
const STORE_CACHE = 'dokumen';
const MAKS_ENTRI_CACHE = 6;     // simpan paling banyak 6 dokumen terakhir

/* =========================================================
   UTILITAS
========================================================= */

const tunda = ms => new Promise(resolve => setTimeout(resolve, ms));

function galat(pesan, bisaDiulang = false) {
    const error = new Error(pesan);
    error.bisaDiulang = bisaDiulang;
    return error;
}

/**
 * Mengambil ID file dari berbagai format link Google Drive.
 * Awalan "gdoc:" dari data lama diabaikan.
 */
function ambilDriveId(input) {
    const value = String(input || '')
        .trim()
        .replace(/^gdoc:/i, '');

    if (!value) {
        throw new Error('Link atau ID Google Drive belum diisi.');
    }

    // Format: https://drive.google.com/file/d/FILE_ID/view
    // Format: https://docs.google.com/document/d/FILE_ID/edit
    let match = value.match(/\/(?:file|document)\/d\/([a-zA-Z0-9_-]+)/);

    if (match) return match[1];

    // Format: https://drive.google.com/open?id=FILE_ID
    // Format: https://drive.google.com/uc?id=FILE_ID
    try {
        const url = new URL(value);
        const id = url.searchParams.get('id');

        if (id) return id;
    } catch (_) {}

    // Jika yang dimasukkan langsung ID file
    if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) {
        return value;
    }

    throw new Error('Format link Google Drive tidak valid.');
}

/**
 * Mengubah URL GitHub menjadi URL Raw.
 */
function ubahGitHubRaw(input) {
    const value = String(input || '').trim();

    if (!value) {
        throw new Error('Link GitHub belum diisi.');
    }

    try {
        const url = new URL(value);

        if (url.hostname === 'raw.githubusercontent.com') {
            return value;
        }

        if (url.hostname === 'github.com') {
            const bagian = url.pathname.split('/').filter(Boolean);

            if (
                bagian.length >= 5 &&
                bagian[2] === 'blob'
            ) {
                const [user, repo, , branch, ...path] = bagian;

                return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path.join('/')}`;
            }
        }
    } catch (_) {
        throw new Error('URL GitHub tidak valid.');
    }

    throw new Error('Gunakan link Raw GitHub atau link file GitHub dengan format /blob/.');
}

/**
 * Memeriksa API key Google Drive.
 */
function periksaApiKey() {
    if (!DRIVE_API_KEY || DRIVE_API_KEY === 'ISI_API_KEY_GOOGLE_DRIVE') {
        throw new Error('API key Google Drive belum dikonfigurasi.');
    }
}

/**
 * URL unduh langsung (file DOCX yang diunggah ke Drive).
 */
function urlDriveLangsung(id) {
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(DRIVE_API_KEY)}`;
}

/**
 * URL ekspor ke DOCX (Google Docs asli).
 */
function urlDriveEkspor(id) {
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(MIME_DOCX)}&key=${encodeURIComponent(DRIVE_API_KEY)}`;
}

/**
 * Membuat URL dokumen berdasarkan sumber paket.
 */
export function buatUrlFile(paket) {
    if (!paket) {
        throw new Error('Data paket tidak ditemukan.');
    }

    const sumber = String(paket.sumber || 'lokal').toLowerCase();
    const file = String(paket.file || '').trim();

    if (!file) {
        throw new Error('Lokasi file DOCX belum diisi.');
    }

    if (sumber === 'lokal') {
        return file;
    }

    if (sumber === 'github') {
        return ubahGitHubRaw(file);
    }

    if (sumber === 'drive') {
        const id = ambilDriveId(file);

        periksaApiKey();

        return urlDriveLangsung(id);
    }

    throw new Error(`Sumber paket "${sumber}" tidak dikenali.`);
}

/* =========================================================
   CACHE INDEXEDDB
   Dokumen disimpan di perangkat siswa agar:
   - pemuatan ulang halaman tidak mengunduh ulang,
   - sesi ujian tetap bisa dipulihkan saat internet mati.
========================================================= */

function kunciCache(paket) {
    const sumber = String(paket.sumber || 'lokal').toLowerCase();

    return sumber + '|' + String(paket.file || '').trim();
}

function bukaDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB tidak tersedia'));
            return;
        }

        const request = indexedDB.open(DB_CACHE, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_CACHE);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function cacheBaca(kunci) {
    try {
        const db = await bukaDb();

        const hasil = await new Promise(resolve => {
            const tx = db.transaction(STORE_CACHE, 'readonly');
            const req = tx.objectStore(STORE_CACHE).get(kunci);

            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });

        db.close();

        return hasil;
    } catch (_) {
        return null;
    }
}

async function cacheTulis(kunci, buffer) {
    try {
        const db = await bukaDb();

        await new Promise(resolve => {
            const tx = db.transaction(STORE_CACHE, 'readwrite');
            const store = tx.objectStore(STORE_CACHE);

            store.put({ buffer, waktu: Date.now() }, kunci);

            // Hapus entri terlama jika melebihi batas.
            const semua = [];

            store.openCursor().onsuccess = event => {
                const cursor = event.target.result;

                if (cursor) {
                    semua.push({
                        k: cursor.key,
                        w: (cursor.value && cursor.value.waktu) || 0
                    });

                    cursor.continue();
                    return;
                }

                semua
                    .sort((a, b) => b.w - a.w)
                    .slice(MAKS_ENTRI_CACHE)
                    .forEach(item => store.delete(item.k));
            };

            tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
        });

        db.close();
    } catch (_) {
        // Cache bersifat tambahan; kegagalan diabaikan.
    }
}

/* =========================================================
   UNDUH DARI JARINGAN
========================================================= */

/**
 * Mengambil response dari URL (dengan sinyal pembatalan).
 * "no-cache" = boleh memakai cache browser, tetapi selalu
 * divalidasi ke server (hemat data bila file tidak berubah).
 */
async function ambilResponse(url, signal) {
    try {
        return await fetch(url, {
            method: 'GET',
            cache: 'no-cache',
            signal
        });
    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw galat(
                'Koneksi terlalu lambat saat mengambil dokumen soal.',
                true
            );
        }

        throw galat(
            'Tidak dapat mengakses file. Periksa koneksi, izin berbagi, API key, dan CORS server.',
            true
        );
    }
}

/**
 * Satu kali unduh dari jaringan (tanpa cache IndexedDB).
 *
 * Untuk Google Drive: dicoba unduh langsung lebih dulu.
 * Jika ditolak (file adalah Google Docs asli), otomatis
 * dicoba lewat ekspor ke DOCX.
 */
async function unduhJaringan(paket) {
    const url = buatUrlFile(paket);
    const sumber = String(paket.sumber || 'lokal').toLowerCase();

    const pengendali = new AbortController();
    const penghitung = setTimeout(
        () => pengendali.abort(),
        BATAS_UNDUH_MS
    );

    try {
        let response = await ambilResponse(url, pengendali.signal);

        if (
            !response.ok &&
            sumber === 'drive' &&
            (response.status === 403 || response.status === 400)
        ) {
            const id = ambilDriveId(paket.file);

            const cadangan = await ambilResponse(
                urlDriveEkspor(id),
                pengendali.signal
            );

            if (cadangan.ok) {
                response = cadangan;
            }
        }

        if (!response.ok) {
            if (response.status === 403) {
                throw galat(
                    'Akses ditolak. Periksa izin file Google Drive (siapa saja yang memiliki link), Drive API, dan API key.'
                );
            }

            if (response.status === 404) {
                throw galat(
                    'File tidak ditemukan. Periksa kembali link atau ID file.'
                );
            }

            throw galat(
                `Gagal mengambil dokumen. HTTP ${response.status}.`,
                response.status >= 500 || response.status === 429
            );
        }

        const contentType = (
            response.headers.get('content-type') || ''
        ).toLowerCase();

        if (
            contentType.includes('text/html') ||
            contentType.includes('application/json')
        ) {
            throw galat(
                'Server tidak mengirim dokumen DOCX. Periksa link dan izin akses file.'
            );
        }

        const buffer = await response.arrayBuffer();

        if (!buffer.byteLength) {
            throw galat('Dokumen DOCX kosong.');
        }

        // DOCX adalah file ZIP, sehingga diawali signature PK.
        const bytes = new Uint8Array(buffer);

        if (
            bytes.length < 4 ||
            bytes[0] !== 0x50 ||
            bytes[1] !== 0x4B
        ) {
            throw galat(
                'File yang diterima bukan DOCX yang valid. Pastikan file benar-benar berformat .docx.'
            );
        }

        return buffer;

    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw galat(
                'Koneksi terlalu lambat saat mengunduh dokumen soal.',
                true
            );
        }

        throw error;

    } finally {
        clearTimeout(penghitung);
    }
}

/* =========================================================
   FUNGSI UTAMA
========================================================= */

/**
 * Mengambil dokumen DOCX sebagai ArrayBuffer.
 *
 * Opsi:
 *   utamakanCache = true  -> pakai salinan di perangkat lebih
 *                            dulu (dipakai saat memulihkan sesi
 *                            agar soal sama persis dan bisa
 *                            dibuka tanpa internet).
 *
 * Alur:
 *   1. (opsional) cache perangkat
 *   2. jaringan, maksimal 3 kali dengan jeda bertahap
 *   3. jika jaringan gagal -> cache perangkat bila ada
 *
 * Kesalahan non-jaringan (403, 404, file rusak) tidak
 * dialihkan ke cache supaya masalah tidak tersembunyi.
 */
export async function ambilDokumen(paket, opsi = {}) {
    const kunci = kunciCache(paket);

    // Validasi pengaturan paket lebih awal.
    buatUrlFile(paket);

    if (opsi.utamakanCache) {
        const tersimpan = await cacheBaca(kunci);

        if (tersimpan && tersimpan.buffer) {
            return tersimpan.buffer;
        }
    }

    let terakhir;

    for (let i = 0; i < JUMLAH_COBA; i++) {
        try {
            const buffer = await unduhJaringan(paket);

            cacheTulis(kunci, buffer);

            return buffer;

        } catch (error) {
            terakhir = error;

            if (!error || !error.bisaDiulang) {
                throw error;
            }

            if (i < JUMLAH_COBA - 1) {
                await tunda(1000 * (i + 1));
            }
        }
    }

    const cadangan = await cacheBaca(kunci);

    if (cadangan && cadangan.buffer) {
        return cadangan.buffer;
    }

    throw terakhir;
}