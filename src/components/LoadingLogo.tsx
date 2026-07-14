interface Props {
  /** Outer ring diameter in px. Logo image scales proportionally. */
  size?: number;
  label?: string;
  className?: string;
}

/**
 * Compact version of the app's startup preloader animation (see RootShell in
 * __root.tsx) — pulsing ring + logo — for use inside bounded viewer areas
 * instead of a blank/white loading state.
 */
export function LoadingLogo({ size = 64, label, className = "" }: Props) {
  const logoSize = Math.round(size * 0.83);
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-3 ${className}`}>
      <div className="loading-logo-ring" style={{ width: size, height: size }}>
        <div className="loading-logo-ring-pulse" />
        <img
          src="/light_13746323.png"
          alt="Loading"
          className="loading-logo-img"
          style={{ width: logoSize, height: logoSize }}
        />
      </div>
      {label && <div className="loading-logo-label">{label}</div>}
    </div>
  );
}
