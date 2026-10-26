// Bilah tak-tentu, satu primitive untuk tiga pemakai (bilah kepala, layar boot, layar
// sinkron). aria-valuenow sengaja tidak ada: progresnya memang tidak diketahui — penarikan
// adalah satu permintaan HTTP tanpa aliran — dan angka yang dikarang lebih buruk daripada
// tidak ada angka sama sekali.
export function Progress({ label = 'Working', className = '' }) {
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
