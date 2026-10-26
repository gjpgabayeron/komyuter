/**
 * The POI marker silhouette: a location pin — a disc running down to a point —
 * with a white keyline and a white hole.
 *
 * One component for both states (a candidate pin and the picked place), so the
 * picked marker cannot drift into a different shape than the pins it came from;
 * only its colour and size change.
 *
 * Drawn rather than assembled from Tailwind primitives: a rotated square glued
 * under a circle leaves seams where the keyline meets, which is exactly what a
 * two-piece border looks like.
 */
const PIN_PATH =
  "M12 2.5C8.4 2.5 5.5 5.4 5.5 9c0 4.8 6.5 12.5 6.5 12.5S18.5 13.8 18.5 9c0-3.6-2.9-6.5-6.5-6.5z";

export function PoiPin({ size, color }: { size: number; color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size }}
      className="drop-shadow-sm"
      aria-hidden
    >
      {/* Plate and keyline: the stop marker's `border-2` in one stroke. */}
      <path
        d={PIN_PATH}
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* The hole that makes a teardrop read as a pin, not a drop. */}
      <circle cx="12" cy="9" r="2.4" fill="#ffffff" />
    </svg>
  );
}
