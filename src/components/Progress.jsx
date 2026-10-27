// Bilah progres untuk pekerjaan yang sedang berjalan.
//
// Dua bentuk, dipilih oleh ada/tidaknya angka: dengan `percent` bilahnya tentu (aria-valuenow
// diisi, pengisiannya beranimasi halus), tanpa itu ia tetap bilah tak-tentu. Tidak ada angka yang
// dikarang di komponen ini — pemanggil hanya mengirim persen yang dihitung dari pekerjaan yang
// benar-benar selesai (fase analisis per tahap, fase tulis per potongan), dan fase tarik memang
// tidak punya penyebut yang jujur jadi ia dikirim sebagai null.
export function Progress({ label = 'Working', percent = null, detail = null, className = '' }) {
  const value = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : null;
  if (value === null) {
    return (
      <div
        className={`progress-indeterminate h-[2px] w-full bg-slate-900 ${className}`}
        role="progressbar"
        aria-orientation="horizontal"
        aria-label={label}
        aria-busy="true"
      />
    );
  }
  return (
    <div className={`h-[3px] w-full overflow-hidden bg-slate-900 ${className}`} title={detail || undefined}>
      <div
        role="progressbar"
        aria-orientation="horizontal"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${value}%`}
        className="h-full rounded-r bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
