export function RiderBookingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="rider-skeleton-list" aria-label="جارٍ تحميل الحجوزات">
      {Array.from({ length: count }, (_, index) => (
        <div className="rider-skeleton-card" key={index}>
          <span className="skeleton-line skeleton-line-short" />
          <span className="skeleton-line skeleton-line-title" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line-medium" />
        </div>
      ))}
    </div>
  );
}
