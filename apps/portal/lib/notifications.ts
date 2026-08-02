export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  metadata?: unknown;
};

export type NotificationListResponse = {
  items: AppNotification[];
  nextCursor: string | null;
};

export type NotificationCreatedEvent = AppNotification & {
  userId: string;
};

export function notificationTime(value: string) {
  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (!Number.isFinite(difference) || difference < 0) {
    return date.toLocaleString('ar');
  }

  if (difference < minute) return 'الآن';
  if (difference < hour) {
    return `منذ ${Math.floor(difference / minute)} دقيقة`;
  }
  if (difference < day) {
    return `منذ ${Math.floor(difference / hour)} ساعة`;
  }
  if (difference < 7 * day) {
    return `منذ ${Math.floor(difference / day)} يوم`;
  }

  return date.toLocaleDateString('ar');
}
