/** Stockpot logo: a pot whose steam is a small rising line. */
export default function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 9.5 10 6.5l2.5 2L17 4" />
        <path d="M3 12h18" />
        <path d="M5 12v4.5A3.5 3.5 0 0 0 8.5 20h7a3.5 3.5 0 0 0 3.5-3.5V12" />
      </svg>
    </span>
  );
}
