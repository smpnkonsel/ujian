import { DRIVE_API_KEY } from './storageConfig.js';

const MIME_DOCX =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

/**
 * Mengambil response dari URL.
 */
async function ambilResponse(url) {
    try {
        return await fetch(url, {
            method: 'GET',
            cache: 'no-store'
        });
    } catch (error) {
        throw new Error(
            'Tidak dapat mengakses file. Periksa koneksi, izin berbagi, API key, dan CORS server.'
        );
    }
}

/**
 * Mengambil dokumen DOCX sebagai ArrayBuffer.
 *
 * Untuk Google Drive: dicoba unduh langsung lebih dulu.
 * Jika ditolak (file adalah Google Docs asli), otomatis
 * dicoba lewat ekspor ke DOCX.
 */
export async function ambilDokumen(paket) {
    const url = buatUrlFile(paket);

    let response = await ambilResponse(url);

    const sumber = String(paket.sumber || 'lokal').toLowerCase();

    if (
        !response.ok &&
        sumber === 'drive' &&
        (response.status === 403 || response.status === 400)
    ) {
        const id = ambilDriveId(paket.file);
        const cadangan = await ambilResponse(urlDriveEkspor(id));

        if (cadangan.ok) {
            response = cadangan;
        }
    }

    if (!response.ok) {
        if (response.status === 403) {
            throw new Error(
                'Akses ditolak. Periksa izin file Google Drive (siapa saja yang memiliki link), Drive API, dan API key.'
            );
        }

        if (response.status === 404) {
            throw new Error('File tidak ditemukan. Periksa kembali link atau ID file.');
        }

        throw new Error(`Gagal mengambil dokumen. HTTP ${response.status}.`);
    }

    const contentType = (
        response.headers.get('content-type') || ''
    ).toLowerCase();

    if (
        contentType.includes('text/html') ||
        contentType.includes('application/json')
    ) {
        throw new Error(
            'Server tidak mengirim dokumen DOCX. Periksa link dan izin akses file.'
        );
    }

    const buffer = await response.arrayBuffer();

    if (!buffer.byteLength) {
        throw new Error('Dokumen DOCX kosong.');
    }

    // DOCX adalah file ZIP, sehingga diawali signature PK.
    const bytes = new Uint8Array(buffer);

    if (
        bytes.length < 4 ||
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4B
    ) {
        throw new Error(
            'File yang diterima bukan DOCX yang valid. Pastikan file benar-benar berformat .docx.'
        );
    }

    return buffer;
}