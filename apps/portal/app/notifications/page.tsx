"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api";
import {
  AppNotification,
  NotificationListResponse,
  notificationTime,
} from "@/lib/notifications";

const allowedRoles = [
  "PASSENGER",
  "DRIVER",
  "SUPER_ADMIN",
  "ADMIN",
  "OPERATIONS_MANAGER",
  "SUPPORT_AGENT",
  "FINANCE_MANAGER",
];

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = await apiFetch<NotificationListResponse>(
        "/notifications?limit=40",
      );

      setItems(result.items);
      setNextCursor(result.nextCursor);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذر تحميل الإشعارات.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;

    setWorking("more");

    try {
      const result = await apiFetch<NotificationListResponse>(
        `/notifications?limit=40&cursor=${encodeURIComponent(
          nextCursor,
        )}`,
      );

      setItems((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } finally {
      setWorking("");
    }
  }

  async function openNotification(item: AppNotification) {
    setWorking(item.id);

    try {
      if (!item.readAt) {
        const updated = await apiFetch<AppNotification>(
          `/notifications/${item.id}/read`,
          { method: "PATCH" },
        );

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? updated : entry,
          ),
        );
      }

      if (item.link) {
        router.push(item.link);
      }
    } finally {
      setWorking("");
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
    } finally {
      setWorking("");
    }
  }

  async function remove(item: AppNotification) {
    setWorking(item.id);

    try {
      await apiFetch(`/notifications/${item.id}`, {
        method: "DELETE",
      });

      setItems((current) =>
        current.filter((entry) => entry.id !== item.id),
      );
    } finally {
      setWorking("");
    }
  }

  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <ProtectedRoute roles={allowedRoles}>
      <Shell>
        <DashboardHeader
          eyebrow="الحساب / الإشعارات"
          title="مركز الإشعارات"
          subtitle="تابع تحديثات الحجوزات والسائقين والرحلات التشغيلية من مكان واحد."
          actions={
            unreadCount > 0 ? (
              <button
                className="button"
                type="button"
                disabled={working === "all"}
                onClick={() => void markAllRead()}
              >
                <Icon name="check" size={18} />
                تحديد الكل كمقروء
              </button>
            ) : undefined
          }
        />

        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel notifications-page-panel">
          <div className="section-heading">
            <div>
              <h2>كل الإشعارات</h2>
              <p className="subtitle">
                {unreadCount
                  ? `${unreadCount} إشعار غير مقروء ضمن القائمة الحالية.`
                  : "تمت قراءة جميع الإشعارات المعروضة."}
              </p>
            </div>
            <button
              className="button compact-button"
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
            >
              تحديث
            </button>
          </div>

          {isLoading && items.length === 0 ? (
            <div className="notification-page-empty">
              جارٍ تحميل الإشعارات...
            </div>
          ) : null}

          {!isLoading && items.length === 0 ? (
            <div className="notification-page-empty">
              <Icon name="bell" size={32} />
              <h2>لا توجد إشعارات بعد</h2>
              <p>
                ستظهر هنا تحديثات الحجوزات والتعيين ومراحل تنفيذ الرحلة.
              </p>
            </div>
          ) : null}

          <div className="notifications-page-list">
            {items.map((item) => (
              <article
                className={`notification-page-item ${
                  item.readAt ? "" : "is-unread"
                }`}
                key={item.id}
              >
                <button
                  className="notification-page-main"
                  type="button"
                  disabled={working === item.id}
                  onClick={() => void openNotification(item)}
                >
                  <span className="notification-page-icon">
                    <Icon name="bell" size={20} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small>{notificationTime(item.createdAt)}</small>
                  </span>
                  {!item.readAt ? (
                    <span className="notification-unread-dot" />
                  ) : null}
                </button>

                <button
                  className="notification-delete-button"
                  type="button"
                  disabled={working === item.id}
                  onClick={() => void remove(item)}
                >
                  حذف
                </button>
              </article>
            ))}
          </div>

          {nextCursor ? (
            <button
              className="button notification-load-more"
              type="button"
              disabled={working === "more"}
              onClick={() => void loadMore()}
            >
              تحميل المزيد
            </button>
          ) : null}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
