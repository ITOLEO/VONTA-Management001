# Product Brief: VONTA

## 1. Identitas

**VONTA Management** adalah SaaS untuk mengelola pekerjaan konstruksi melalui web. Tagline produk adalah **Precision at Every Pin**. Pemilik produk adalah ItoLeo, mahasiswa Digital Business. Konteks awal penggunaan adalah proyek konstruksi di Indonesia. Antarmuka memakai bahasa Inggris dan dokumen kerja memakai bahasa Indonesia.

**Versi 1.1 · 20 November 2026 · Draf untuk ditinjau ItoLeo**

## 2. Positioning

Saya membantu kontraktor menjawab pertanyaan pemilik proyek saat keduanya berada jauh dari lapangan. Di VONTA, kontraktor membuka satu titik pekerjaan pada model 3D. Dari titik itu, pemilik dapat melihat lokasi, penanggung jawab, kebutuhan material, foto sebelum dan sesudah pekerjaan, serta keputusan mandor.

Titik pekerjaan ini disebut **Spatial Pin**, atau **Pin**. Model 3D, daftar pekerjaan, dan permintaan gudang menggunakan identitas Pin yang sama.

## 3. Masalah

- **Kontraktor** perlu menjelaskan material yang dibeli, pekerjaan yang tertahan, dan alasan keterlambatan. Laporan jumlah material saja belum menjawab bagian bangunan mana yang membutuhkannya.
- **Pemilik proyek** dapat menangani beberapa proyek sekaligus. Dari laptop, ia ingin menemukan pekerjaan yang sudah diperiksa dan melihat bukti pada lokasi yang tepat.
- **Pimpinan lapangan** yang diwawancarai ItoLeo menceritakan pekerja yang absen tanpa kabar. Dalam satu kasus, pekerja yang sudah dikontrak berhenti datang dan perlu diganti.
- **Pertanyaan yang masih perlu diuji** adalah apakah pemilik dan kontraktor dapat menelusuri satu pekerjaan sendiri, dari lokasi pada denah sampai bukti penyelesaiannya.

## 4. Pengguna dan akses

Setelah login, pengguna melihat proyek yang dapat ia akses. Saat membuka proyek, VONTA menampilkan dashboard sesuai keanggotaannya di proyek itu.

| Dashboard | Pengguna dan pekerjaan utama |
|---|---|
| Admin | Pemilik proyek yang diundang Contractor. Ia memantau progres, material, hambatan, dan bukti pekerjaan pada proyeknya. |
| Contractor | Kontraktor memiliki akses penuh ke fitur proyeknya dari dashboard Contractor. Ia menerbitkan model 3D, menentukan departemen, mengundang Admin, dan mengatur akses serta tim melalui User Management. Aturan bukti, stok, dan anggaran berlaku untuk setiap transaksi. |
| Worker | Pekerja melihat penugasan, menemukan lokasi Pin, mencatat kehadiran bila digunakan, dan mengirim foto pekerjaan. Contractor dapat memberikan akses Mandor atau Accounting dari User Management. |

**Mandor** dapat membuat dan mengedit Pin, menugaskan pekerja, meminta material dari Pin, memeriksa hasil kerja, dan meninjau izin. Untuk absensi manual, Mandor hanya dapat mencatat pekerja yang ditugaskan kepadanya di divisinya. Satu divisi dapat memiliki beberapa Mandor.

**Accounting** menjalankan fungsi gudang dan mengelola anggaran departemen. Ia dapat mengedit dan menyetujui permintaan stok maupun pembelian, memesan langsung ke pemasok setelah persetujuannya, serta mencatat penyerahan dan penerimaan aktual. Departemen pekerjaan awal mencakup Sipil, Listrik, Pipa, dan Finishing.

## 5. Manfaat dan pengalaman utama

Pengunjung membaca apa itu VONTA di Landing. Setelah masuk, ia membuka **My Projects**, memilih proyek, lalu melihat **Project Overview**. Pada laptop, informasi proyek berada di kiri dan pratinjau denah di kanan. Dari sana, ia membuka **Spatial Workspace**.

Contoh penggunaan: pemilik ingin tahu apakah pekerjaan pada dinding pemisah dua ruang sudah selesai. Contractor memilih Pin pada dinding itu. Nama pekerja, jumlah material yang sudah diserahkan, foto Before/After, dan hasil pemeriksaan muncul untuk pekerjaan tersebut. Jika Pin masih menunggu material atau revisi, pemilik dapat melihat penyebab yang tercatat.

## 6. Bukti dan bahan uji

