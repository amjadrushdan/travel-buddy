// The logo mark (two dots joined by a dashed arc) drawn for next/og ImageResponse.
// `inset` shrinks the mark for maskable icons, which get cropped to a circle.
export function AppIconArt({ size, inset = 0.18, rounded = true }: { size: number; inset?: number; rounded?: boolean }) {
  const mark = Math.round(size * (1 - inset * 2));
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#16181A",
        borderRadius: rounded ? size * 0.22 : 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
        <path d="M6 16.5C8 8 16 8 18 16.5" strokeDasharray="2.2 2.6" />
        <circle cx="6" cy="16.5" r="2.4" fill="#FFFFFF" stroke="none" />
        <circle cx="18" cy="16.5" r="2.4" fill="#FFFFFF" stroke="none" />
      </svg>
    </div>
  );
}
