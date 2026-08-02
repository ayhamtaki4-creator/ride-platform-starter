"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast-provider";
import { apiFetch } from "@/lib/api";
import {
  AppNotification,
  NotificationCreatedEvent,
  NotificationListResponse,
  notificationTime,
} from "@/lib/notifications";

export function NotificationCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, socket } = useAuth();
  const { showToast } = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      const [list, count] = await Promise.all([
        apiFetch<NotificationListResponse>(
          "/notifications?limit=8",
        ),
        apiFetch<{ count: number }>(
          "/notifications/unread-count",
        ),
      ]);

      setItems(list.items);
      setUnreadCount(count.count);
    } catch {
      // Polling retries without interrupting the application.
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();

    if (!user) return;

    const timer = window.setInterval(() => {
      void load();
    }, 45_000);

    return () => window.clearInterval(timer);
  }, [load, user]);

  useEffect(() => {
    if (!socket || !user) return;

    const created = (event: NotificationCreatedEvent) => {
      if (event.userId !== user.id) return;

      setItems((current) => [
        event,
        ...current.filter((item) => item.id !== event.id),
      ].slice(0, 8));
      setUnreadCount((current) => current + 1);
      showToast(event.title, "info");
    };

    const read = (event: {
      notificationId: string;
      userId: string;
      readAt: string;
    }) => {
      if (event.userId !== user.id) return;

      setItems((current) =>
        current.map((item) =>
          item.id === event.notificationId
            ? { ...item, readAt: event.readAt }
            : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    };

    const readAll = (event: {
      userId: string;
      readAt: string;
    }) => {
      if (event.userId !== user.id) return;

      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? event.readAt,
        })),
      );
      setUnreadCount(0);
    };

    socket.on("notification.created", created);
    socket.on("notification.read", read);
    socket.on("notification.read-all", readAll);

    return () => {
      socket.off("notification.created", created);
      socket.off("notification.read", read);
      socket.off("notification.read-all", readAll);
    };
  }, [showToast, socket, user]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", outside);
    return () =>
      document.removeEventListener("mousedown", outside);
  }, []);

  async function openNotification(item: AppNotification) {
    if (!item.readAt) {
      setWorking(item.id);

      try {
        const updated = await apiFetch<AppNotification>(
          `/notifications/${item.id}/read`,
          { method: "PATCH" },
        );

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? updated : entry,
          ),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        // Navigation remains possible if marking fails.
      } finally {
        setWorking("");
      }
    }

    setOpen(false);

    if (item.link) {
      router.push(item.link);
    }
  }

  async function markAllRead() {
    setWorking("all");

    try {
      const result = await apiFetch<{ readAt: string }>(
        "/notifications/read-all",
        { method: "PATCH" },
      );

      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? result.readAt,
        })),
      );
      setUnreadCount(0);
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        className="notification-bell-button"
        type="button"
        aria-label={`الإشعارات غير المقروءة: ${unreadCount}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="bell" size={20} />
        {unreadCount > 0 ? (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-popover">
          <div className="notification-popover-head">
            <div>
              <strong>الإشعارات</strong>
              <small>
                {unreadCount
                  ? `${unreadCount} غير مقروء`
                  : "لا توجد إشعارات جديدة"}
              </small>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={working === "all"}
                onClick={() => void markAllRead()}
              >
                تحديد الكل كمقروء
              </button>
            ) : null}
          </div>

          <div className="notification-popover-list">
            {isLoading && items.length === 0 ? (
              <div className="notification-empty">
                جارٍ تحميل الإشعارات...
              </div>
            ) : null}

            {!isLoading && items.length === 0 ? (
              <div className="notification-empty">
                <Icon name="bell" size={25} />
                <strong>لا توجد إشعارات</strong>
                <span>
                  ستظهر هنا تحديثات الحجوزات والرحلات.
                </span>
              </div>
            ) : null}

            {items.map((item) => (
              <button
                className={`notification-popover-item ${
                  item.readAt ? "" : "is-unread"
                }`}
                type="button"
                key={item.id}
                disabled={working === item.id}
                onClick={() => void openNotification(item)}
              >
                <span className="notification-item-icon">
                  <Icon name="bell" size={18} />
                </span>
                <span className="notification-item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <small>{notificationTime(item.createdAt)}</small>
                </span>
                {!item.readAt ? (
                  <span className="notification-unread-dot" />
                ) : null}
              </button>
            ))}
          </div>

          <Link
            className="notification-view-all"
            href="/notifications"
          >
            عرض كل الإشعارات
            <Icon name="arrow-left" size={17} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
