import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api/axios";
import { useToast } from "../context/ToastContext";

function timeAgo(value) {
  const input = new Date(value).getTime();
  const diff = Date.now() - input;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    const minutes = Math.max(1, Math.floor(diff / minute));
    return `${minutes}m ago`;
  }
  if (diff < day) {
    const hours = Math.max(1, Math.floor(diff / hour));
    return `${hours}h ago`;
  }
  const days = Math.max(1, Math.floor(diff / day));
  return `${days}d ago`;
}

function Notifications() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [markingAll, setMarkingAll] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await api.get("/notifications/");
        setItems(response.data);
      } catch (error) {
        console.error("Failed to load notifications", error);
      }
    }

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  function projectPathFromLink(link) {
    if (!link) {
      return "/dashboard";
    }
    return link.replace(/^\/project\//, "/projects/");
  }

  async function handleMarkRead(notificationId) {
    try {
      await api.patch(`/notifications/${notificationId}/read`);
      setItems((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)),
      );
    } catch (error) {
      console.error("Failed to mark notification read", error);
      showToast("Unable to update notification state.", "error");
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const response = await api.patch("/notifications/read-all");
      setItems(response.data);
    } catch (error) {
      showToast("Unable to mark all notifications as read.", "error");
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleItemClick(item) {
    if (!item.is_read) {
      await handleMarkRead(item.id);
    }
    setOpen(false);
    navigate(projectPathFromLink(item.link));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
        aria-label="Open notifications"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount ? (
          <span className="absolute right-2 top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-16 z-20 w-[22rem] rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <div>
              <p className="text-sm font-semibold text-slate-950">Notifications</p>
              <p className="text-xs text-slate-500">Recent alerts from your projects</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {unreadCount} unread
              </span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={!unreadCount || markingAll}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
              >
                {markingAll ? "..." : "Mark all"}
              </button>
            </div>
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    item.is_read
                      ? "border-slate-100 bg-slate-50 text-slate-500"
                      : "border-amber-200 bg-amber-50 text-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-6">{item.message}</p>
                    {!item.is_read ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-rose-500" /> : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{item.link || "No link"}</span>
                    <span>{timeAgo(item.created_at)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Notifications;