- **Wawancara lapangan.** ItoLeo mendengar langsung keluhan tentang ketidakhadiran pekerja. Frekuensi dan dampak biayanya masih perlu diukur.
- **Prototipe sebelumnya.** Materi prototipe memperlihatkan pemilihan Pin dengan empat contoh pekerjaan pada geometri sintetis.
- **Denah uji tersedia.** Lembar simulasi *Paviliun Kerja*, A-03 R00, memiliki denah satu lantai dan dua potongan. Panjang as K1–K2 adalah 8.400 mm. Lebar bersih Ruang Rapat arah utara–selatan adalah 2.875 mm. Ukuran kedua menjadi pemeriksaan independen setelah kalibrasi.
- **Bukti yang perlu dikumpulkan.** Hasil konversi pada denah proyek nyata, selisih ukuran model terhadap gambar sumber, serta hasil penggunaan oleh kontraktor dan pemilik. Dua pasang foto berlabel uji dapat digunakan untuk memeriksa dua Pin berbeda pada satu dinding.

## 7. Ruang lingkup dan arah desain

### Lima kemampuan inti

1. **Denah 2D menjadi model 3D.** Mulai dari satu lantai berdimensi pada satu halaman PDF, PNG, atau JPG. Pengguna mengonfirmasi skala, tinggi, dan tebal dinding. AI mengusulkan elemen. Sistem memeriksa usulan dan membangun geometri 3D yang dapat diukur serta dipilih. Contractor membandingkan draf dengan denah, mengoreksi, memverifikasi, lalu menerbitkan versi model.
2. **Workspace 3D dan Spatial Pin.** Mandor memilih permukaan pada model terbit, membuat Pin, lalu menetapkan pekerjaan dan material. Pin menyimpan lokasi, elemen, dan versi model. Jika revisi model mengubah elemen tersebut, pengguna berwenang memeriksa kembali lokasi Pin dan mencatat hasilnya.
3. **Pekerjaan dan pemeriksaan mutu.** Pekerja menyimpan foto Before sebelum mulai. Ia menambahkan foto After untuk siklus kerja yang sama sebelum mengajukan pemeriksaan. Mandor menyetujui hasil atau meminta revisi dengan alasan. Siklus dan bukti terdahulu tetap dapat ditelusuri.
4. **Material dan gudang.** Dari Pin, pengguna melihat material yang dibutuhkan, jumlah yang diminta, jumlah yang diserahkan, dan sisanya. Permintaan dapat disimpan sambil menunggu penunjukan Accounting. Reservasi memperhitungkan stok tersedia. Penyerahan dan penerimaan dicatat berdasarkan jumlah aktual.
5. **Pemantauan proyek.** Progres dihitung dari Pin yang memenuhi syarat dan sudah disetujui pada siklus terkini. Pemilik dapat membuka pekerjaan di balik angka tersebut, melihat yang menunggu pemeriksaan, dan menelusuri hambatan.

**Fitur pendukung.** Akun, undangan, organisasi, pergantian proyek, pengelolaan tim, dan riwayat mendukung kelima kemampuan inti. Accounting dan Absensi merupakan opsi operasional yang harus berfungsi saat digunakan. Jika anggaran tidak mencukupi, sistem menolak persetujuan dan menyimpan riwayat percobaan. Biaya pendatangan memakai jumlah diterima dan harga beli aktual. Nilai pemakaian internal departemen memakai jumlah diserahkan dan harga saat penyerahan. Untuk absensi manual, simpan nama pekerja, Mandor yang mencatat, tanggal, dan alasan.

**Di luar versi pertama:** pembukuan umum, payroll, marketplace pemasok, serta manajemen keuangan perusahaan.

### Tipografi dan identitas

Gambar referensi menunjukkan judul besar dan tegas, teks pengantar yang lapang, serta tombol dengan label singkat. VONTA memakai **Inter**. Usulan awal untuk desktop adalah judul Landing 48/52 px, judul halaman aplikasi 26/32 px, judul panel 18/24 px, isi 15/22 px, tombol 14/20 px, dan metadata 13/18 px. Pasangan angka menyatakan ukuran huruf dan tinggi baris. Nilai ini adalah titik awal desain. Pada daftar Pin, nama pekerjaan dan status mendapat prioritas baca sebelum kode teknis.

Tema awal terang. Gunakan navy `#1B2A4A` untuk hierarki, orange `#D4652F` untuk Pin dan seleksi, serta orange aksi `#A64011` untuk tombol utama. Panel putih `#FFFFFF` berada di atas latar `#F4F3EF`.

