// GET /api/accounts/template — returns standard Indonesian COA template (PSAK-based)
import { NextResponse } from 'next/server'

function ok(data: unknown) { return NextResponse.json(data) }

export interface CoaTemplateAccount {
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  subtype: string | null
  parentCode: string | null
  level: number
  description: string | null
}

export const PSAK_TEMPLATE: CoaTemplateAccount[] = [
  // ── ASSET ──────────────────────────────────────────────────────────────────
  { code: '1000', name: 'Aset',                          type: 'ASSET',     subtype: null,                parentCode: null,   level: 0, description: 'Akun induk aset' },
  { code: '1100', name: 'Aset Lancar',                   type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1000', level: 1, description: 'Aset yang diharapkan cair dalam 12 bulan' },
  { code: '1110', name: 'Kas',                           type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1100', level: 2, description: 'Uang tunai di tangan' },
  { code: '1111', name: 'Kas Kecil',                     type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1110', level: 3, description: 'Petty cash' },
  { code: '1120', name: 'Bank',                          type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1100', level: 2, description: 'Rekening bank' },
  { code: '1121', name: 'Bank BCA',                      type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1120', level: 3, description: null },
  { code: '1122', name: 'Bank Mandiri',                  type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1120', level: 3, description: null },
  { code: '1130', name: 'Piutang Usaha',                 type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1100', level: 2, description: 'Tagihan kepada pelanggan' },
  { code: '1131', name: 'Cadangan Kerugian Piutang',     type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1130', level: 3, description: 'Penyisihan piutang tak tertagih' },
  { code: '1140', name: 'Persediaan',                    type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1100', level: 2, description: 'Barang dagangan' },
  { code: '1141', name: 'Persediaan Barang Dagang',      type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1140', level: 3, description: null },
  { code: '1150', name: 'Biaya Dibayar Dimuka',          type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1100', level: 2, description: 'Prepaid expenses' },
  { code: '1151', name: 'Sewa Dibayar Dimuka',           type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1150', level: 3, description: null },
  { code: '1160', name: 'Pajak Dibayar Dimuka',          type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1100', level: 2, description: 'PPN masukan & PPh dibayar dimuka' },
  { code: '1161', name: 'PPN Masukan',                   type: 'ASSET',     subtype: 'CURRENT_ASSET',     parentCode: '1160', level: 3, description: null },

  { code: '1200', name: 'Aset Tidak Lancar',             type: 'ASSET',     subtype: 'NON_CURRENT_ASSET', parentCode: '1000', level: 1, description: null },
  { code: '1210', name: 'Aset Tetap',                    type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1200', level: 2, description: 'Properti, mesin, peralatan' },
  { code: '1211', name: 'Tanah',                         type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: null },
  { code: '1212', name: 'Bangunan',                      type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: null },
  { code: '1213', name: 'Akumulasi Penyusutan Bangunan', type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: 'Contra asset' },
  { code: '1214', name: 'Peralatan',                     type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: null },
  { code: '1215', name: 'Akumulasi Penyusutan Peralatan',type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: 'Contra asset' },
  { code: '1216', name: 'Kendaraan',                     type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: null },
  { code: '1217', name: 'Akumulasi Penyusutan Kendaraan',type: 'ASSET',     subtype: 'FIXED_ASSET',       parentCode: '1210', level: 3, description: 'Contra asset' },
  { code: '1220', name: 'Aset Tak Berwujud',             type: 'ASSET',     subtype: 'INTANGIBLE_ASSET',  parentCode: '1200', level: 2, description: null },
  { code: '1221', name: 'Goodwill',                      type: 'ASSET',     subtype: 'INTANGIBLE_ASSET',  parentCode: '1220', level: 3, description: null },
  { code: '1222', name: 'Lisensi & Hak Paten',          type: 'ASSET',     subtype: 'INTANGIBLE_ASSET',  parentCode: '1220', level: 3, description: null },

  // ── LIABILITY ─────────────────────────────────────────────────────────────
  { code: '2000', name: 'Liabilitas',                    type: 'LIABILITY', subtype: null,                parentCode: null,   level: 0, description: 'Akun induk liabilitas' },
  { code: '2100', name: 'Liabilitas Jangka Pendek',      type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2000', level: 1, description: 'Jatuh tempo dalam 12 bulan' },
  { code: '2110', name: 'Utang Usaha',                   type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2100', level: 2, description: 'Tagihan dari pemasok' },
  { code: '2120', name: 'Utang Pajak',                   type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2100', level: 2, description: null },
  { code: '2121', name: 'Utang PPN',                     type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2120', level: 3, description: 'PPN keluaran' },
  { code: '2122', name: 'Utang PPh 21',                  type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2120', level: 3, description: null },
  { code: '2123', name: 'Utang PPh 25',                  type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2120', level: 3, description: null },
  { code: '2130', name: 'Utang Gaji',                    type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2100', level: 2, description: null },
  { code: '2140', name: 'Pendapatan Diterima Dimuka',    type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2100', level: 2, description: 'Deferred revenue' },
  { code: '2150', name: 'Biaya Masih Harus Dibayar',     type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', parentCode: '2100', level: 2, description: 'Accrued expenses' },

  { code: '2200', name: 'Liabilitas Jangka Panjang',     type: 'LIABILITY', subtype: 'LONG_TERM_LIABILITY',parentCode: '2000', level: 1, description: null },
  { code: '2210', name: 'Utang Bank Jangka Panjang',     type: 'LIABILITY', subtype: 'LONG_TERM_LIABILITY',parentCode: '2200', level: 2, description: null },
  { code: '2220', name: 'Utang Obligasi',                type: 'LIABILITY', subtype: 'LONG_TERM_LIABILITY',parentCode: '2200', level: 2, description: null },

  // ── EQUITY ────────────────────────────────────────────────────────────────
  { code: '3000', name: 'Ekuitas',                       type: 'EQUITY',   subtype: null,                 parentCode: null,   level: 0, description: 'Akun induk ekuitas' },
  { code: '3100', name: 'Modal Disetor',                 type: 'EQUITY',   subtype: 'PAID_IN_CAPITAL',    parentCode: '3000', level: 1, description: null },
  { code: '3110', name: 'Modal Saham',                   type: 'EQUITY',   subtype: 'PAID_IN_CAPITAL',    parentCode: '3100', level: 2, description: null },
  { code: '3120', name: 'Agio Saham',                    type: 'EQUITY',   subtype: 'PAID_IN_CAPITAL',    parentCode: '3100', level: 2, description: 'Share premium' },
  { code: '3200', name: 'Laba Ditahan',                  type: 'EQUITY',   subtype: 'RETAINED_EARNINGS',  parentCode: '3000', level: 1, description: 'Accumulated retained earnings' },
  { code: '3210', name: 'Laba Ditahan Tahun Lalu',       type: 'EQUITY',   subtype: 'RETAINED_EARNINGS',  parentCode: '3200', level: 2, description: null },
  { code: '3220', name: 'Laba Periode Berjalan',         type: 'EQUITY',   subtype: 'RETAINED_EARNINGS',  parentCode: '3200', level: 2, description: 'Current period profit' },
  { code: '3300', name: 'Dividen',                       type: 'EQUITY',   subtype: 'DIVIDENDS',          parentCode: '3000', level: 1, description: null },

  // ── REVENUE ───────────────────────────────────────────────────────────────
  { code: '4000', name: 'Pendapatan',                    type: 'REVENUE',  subtype: null,                 parentCode: null,   level: 0, description: 'Akun induk pendapatan' },
  { code: '4100', name: 'Pendapatan Usaha',              type: 'REVENUE',  subtype: 'OPERATING_REVENUE',  parentCode: '4000', level: 1, description: null },
  { code: '4110', name: 'Penjualan',                     type: 'REVENUE',  subtype: 'OPERATING_REVENUE',  parentCode: '4100', level: 2, description: 'Pendapatan dari penjualan produk' },
  { code: '4111', name: 'Penjualan Produk',              type: 'REVENUE',  subtype: 'OPERATING_REVENUE',  parentCode: '4110', level: 3, description: null },
  { code: '4120', name: 'Retur Penjualan',               type: 'REVENUE',  subtype: 'OPERATING_REVENUE',  parentCode: '4100', level: 2, description: 'Sales returns (contra revenue)' },
  { code: '4130', name: 'Diskon Penjualan',              type: 'REVENUE',  subtype: 'OPERATING_REVENUE',  parentCode: '4100', level: 2, description: 'Sales discounts (contra revenue)' },
  { code: '4200', name: 'Pendapatan Lain-lain',          type: 'REVENUE',  subtype: 'OTHER_REVENUE',      parentCode: '4000', level: 1, description: null },
  { code: '4210', name: 'Pendapatan Bunga',              type: 'REVENUE',  subtype: 'OTHER_REVENUE',      parentCode: '4200', level: 2, description: null },
  { code: '4220', name: 'Laba Penjualan Aset',           type: 'REVENUE',  subtype: 'OTHER_REVENUE',      parentCode: '4200', level: 2, description: null },
  { code: '4230', name: 'Pendapatan Sewa',               type: 'REVENUE',  subtype: 'OTHER_REVENUE',      parentCode: '4200', level: 2, description: null },

  // ── EXPENSE ───────────────────────────────────────────────────────────────
  { code: '5000', name: 'Biaya',                         type: 'EXPENSE',  subtype: null,                 parentCode: null,   level: 0, description: 'Akun induk biaya' },
  { code: '5100', name: 'Harga Pokok Penjualan',         type: 'EXPENSE',  subtype: 'COGS',               parentCode: '5000', level: 1, description: 'Cost of goods sold' },
  { code: '5110', name: 'HPP Produk',                    type: 'EXPENSE',  subtype: 'COGS',               parentCode: '5100', level: 2, description: null },
  { code: '5120', name: 'Pembelian',                     type: 'EXPENSE',  subtype: 'COGS',               parentCode: '5100', level: 2, description: null },
  { code: '5130', name: 'Biaya Pengiriman Masuk',        type: 'EXPENSE',  subtype: 'COGS',               parentCode: '5100', level: 2, description: 'Freight-in' },

  { code: '5200', name: 'Biaya Operasional',             type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5000', level: 1, description: null },
  { code: '5210', name: 'Biaya Gaji & Upah',             type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: null },
  { code: '5211', name: 'Gaji Karyawan',                 type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5210', level: 3, description: null },
  { code: '5212', name: 'Tunjangan Karyawan',            type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5210', level: 3, description: 'BPJS, tunjangan, dll.' },
  { code: '5220', name: 'Biaya Sewa',                    type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: null },
  { code: '5230', name: 'Biaya Utilitas',                type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: 'Listrik, air, telepon' },
  { code: '5240', name: 'Biaya Penyusutan',              type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: null },
  { code: '5241', name: 'Penyusutan Bangunan',           type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5240', level: 3, description: null },
  { code: '5242', name: 'Penyusutan Peralatan',          type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5240', level: 3, description: null },
  { code: '5243', name: 'Penyusutan Kendaraan',          type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5240', level: 3, description: null },
  { code: '5250', name: 'Biaya Pemasaran',               type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: null },
  { code: '5260', name: 'Biaya Administrasi & Umum',     type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: null },
  { code: '5261', name: 'Alat Tulis Kantor',             type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5260', level: 3, description: null },
  { code: '5262', name: 'Biaya Perjalanan Dinas',        type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5260', level: 3, description: null },
  { code: '5270', name: 'Biaya Piutang Tak Tertagih',    type: 'EXPENSE',  subtype: 'OPERATING_EXPENSE',  parentCode: '5200', level: 2, description: 'Bad debt expense' },

  { code: '5300', name: 'Biaya Keuangan',                type: 'EXPENSE',  subtype: 'FINANCIAL_EXPENSE',  parentCode: '5000', level: 1, description: null },
  { code: '5310', name: 'Beban Bunga',                   type: 'EXPENSE',  subtype: 'FINANCIAL_EXPENSE',  parentCode: '5300', level: 2, description: null },
  { code: '5320', name: 'Biaya Administrasi Bank',       type: 'EXPENSE',  subtype: 'FINANCIAL_EXPENSE',  parentCode: '5300', level: 2, description: null },

  { code: '5400', name: 'Pajak Penghasilan',             type: 'EXPENSE',  subtype: 'TAX_EXPENSE',        parentCode: '5000', level: 1, description: null },
  { code: '5410', name: 'PPh Badan',                     type: 'EXPENSE',  subtype: 'TAX_EXPENSE',        parentCode: '5400', level: 2, description: 'Corporate income tax' },
]

// GET /api/accounts/template
export async function GET() {
  return ok({ template: PSAK_TEMPLATE, count: PSAK_TEMPLATE.length })
}
