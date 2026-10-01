=== slug: introduction
title: Pengantar
group: start
summary: Arc Kit adalah rangkaian alat on-chain untuk tim dan pengguna di Arc, blockchain native-USDC dari Circle. Kunci, vesting, stake, distribusikan, belanjakan, dan pindahkan nilai secara privat — dengan bukti publik yang dapat diverifikasi dan tanpa logika tersembunyi.
===
## Apa itu Arc Kit

Arc Kit adalah kumpulan produk yang terus bertambah dan sepenuhnya berjalan di **Arc** (chain id 5042), tempat koin gas native-nya adalah USDC. Setiap produk terdiri dari kontrak pintar yang tidak dapat diubah plus aplikasi web; aplikasinya hanya kemudahan, kontraknya adalah produknya. Apa pun yang bisa Anda lakukan di aplikasi dapat diverifikasi di [arc.etherscan.io](https://arc.etherscan.io), tempat kode sumber setiap kontrak dipublikasikan.

![Beranda Arc Kit](/docs/home.jpg)

## Sembilan alat

| Alat | Fungsi | Status |
|---|---|---|
| [ArcLock](/docs/arclock) | Kunci token atau LP hingga tanggal tertentu, atau vesting linear dengan cliff. Sertifikat publik untuk setiap kunci. | Live |
| [Arc Bulk Airdrop](/docs/airdrop) | Kirim token apa pun atau USDC ke ratusan dompet per transaksi. | Live |
| [Arc Staking](/docs/staking) | Buka pool hadiah berbatas waktu untuk token Anda dalam satu transaksi. | Live |
| [ArcFlow](/docs/arcflow) | Likuiditas Uniswap v4 di Arc: stake terkonsentrasi, posisi berbentuk, hook biaya dinamis, kunci likuiditas. | Live (beta) |
| [ArcPay](/docs/arcpay) | Belanjakan USDC untuk kartu hadiah dan isi ulang pulsa dari ribuan merek. | Live |
| [Arc Kit MCP](/docs/mcp) | Beri agen AI apa pun dompet USDC sendiri di Arc dan biarkan ia membeli untuk Anda. | Live |
| [ArcLend](/docs/arclend) | Pinjamkan USDC dan hasilkan, atau pinjam USDC dengan jaminan token Anda. Pasar terisolasi, harga TWAP on-chain. | Live |
| [ArcCash](/docs/arccash) | Transfer privat dengan bukti zero-knowledge. Gas dibayar Arc Kit. | Live |
| Arc Redeployment | Pindahkan proyek dari chain lain ke Arc secara otomatis. | Segera hadir |

## Prinsip

- **Tidak dapat diubah.** Tidak ada kontrak yang memiliki jalur upgrade atau tombol jeda yang dapat menyentuh dana pengguna. Pemilik dapat mengubah biaya dan penerima biaya, tidak lebih.
- **Dapat diverifikasi.** Setiap kontrak terverifikasi sumbernya di Etherscan. Setiap kunci, jadwal, pool, dan posisi memiliki halaman publik yang dapat dibuka siapa pun tanpa dompet.
- **Biaya dalam USDC.** Karena USDC adalah koin gas Arc, setiap biaya adalah jumlah tetap yang dapat diprediksi dalam dolar.

> [!TIP] Baru di sini? Mulai dengan [Memulai](/docs/getting-started), lalu pilih alat yang Anda butuhkan dari sidebar.

=== slug: getting-started
title: Memulai
group: start
summary: Semua yang Anda butuhkan sebelum transaksi pertama: dompet, jaringan Arc, dan sedikit USDC untuk gas.
===
## 1. Dompet

Arc Kit bekerja dengan dompet EVM apa pun yang mendukung jaringan kustom: MetaMask, Rabby, Coinbase Wallet, Trust, dan dompet perangkat keras melalui mereka. Tekan **Hubungkan dompet** di kanan atas; jika Arc belum ada di dompet Anda, aplikasi menawarkan untuk menambahkannya.

## 2. Jaringan Arc

| Pengaturan | Nilai |
|---|---|
| Nama jaringan | Arc |
| Chain id | 5042 |
| Mata uang | USDC (18 desimal on-chain) |
| RPC | `https://5042.rpc.thirdweb.com` (disarankan), `https://rpc.arc-scan.org` |
| Explorer | `https://arc.etherscan.io` |

> [!NOTE] Beberapa dompet menyertakan Arc dengan RPC yang sering gagal. Jika transaksi gagal sebelum dikirim, aplikasi menampilkan tombol **Perbaiki RPC dompet** yang mengalihkan dompet Anda ke endpoint yang lebih sehat.

## 3. USDC untuk gas dan biaya

Gas di Arc dibayar dalam USDC dan biayanya kurang dari satu sen per transaksi. Biaya Arc Kit sendiri adalah jumlah tetap dalam USDC (10 USDC untuk kunci, jadwal vesting, transaksi airdrop, pool staking, atau kunci likuiditas) dan ditampilkan sebelum Anda konfirmasi.

## 4. Tindakan pertama Anda

- **Kunci token atau LP:** [Kunci](/lock/new)
- **Vesting token ke anggota tim:** [Vesting](/vest/new)
- **Kirim airdrop:** [Airdrop](/airdrop)
- **Buka pool staking:** [Stake](/stake)
- **Belanjakan USDC untuk kartu hadiah:** [Bayar](/pay)

## 5. Bahasa

Situs tersedia dalam bahasa Inggris, 中文, dan Bahasa Indonesia. Gunakan tombol **EN / 中文 / ID** di bar atas; pilihan disimpan di perangkat Anda.

=== slug: arclock
title: ArcLock
group: products
summary: Kunci cliff dan vesting linear untuk token atau posisi LP apa pun, dengan sertifikat publik yang dapat diverifikasi siapa pun.
===
## Kunci

Kunci memindahkan token dari dompet Anda ke kontrak locker hingga tanggal yang Anda pilih. Tidak ada yang bisa melepaskannya lebih awal, termasuk kami. Setiap kunci memiliki **pemilik** (dapat top up, perpanjang, pisah, transfer) dan **penarik** (dapat mengambil token setelah tanggalnya). Keduanya bisa dompet yang sama atau berbeda.

![Membuat kunci](/docs/lock.jpg)

### Membuat kunci

1. Tempel alamat kontrak token atau LP. Untuk LP, tempel alamat pair: token LP bergaya Uniswap adalah ERC-20 biasa.
2. Masukkan jumlah dan pilih tanggal (preset dari 30 hari hingga 4 tahun, atau tanggal dan waktu kustom).
3. Opsional: tetapkan dompet penarik yang berbeda.
4. Setujui tepat sejumlah itu, lalu konfirmasi kunci. Biaya tetap: 10 USDC.

### Mengelola kunci

- **Top up** dengan token yang sama, tanpa biaya.
- **Perpanjang** tanggal pembukaan. Hanya bisa diundur, tidak pernah dimajukan.
- **Pisah** sebagian kunci ke kunci baru dengan tanggal dan peran yang sama.
- **Transfer** kepemilikan, opsional bersama hak penarikan.
- **Ganti penarik** (hanya penarik saat ini yang bisa).
- **Tarik** sebagian atau seluruhnya setelah tanggal pembukaan.

### Sertifikat

Setiap kunci memiliki halaman publik di `/lock/<id>` dengan hitung mundur langsung, jumlah, token, dan peran, dibaca langsung dari chain. Bagikan di komunitas Anda; tidak ada yang perlu percaya pada tangkapan layar.

![Sertifikat kunci publik](/docs/lock-detail.jpg)

## Vesting

Vesting melepaskan token secara linear antara tanggal mulai dan akhir, dengan **cliff** opsional: tidak ada yang dapat diklaim sebelum cliff, dan pada cliff bagian yang sudah berlalu terbuka sekaligus.

![Membuat jadwal vesting](/docs/vest.jpg)

- Jadwal **tidak dapat dicabut** dan tanggalnya tidak dapat diubah setelah dibuat. Token tersimpan di kontrak vesting dan hanya dapat menuju penerima manfaat.
- Penerima manfaat dapat mengklaim sesering yang mereka mau (gas satu-satunya biaya) dan dapat menyerahkan jadwal ke dompet lain.
- Tanggal mulai di masa lalu diperbolehkan: jadwal hanya dimulai dengan sebagian sudah vested.
- Tabel tim: buat banyak jadwal untuk satu token dalam satu transaksi, satu biaya per jadwal.

## Properti keamanan

- Penegakan biaya yang tepat; biaya ditarik oleh penerima biaya, tidak pernah didorong, sehingga penerima yang bermasalah tidak pernah bisa memblokir pengguna.
- Token dengan biaya transfer dicatat sebesar jumlah yang benar-benar diterima kontrak, sehingga tidak dapat menguras kunci pengguna lain.
- Pengaman reentrancy pada setiap panggilan yang mengubah state.

> [!WARNING] Kontrak tidak dapat diubah. Salah ketik alamat penarik atau penerima manfaat hanya bisa diperbaiki oleh dompet yang memegang peran tersebut.

=== slug: airdrop
title: Arc Bulk Airdrop
group: products
summary: Kirim ERC-20 apa pun atau USDC native ke ratusan dompet per transaksi, dari daftar yang ditempel atau file yang diunggah.
===
## Cara kerjanya

Tempel daftar atau unggah file CSV, TXT, atau JSON. Aplikasi memvalidasi setiap baris, menggabungkan duplikat jika Anda mau, membagi daftar ke dalam batch hingga 500 penerima, dan menandatangani satu transaksi per batch. Token **langsung dari dompet Anda ke setiap penerima**; kontrak tidak pernah memegangnya.

![Alat airdrop](/docs/airdrop.jpg)

## Format input

- Satu penerima per baris: `alamat, jumlah`. Koma, spasi, tab, titik koma, dan `=` semuanya berfungsi.
- CSV dengan header, array JSON `{ address, amount }`, atau daftar alamat biasa dengan satu jumlah untuk semua.
- Jumlah dalam token utuh; aplikasi menerapkan desimal token.

## Jaminan

- Setiap batch bersifat **semua-atau-tidak**: jika satu transfer gagal (misalnya kontrak penerima yang menolak USDC), seluruh batch dibatalkan dan tidak ada yang dikirim.
- Airdrop USDC native meneruskan jumlah yang tepat dan mengembalikan kelebihan dalam transaksi yang sama.
- Biaya tetap: 10 USDC per transaksi, berapa pun jumlah penerimanya.

## Melanjutkan

Jika batch berikutnya gagal atau Anda menutup tab, kembali dan gunakan **Lanjutkan dari batch** untuk melanjutkan dari tempat Anda berhenti tanpa mengirim ulang batch sebelumnya.

=== slug: staking
title: Arc Staking
group: products
summary: Pool hadiah berbatas waktu untuk token apa pun: pembuat memilih durasi dan menyetor hadiah; staker menghasilkan setiap detik.
===
## Untuk proyek

Buka pool dalam satu transaksi: pilih berapa lama berjalan (3, 7, 30 hari, atau apa pun dari satu jam hingga empat tahun), setor token hadiah di awal, dan putuskan apakah penarikan awal dikenakan penalti. Hadiah mengalir merata dari awal hingga akhir kepada siapa pun yang stake, sebanding dengan stake mereka.

![Pool staking](/docs/stake.jpg)

- Token hadiah bisa token yang di-stake atau token lain.
- Batas opsional: stake minimum, maksimum per dompet, batas total, mulai tertunda.
- Penalti keluar lebih awal opsional (hingga 50%), dibayarkan ke staker yang bertahan atau ke pembuat.
- Pembuat dapat **menambah hadiah**, **memperpanjang** periode, dan **menjeda stake baru**. Setelah pool berakhir mereka dapat mengambil kembali hadiah yang tidak didapat siapa pun (waktu tanpa ada yang stake). Mereka **tidak pernah** dapat menyentuh setoran staker atau yang sudah didapat staker.
- Biaya tetap: 10 USDC per pool.

## Untuk staker

APR yang Anda lihat dihitung langsung dari dua angka: hadiah yang tersisa untuk didistribusikan dan total yang saat ini di-stake. Setengah stake, dua kali APR. Stake, klaim, compound (saat hadiahnya adalah token yang di-stake), atau unstake kapan saja; setelah tanggal berakhir, setiap penarikan gratis.

## Pool yang dapat dibagikan

Setiap pool memiliki halaman di `/stake/<id>`, dan setiap token memiliki halaman di `/stake/token/<alamat>` yang selalu membuka pool aktif untuk token itu, sehingga satu tautan tetap berfungsi dari peluncuran ke peluncuran.

=== slug: arcflow
title: ArcFlow
group: products
summary: Likuiditas Uniswap v4 di Arc, dibuat sederhana: stake USDC terkonsentrasi, posisi berbentuk, hook biaya dinamis, dan kunci likuiditas publik.
===
## Apa itu ArcFlow

Uniswap v4 di Arc adalah tempat token di Arc diperdagangkan. ArcFlow memungkinkan Anda mengerjakan USDC di pool USDC mana pun tanpa memahami tick dan rentang, dan memungkinkan proyek membuktikan likuiditasnya terkunci.

![ArcFlow](/docs/flow.jpg)

## Stake (terkonsentrasi)

Setor USDC ke dalam **pita** di sekitar harga saat ini: Sempit, Sedang, atau Lebar. Vault menukar porsi yang tepat di dalam pool dan menambahkan kedua token ke pita. Pita yang lebih sempit menghasilkan lebih banyak biaya per dolar tetapi lebih cepat keluar rentang; saat harga keluar, siapa pun dapat **memusatkannya kembali** (tandai, lalu rebalance sepuluh menit kemudian) dan mendapat bounty 0,5% untuk itu.

- Biaya swap dipanen, dikonversi ke USDC (1% ke protokol), dan **dialirkan ke staker selama 7 hari**. Klaim, compound, atau unstake ke USDC kapan saja.
- Uang Anda di sebuah pita disimpan terpisah dari setiap pita lain di vault.
- Batas beta: 25.000 USDC per strategi.

## Posisi (berbentuk)

Buka posisi Anda sendiri dengan **bentuk**: Spot (satu rentang merata), Kurva (terpadat di harga), atau Bid-ask (terberat di tepi), plus rentang kustom jika Anda mau. Kumpulkan biaya kapan pun, tutup ke USDC, atau kunci.

## Kunci likuiditas

Tekan **Kunci likuiditas** pada posisi dan pilih tanggal. Selama kunci aktif, kontrak menolak setiap upaya menghapus likuiditas itu, termasuk oleh pemiliknya; biaya tetap dapat dikumpulkan. Kunci memiliki halaman bukti publik dan muncul di [daftar likuiditas terkunci](/flow/locks). Biaya: 10 USDC.

![Likuiditas terkunci](/docs/flow-locks.jpg)

## Hook biaya dinamis

Pool baru dapat memasang hook biaya ArcFlow: biaya swap mulai dari 0,30% dan naik seiring volatilitas (0,001% per tick pergerakan dari referensi 10 menit, maksimal 3%), lalu turun kembali. Hook ditetapkan saat pool dibuat, jadi ini hanya untuk pool yang dibuat dengannya.

> [!NOTE] ArcFlow masih beta. Pool dengan hook pihak ketiga (misalnya dari launchpad) ditandai di aplikasi dengan penjelasan apa yang bisa dilakukan hook tersebut.

=== slug: arcpay
title: ArcPay
group: products
summary: Belanjakan USDC di dompet Arc Anda untuk kartu hadiah dan isi ulang pulsa dari ribuan merek di 100+ negara.
===
## Cara kerjanya

1. Buka [Bayar](/pay). Ia mendeteksi negara Anda dan menampilkan yang populer di sana, dalam mata uang lokal. Cari merek apa pun atau ganti negara.
2. Pilih produk dan jumlah. Anda melihat **harga tepat dalam USDC** sebelum membayar, sudah termasuk biaya konversi.
3. Bayar dalam satu ketukan: satu transaksi, tanpa persetujuan token.
4. Kode Anda muncul di halaman, biasanya kurang dari satu menit, beserta langkah penukarannya.

![ArcPay](/docs/pay.jpg)

## Apa yang membuatnya berbeda

- **Tanpa kartu, tanpa bank, tanpa formulir KYC.** Cukup dompet Anda.
- **Harga yang Anda lihat adalah harga yang Anda bayar.** Biaya konversi dan jaringan sudah termasuk di awal.
- **Pengembalian otomatis.** Jika pesanan tidak dapat diselesaikan setelah Anda membayar, USDC Anda dikirim kembali ke dompet.
- **Kode yang hanya bisa Anda buka.** Tanda tangan dompet gratis membuktikan kode milik Anda. Tersimpan di **Pembelian saya**.

## Di balik layar

Pembayaran Anda masuk ke kontrak router ArcPay, yang meneruskannya ke treasury ArcPay dalam panggilan yang sama dan tidak memegang apa pun. Mesin status pesanan bersifat idempoten: setiap langkah dicatat sebelum dijalankan, sehingga crash tidak pernah dapat menagih dua kali atau menghilangkan pesanan yang sudah dibayar.

=== slug: mcp
title: Arc Kit MCP
group: products
summary: Beri Claude, Cursor, atau agen AI apa pun dompet USDC sendiri di Arc dan biarkan ia membeli kartu hadiah dan isi ulang untuk Anda.
===
## Apa itu

`arckit-pay-mcp` adalah server [MCP](https://modelcontextprotocol.io) open-source. Setelah dipasang, asisten AI Anda mendapat dompet di Arc dan sembilan alat: cek dompet, atur negara default, jelajahi dan cari produk, dapatkan penawaran, beli, cek pesanan, dan daftar pembelian.

Katakan *"belikan saya kartu Starbucks $10"*. Agen menanyakan negara Anda jika belum tahu, menyebut harga USDC yang tepat, menunggu persetujuan Anda, membayar dari dompetnya, dan kodenya muncul di chat.

## Pasang

```
npx -y arckit-pay-mcp
```

Untuk Claude Desktop, tambahkan ke `claude_desktop_config.json`:

```
{
  "mcpServers": {
    "arckit-pay": { "command": "npx", "args": ["-y", "arckit-pay-mcp"] }
  }
}
```

Lalu isi dompet yang ditunjukkan agen dengan sedikit USDC di Arc.

## Keamanan

- Kunci agen hanya ada di mesin Anda (`~/.arckit/wallet.json`). Isi dengan jumlah yang Anda rela dibelanjakan olehnya.
- Batas bawaan: 50 USDC per pembelian dan 100 USDC per hari secara default, dapat diubah lewat variabel lingkungan.
- Agen harus menunjukkan penawaran dan mendapat persetujuan jelas sebelum membeli.

Paket: [npmjs.com/package/arckit-pay-mcp](https://www.npmjs.com/package/arckit-pay-mcp)

=== slug: arccash
title: ArcCash
group: products
summary: Transfer privat di Arc. Setor USDC dalam jumlah tetap, terima catatan rahasia, dan nanti tarik ke alamat baru dengan bukti zero-knowledge. Gas dibayar Arc Kit.
===
## Idenya

Biasanya chain mencatat bahwa alamat A membayar alamat B, selamanya. ArcCash memutus tautan itu. Anda menyetor jumlah tetap ke pool bersama dengan komitmen kriptografis; nanti, siapa pun yang memegang rahasia yang cocok dapat menarik jumlah yang sama ke alamat **mana pun**, dan chain hanya melihat bahwa "salah satu penyetor menarik", tanpa pernah tahu yang mana.

![ArcCash](/docs/cash.jpg)

## Setor

1. Pilih pool (1 USDC atau 10 USDC). Setiap setoran dalam pool berukuran sama, sehingga jumlah tidak dapat dicocokkan.
2. Browser Anda mengambil dua rahasia acak dan meng-hash-nya menjadi komitmen. **Catatan** berisi rahasia itu; salin atau unduh.
3. Konfirmasi setoran. Catatan tidak pernah meninggalkan browser Anda.

> [!DANGER] Catatan itu adalah uangnya. Jika hilang, setoran hilang dan tidak ada yang dapat memulihkannya, termasuk kami.

## Tarik

1. Tempel catatan (dari perangkat mana pun, dompet mana pun — atau tanpa dompet sama sekali). Diperiksa secara lokal dan terhadap pool.
2. Masukkan alamat penerima yang tidak pernah berinteraksi dengan dompet penyetor. Alamat yang benar-benar baru paling baik; tidak butuh gas.
3. Browser Anda membangun ulang pohon Merkle pool, mengunduh kunci pembuktian sekali (20 MB), dan membuat bukti Groth16 dalam sekitar dua detik.
4. Bukti diserahkan ke **relayer** Arc Kit, yang membayar gas dan mengirim transaksi. Penerima menerima jumlah penuh.

![Menarik dengan catatan](/docs/cash-withdraw.jpg)

## Apa yang disembunyikan kriptografi dan apa yang tidak

Bukti menyembunyikan **setoran mana** yang dibelanjakan: sempurna. Ia tidak dapat menyembunyikan hal-hal di sekitarnya, dan itu tanggung jawab Anda:

- **Himpunan anonimitas.** Dengan satu setoran yang belum ditarik, penarikan jelas milik Anda. Tunggu sampai banyak setoran bergabung antara setoran dan penarikan Anda.
- **Waktu.** Setor dan tarik dalam hitungan menit dan tautannya jelas bahkan di pool besar.
- **Dompet.** Jangan pernah menarik ke, atau dari, dompet yang terkait dengan penyetor.

## Ringkasan teknis

- Desain Tornado Cash Classic yang di-port ke Arc: komitmen Pedersen, pohon Merkle MiMC 20 tingkat dengan 30 root yang diingat, Groth16 di atas BN254 (36.047 constraint).
- Bukti mengikat penerima, relayer, dan biaya, sehingga tidak ada yang dapat mencegat transaksi dan mengalihkan pembayaran.
- Relayer hanya pernah menerima bukti yang sudah jadi; ia mengetahui alamat penerima dan tidak ada apa pun tentang setoran. Jika tidak tersedia, aplikasi beralih ke pengiriman dari dompet yang terhubung.
- Trusted setup: Perpetual Powers of Tau publik (fase 1) dengan satu kontribusi fase 2. Kontrak tanpa pemilik, tanpa jeda, tanpa upgrade.

=== slug: arclend
title: ArcLend
group: products
summary: Pinjamkan USDC dan hasilkan setiap detik, atau jadikan token Anda jaminan dan pinjam USDC. Satu pasar terisolasi per token, dihargai dengan rata-rata on-chain 30 menit.
===
## Cara kerjanya

Setiap pasar ArcLend memasangkan satu token dengan USDC. **Pemberi pinjaman** menyetor USDC ke pasar dan menerima share berbunga. **Peminjam** menyetor token sebagai jaminan dan meminjam USDC hingga loan-to-value (LTV) pasar. Bunga bertambah setiap detik dari peminjam ke pemberi pinjaman; 10% darinya menjadi milik protokol sebagai aliran pendapatan AKIT.

Pasar bersifat **terisolasi**: USDC yang disetor ke pasar ARCMAN hanya bisa dipinjam dengan jaminan ARCMAN. Token yang runtuh hanya dapat merugikan pasarnya sendiri.

## Meminjamkan

1. Pilih pasar dan tekan **Setor**. USDC dikirim sebagai koin native; tidak perlu persetujuan.
2. Setoran Anda bertumbuh dengan APY pasar, yaitu APR pinjaman dikali utilisasi (dikurangi faktor cadangan 10%). Semakin banyak yang meminjam, semakin tinggi imbal hasil.
3. Tarik kapan pun ada USDC menganggur di pasar. Jika semuanya dipinjamkan, suku bunga utilisasi tinggi menarik pelunasan dan setoran baru hingga dana tersedia.

## Meminjam

1. **Setor jaminan**: setujui token sekali, lalu setor.
2. **Pinjam** hingga LTV × nilai jaminan. Saat peluncuran LTV adalah 50%: token senilai 100 USDC memungkinkan pinjaman 50 USDC.
3. **Lunasi** kapan pun, sebagian atau seluruhnya. Kirim sedikit lebih dari utang Anda dan kelebihannya kembali dalam transaksi yang sama.
4. **Tarik jaminan** setelah utang Anda kembali dalam batas.

Halaman menampilkan **faktor kesehatan** Anda dan harga token tepat di mana Anda akan dilikuidasi. Jaga agar tetap jauh di atas 1.

## Likuidasi

Dua jalur likuidasi berjalan berdampingan:

- **Likuidator publik** menggunakan TWAP 30 menit, sehingga tidak ada yang dapat memanipulasi satu blok harga untuk melikuidasi peminjam yang sehat.
- **Guardian**, dompet Arc Kit yang memantau harga pool langsung setiap pasar **setiap 10 detik**, dapat melikuidasi pada nilai *terendah* antara TWAP dan spot. Saat sebuah token runtuh dalam hitungan menit, guardian segera menutup posisi yang sudah underwater tanpa menunggu rata-rata menyusul. Ia mengikuti aturan yang sama persis dengan yang lain: ambang yang sama, bonus yang sama, dan tidak dapat menyentuh posisi yang sehat.

Ketika utang posisi melebihi **ambang likuidasi** (65% dari nilai jaminan saat peluncuran), siapa pun dapat melunasi hingga setengah utang dan menerima jaminan senilai 8% lebih dari yang dibayar, dihargai pada TWAP. Setelah jaminan tidak lagi menutupi utang, seluruh posisi dapat ditutup. Likuidasi bersifat permissionless dan sepenuhnya on-chain.

## Harga: oracle TWAP

Arc tidak memiliki price feed, jadi ArcLend membaca harga dari pool USDC Uniswap v4 setiap token melalui **ArcTwapOracle**. Siapa pun dapat `poke` sebuah pool untuk mencatat tick saat ini; keeper melakukannya setiap 10 menit dan setiap pinjaman juga. Pasar menilai jaminan pada **rata-rata tertimbang waktu 30 menit**, dan peminjaman dijeda saat harga spot menyimpang lebih dari 5% dari rata-rata itu. Menggerakkan rata-rata 30 menit berarti menahan harga yang terdistorsi melawan arbitrase selama seluruh jendela, itulah yang membuat pool tipis dapat digunakan sebagai jaminan.

## Parameter peluncuran

| Parameter | Nilai |
|---|---|
| Pasar | AKIT, ARCMAN, ARCOON, AF, ASTOCK |
| Loan-to-value | 50% |
| Ambang likuidasi | 65% |
| Bonus likuidasi | 8% |
| Close factor | 50% (100% saat jaminan < utang) |
| Bunga | 2% dasar, +10% hingga utilisasi 80%, +50% setelahnya |
| Faktor cadangan | 10% dari bunga |
| Batas setoran / pinjaman | 100 USDC setoran / 10 USDC pinjaman per pasar selama minggu pertama, lalu dinaikkan bertahap |
| Harga | TWAP 30 menit, penjaga deviasi spot 5% |

Pemilik dapat menambah pasar, menyesuaikan parameter ini dalam batas keras (LTV ≤ 80%, ambang ≤ 90%, bonus ≤ 20%, cadangan ≤ 30%), mengubah batas, dan menjeda pinjaman baru. Ia tidak dapat menyentuh USDC yang disetor, jaminan, atau utang siapa pun.

> [!WARNING] Token jaminan di Arc kecil dan volatil. Pinjam jauh di bawah batas, pantau faktor kesehatan Anda, dan ingat likuidasi membuat Anda kehilangan bonus 8%.

=== slug: arcp2p
title: ArcP2P
group: products
summary: Jual token apa pun untuk USDC dengan harga tetap atau mengikuti harga pasar langsung dengan diskon atau premi. Pembeli mengambil seluruh atau sebagian listing dan membayar USDC native dalam satu transaksi.
===
## Cara kerjanya

ArcP2P adalah order book tanpa izin untuk menjual token terhadap USDC. **Penjual** menitipkan ERC-20 apa pun di Arc ke kontrak ArcP2P dan menetapkan harga. **Pembeli** mengirim USDC native dan menerima token dalam transaksi yang sama. Token tetap dalam escrow sampai terjual atau penjual membatalkan; Arc Kit tidak pernah memegang apa pun.

Tidak ada persetujuan listing, tidak ada ukuran minimum, dan tidak ada risiko pihak lawan: kontrak hanya melepas token setelah USDC tiba, dan hanya melepas USDC setelah token keluar.

## Mode harga

**Harga tetap.** Jumlah USDC per token yang tidak pernah berubah. Sederhana, bisa diprediksi, cocok untuk kesepakatan OTC yang sudah disetujui.

**Harga pasar ± spread.** Listing mengikuti pool USDC Uniswap v4 terdalam milik token itu. Pilih spread: 0% menjual di harga pasar, −5% menjual 5% di bawahnya, +10% menjual 10% di atasnya, dari −90% sampai +100%. Harga dibaca ulang dari pool pada setiap pembelian, jadi diskon Anda tetap sama saat pasar bergerak. Tambahkan **harga dasar** opsional: listing tidak pernah terjual di bawahnya, apa pun kata pool.

Acuan pasar adalah yang **lebih tinggi** antara rata-rata tertimbang waktu 30 menit dan harga spot pool, setelah rata-rata punya 10 menit observasi. Satu blok yang menjatuhkan harga spot karena itu tidak bisa menguras listing berdiskon; kenaikan nyata langsung tercermin; penurunan berkelanjutan diikuti saat rata-rata menyusul.

## Membeli

1. Buka **Beli**, pilih listing. Panel menampilkan harga langsung, perbandingannya dengan pasar, dan sisa yang tersedia.
2. Masukkan berapa token yang Anda inginkan, atau berapa USDC yang ingin dibelanjakan. Anda bisa membeli semuanya atau jumlah berapa pun di atas minimum penjual; sisa terakhir selalu boleh dibeli.
3. Konfirmasi. USDC dikirim sebagai koin native, jadi tidak perlu approval. Untuk listing harga pasar, aplikasi mengirim sampai 1% ekstra untuk menutup pergerakan harga dan kontrak mengembalikan setiap wei yang tidak dibutuhkan.

## Menjual

1. Buka **Jual**, tempel alamat token dan jumlahnya. Aplikasi mencari pool USDC token itu dan memilih yang terdalam dengan biaya normal sebagai acuan pasar; Anda bisa memilih yang lain.
2. Pilih harga tetap atau harga pasar, atur spread dan harga dasar jika mau.
3. Syarat opsional: **pembelian minimum**, **kedaluwarsa**, dan alamat **pembeli privat** untuk kesepakatan OTC yang hanya bisa diterima dompet itu.
4. Approve token sekali, lalu listing. Dari **Listing saya** Anda bisa mengubah harga, menambah token, atau membatalkan dan menarik sisanya kapan saja.

## Biaya

Penjual membayar **0,5%** dari setiap pembelian, diambil dari hasil penjualan; pembeli membayar persis harga yang dikutip. Kontrak membatasi biaya maksimal 1%. Biaya terkumpul di kontrak dan ditarik oleh penerima biaya, jadi tidak pernah bisa menghalangi perdagangan. Biaya ini bagian dari bagi hasil AKIT.

## Keamanan

- Kontrak tidak bisa diubah dan sudah terverifikasi. Pemilik hanya bisa mengatur biaya dalam batas dan tidak ada yang lain: tidak bisa memindahkan token escrow, mengubah listing, atau menghentikan perdagangan.
- Token dengan biaya transfer dilisting sesuai jumlah yang benar-benar diterima. Token rebasing tidak didukung.
- Jika alamat penjual menolak USDC, hasil penjualan menunggu di kontrak untuk diklaim; transaksi pembeli tetap berhasil.
- Listing bukan rekomendasi. Siapa pun bisa melisting apa pun: periksa alamat token sebelum membeli.

Kontrak: [0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C](https://arc.etherscan.io/address/0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C#code)

=== slug: contracts
title: Kontrak
group: protocol
summary: Setiap kontrak Arc Kit, alamatnya di Arc (chain 5042), dan tautan ke kode sumber terverifikasi di Etherscan.
===
## Kontrak yang diterapkan

Semua kontrak di bawah terverifikasi sumbernya di Etherscan. Pengaturan compiler: Solidity 0.8.24 / 0.8.26, optimizer 200 run, EVM `cancun`.

| Kontrak | Alamat | Catatan |
|---|---|---|
| TokenLocker (ArcLock) | [0xdF2640625231b662A949e0B3C868F9d9109CFEaf](https://arc.etherscan.io/address/0xdF2640625231b662A949e0B3C868F9d9109CFEaf#code) | Kunci; biaya 10 USDC |
| TokenVesting | [0x5d2828b7bDDe377B51713dFa31afbA83C6011788](https://arc.etherscan.io/address/0x5d2828b7bDDe377B51713dFa31afbA83C6011788#code) | Vesting linear dengan cliff; biaya 10 USDC |
| BulkAirdrop | [0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3](https://arc.etherscan.io/address/0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3#code) | Hingga 500 penerima per tx; biaya 10 USDC |
| ArcStaking | [0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46](https://arc.etherscan.io/address/0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46#code) | Pool hadiah berbatas waktu; biaya 10 USDC |
| ArcFlowVaultV2 | [0xC30D55758d12ac9FD80459b002085E8528f38748](https://arc.etherscan.io/address/0xC30D55758d12ac9FD80459b002085E8528f38748#code) | Stake USDC terkonsentrasi |
| ArcFlowPositions | [0x16c40157fF4b49b3328Db3AE352E9eA699b8f759](https://arc.etherscan.io/address/0x16c40157fF4b49b3328Db3AE352E9eA699b8f759#code) | Posisi berbentuk dan kunci likuiditas |
| ArcFlowFeeHook | [0x4FC207E35226df90c57DBc3CAcD60E6974c05080](https://arc.etherscan.io/address/0x4FC207E35226df90c57DBc3CAcD60E6974c05080#code) | Hook biaya dinamis; tanpa pemilik |
| ArcFlowVault (v1) | [0x439608bFAC5D2B9EcD803649a1b15A9d56900990](https://arc.etherscan.io/address/0x439608bFAC5D2B9EcD803649a1b15A9d56900990#code) | Vault rentang penuh, digantikan v2 |
| ArcLend | [0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793](https://arc.etherscan.io/address/0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793#code) | Pasar uang USDC terisolasi |
| ArcTwapOracle | [0xedf33dA5bED98b5BAbDa4D71F55962CF74462491](https://arc.etherscan.io/address/0xedf33dA5bED98b5BAbDa4D71F55962CF74462491#code) | Observasi TWAP pool v4; tanpa pemilik |
| ArcP2P | [0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C](https://arc.etherscan.io/address/0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C#code) | Penjualan token peer-to-peer dalam USDC |
| ArcPayRouter | [0x958Db3732Bfb021c2F2879b9124dECBa0b30cd2c](https://arc.etherscan.io/address/0x958Db3732Bfb021c2F2879b9124dECBa0b30cd2c#code) | Meneruskan pembayaran; tidak memegang apa pun |
| Pool ArcCash, 1 USDC | [0xdbf688e09c296df6ef4a02995427ee637d1e3ebe](https://arc.etherscan.io/address/0xdbf688e09c296df6ef4a02995427ee637d1e3ebe#code) | Tanpa pemilik |
| Pool ArcCash, 10 USDC | [0x0303ae09b4f9f599823634aa9c88b6a517b24e1b](https://arc.etherscan.io/address/0x0303ae09b4f9f599823634aa9c88b6a517b24e1b#code) | Tanpa pemilik |
| Verifier Groth16 ArcCash | [0x6d25c8ebe5549adf216a48a12660664b8b23e4fd](https://arc.etherscan.io/address/0x6d25c8ebe5549adf216a48a12660664b8b23e4fd#code) | Ekspor snarkjs |
| Hasher MiMC ArcCash | [0x24e6e03c346727423d2ba02aa0a481280378c325](https://arc.etherscan.io/address/0x24e6e03c346727423d2ba02aa0a481280378c325) | Bytecode hasil generate, tanpa sumber Solidity |

## Kontrak eksternal yang digunakan

| Kontrak | Alamat |
|---|---|
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| USDC (tampilan ERC-20 dari koin native) | `0x3600000000000000000000000000000000000000` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

=== slug: fees-security
title: Biaya & keamanan
group: protocol
summary: Apa yang ditagih Arc Kit, apa yang bisa dan tidak bisa dilakukan kunci pemiliknya, dan cara memeriksanya sendiri.
===
## Biaya

| Tindakan | Biaya |
|---|---|
| Buat kunci | 10 USDC |
| Buat jadwal vesting | 10 USDC (per jadwal) |
| Transaksi airdrop | 10 USDC (per batch, berapa pun penerimanya) |
| Buka pool staking | 10 USDC |
| Kunci posisi likuiditas | 10 USDC |
| Stake dan posisi ArcFlow | 1% dari biaya swap yang dipanen / dikumpulkan; bounty panen 0,5% untuk siapa pun yang memanen |
| ArcPay | Sudah termasuk dalam harga USDC yang ditawarkan |
| ArcCash | Tidak ada; Arc Kit membayar gas penarikan |
| Pembelian ArcP2P | 0,5% dari pembelian, dibayar penjual; maksimal 1% |
| Top up, perpanjang, pisah, transfer, klaim, tarik | Gratis (hanya gas) |

Biaya dibayar dalam USDC bersama panggilan, terakumulasi di kontrak, dan **ditarik** oleh penerima biaya, sehingga penerima yang bermasalah tidak pernah bisa memblokir tindakan pengguna.

## Apa yang bisa dilakukan pemilik

Pemilik kontrak dapat mengubah jumlah biaya dan penerima biaya. Itu saja daftarnya. Tidak ada kunci pemilik yang dapat menjeda penarikan, memindahkan token pengguna, mengubah tanggal, atau meng-upgrade kontrak. ArcFlowFeeHook dan kontrak ArcCash sama sekali tidak memiliki pemilik.

## Yang kami sarankan

- Baca kontrak di Etherscan sebelum mengunci nilai besar; sumber setiap kontrak sudah terverifikasi.
- Periksa halaman publik kunci atau pool, bukan mempercayai tangkapan layar.

=== slug: token
title: Utilitas token
group: protocol
summary: Token Arc Kit, AKIT, adalah token bagi hasil: biaya protokol yang diperoleh di seluruh rangkaian produk dibagikan kepada pemegang yang men-stake-nya.
===
## Bagi hasil

Setiap produk Arc Kit menghasilkan biaya dalam USDC (lihat [Biaya & keamanan](/docs/fees-security)): biaya kunci, vesting, dan airdrop, biaya pembuatan pool staking, bagian protokol dari biaya swap ArcFlow, biaya kunci likuiditas, dan margin ArcPay. **AKIT** adalah token yang berbagi pendapatan itu.

- **Stake AKIT, dapatkan USDC.** Pendapatan protokol didistribusikan ke staker AKIT sebanding dengan stake mereka, melalui Arc Staking sendiri — mekanisme pool yang sama yang digunakan setiap proyek lain di Arc Kit.
- **Lebih banyak produk, lebih banyak pendapatan.** Setiap produk baru di [roadmap](/docs/roadmap) menambah aliran biaya ke pool yang sama.
- **On-chain dan dapat diperiksa.** Distribusi adalah setoran ke pool staking publik; siapa pun dapat memverifikasi jumlah dan waktunya di Etherscan.

## Di mana AKIT diperdagangkan

AKIT diperdagangkan di Uniswap v4 Arc terhadap USDC. Anda dapat men-stake-nya, dan likuiditasnya, langsung melalui [Arc Staking](/stake) dan [ArcFlow](/flow).

## Utilitas di luar pendapatan

- **Diskon biaya** pada produk Arc Kit untuk pemegang, seiring produk meluncurkan tingkat diskonnya.
- **Akses awal** ke produk baru di roadmap.
- **Sinyal tata kelola** untuk produk mana yang dirilis berikutnya.

> [!NOTE] Jadwal distribusi dan bagi hasil saat ini diumumkan di [@usearckit](https://x.com/usearckit) dan tercermin di pool staking AKIT. Tidak ada di sini yang merupakan saran investasi.

=== slug: roadmap
title: Produk mendatang
group: roadmap
summary: Yang akan datang di Arc Kit. Setiap produk di bawah menambah aliran biaya baru ke bagi hasil AKIT.
===
## ArcMultisig

Dompet multisig yang membawa keamanan Web2 ke transfer dana. Di luar tanda tangan M-dari-N biasa, setiap transfer membutuhkan kode sekali pakai dari **email** dan dari **Google Authenticator**. Bahkan jika kunci privat Anda bocor, dompet tidak dapat dikuras kecuali OTP dimasukkan.

## ArcLaunch

Launchpad yang dibangun di atas Argus, dengan sentuhan berbeda: pembuat memutuskan ke mana biaya perdagangan pergi. Alihkan ke **buyback otomatis**, ke **LP**, atau ke profil publik di X, GitHub, Telegram, Instagram, dan lainnya, sehingga komunitas dapat mendanai orang di balik token secara langsung.

## ArcDomains

Beli domain `.arc` dan gunakan untuk menautkan situs web Anda via IPFS. Nama yang mudah dibaca untuk dompet, halaman proyek, dan kunci Anda, diselesaikan on-chain.

## Arc Redeployment

Pindahkan proyek yang ada dari chain lain ke Arc secara otomatis: snapshot pemegang, terapkan ulang kontrak, cerminkan saldo, verifikasi sumber saat tiba.

---

Ikuti [@usearckit](https://x.com/usearckit) atau bergabung di [t.me/usearckit](https://t.me/usearckit) untuk tanggal peluncuran.