### Workspace 3D dan navigasi

Pola editor Canva Presentations diterapkan khusus pada **Spatial Workspace**. Model teknis abu-abu mengisi area tengah. Panel samping memuat alat lokasi dan lapisan. Saat pengguna memilih elemen atau Pin, panel detail di kanan menampilkan pilihan itu. Kontrol kamera menyediakan tampilan keseluruhan, fokus ruang, dan fokus Pin. Pada ponsel, pengguna dapat memilih Pin dari daftar dan membuka detail dari bawah layar.

Pada desktop, usulan penempatan navbar workspace adalah **tepi kiri**. Saat tersembunyi, sisakan pegangan menu yang terlihat. Navbar terbuka ketika kursor mencapai pegangan atau pengguna memfokuskannya dengan keyboard. Selama kursor atau fokus berada di dalam menu, navbar tetap terbuka. Pengguna dapat menutupnya dengan Escape. Di layar sentuh, tombol Menu membuka dan menutup navigasi. Membuka menu mempertahankan posisi kamera dan Pin terpilih.

## 8. Batasan pengerjaan

- Anggaran pembangunan awal **Rp0**. Biaya operasional setelah uji coba ditanggung pemegang proyek pertama. Nominalnya masih perlu ditetapkan.
- Rencana pengerjaan **empat pertemuan**, dengan target uji pertama **10 Desember 2026**.
- Target teknologi adalah React, Vite, dan TypeScript untuk web, Three.js untuk geometri, Supabase untuk akun, data dan berkas privat, serta Vercel untuk deployment.
- Laptop menjadi perangkat utama peninjauan model. Ponsel mendukung pencarian Pin, pengambilan foto, dan pekerjaan lapangan. Akses data dan bukti mengikuti keanggotaan proyek.
- Toleransi akurasi model dan batas kompleksitas denah ditetapkan melalui uji pada gambar yang mewakili proyek nyata.

## 9. Headline dan CTA

- **Headline A:** See what’s happening on site, even when you’re away.
- **Headline B:** From blueprint to jobsite, see the work behind every pin.
- **CTA:** Open My Projects

## 10. Ukuran keberhasilan

| Uji | Hasil yang dapat diperiksa |
|---|---|
| 1. Lokasi dan model | Pada A-03 R00, kalibrasikan 8.400 mm, ukur ulang jarak bersih 2.875 mm pada model, lalu catat selisihnya. Setelah model uji diterbitkan, buat dua Pin pada sisi Ruang Rapat dari dinding pemisah Ruang Arsip. Buka ulang proyek. Setiap Pin membawa kamera, detail, dan pilihan ke lokasi yang tersimpan. |
| 2. Bukti dan mutu | Pekerja hanya bisa mulai setelah foto Before tersimpan. Pengajuan pemeriksaan membutuhkan After pada siklus yang sama. Membuka masing-masing Pin menampilkan pasangan foto, material, dan keputusan miliknya. Progres bertambah setelah pekerjaan disetujui. |
| 3. Material dan anggaran | Dalam contoh uji, 10 unit dipesan dan 6 diterima. Stok bertambah 6 dan 4 masih ditunggu. Telusuri penerimaan sampai Pin asal. Pada percobaan yang melebihi sisa anggaran, hasil penolakan dapat dibuka kembali di riwayat. |
| 4. Dashboard dan tim | Admin berpindah antara dua proyek yang diizinkan dan melihat data sesuai proyek aktif. Contractor menerbitkan model dari dashboard miliknya. Dua Mandor dalam satu divisi hanya dapat mengabsenkan anggota tim masing-masing. Roster membedakan hadir, absen tercatat, izin tertunda, dan belum ada catatan. |
| 5. Navigasi workspace | Dengan satu Pin terpilih, buka dan tutup navbar memakai kursor, lalu keyboard. Ulangi dengan tombol Menu di ponsel. Pengguna kembali ke Pin yang sama dan dapat melanjutkan pekerjaannya. |

**Rujukan desain:** Gambar tipografi yang diberikan ItoLeo dan Wireframe & Gaya VONTA menjadi acuan hierarki teks. Pola editor diperiksa melalui panduan dan gambar resmi [Canva Design School](https://www.canva.com/design-school/resources/using-and-customizing-templates/). Prinsip penulisan diadaptasi secara fleksibel dari [ASD-STE100](https://www.asd-ste100.org/STE_faq.html): kalimat aktif, istilah konsisten, dan instruksi yang mudah diikuti.
