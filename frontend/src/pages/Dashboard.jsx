import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import api from "../api/axios";
import AppFrame from "../components/AppFrame";
import { useToast } from "../context/ToastContext";

const statusColors = {
  total: "bg-amber-100 text-amber-800",
  in_progress: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
  overdue: "bg-rose-100 text-rose-800",
};

function formatShortDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDate(value) {
  if (!value) {
    return "No due date";
  }
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  }
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  }
  return `${Math.max(1, Math.floor(diff / day))}d ago`;
}

function describeActivity(item) {
  if (item.action === "task.created") {
    return `${item.actor_name} created task ${item.metadata.task_title ?? "Untitled task"}`;
  }
  if (item.action === "task.status_changed") {
    return `${item.actor_name} moved ${item.metadata.task_title ?? "a task"} to ${item.metadata.to ?? "updated status"}`;
  }
  if (item.action === "member.joined") {
    return `${item.actor_name} added ${item.metadata.user_name ?? "a teammate"} to the project`;
  }
  if (item.action === "task.assigned") {
    return `${item.actor_name} assigned ${item.metadata.assignee_name ?? "a teammate"} to a task`;
  }
  if (item.action === "comment.added") {
    return `${item.actor_name} commented on ${item.metadata.task_title ?? "a task"}`;
  }
  return `${item.actor_name} triggered ${item.action}`;
}

function StatCard({ label, value, accent, helper }) {
  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${accent}`}>
        {label}
      </div>
      <p className="mt-6 text-4xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </article>
  );
}

function Dashboard() {
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [overdue, setOverdue] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [statsResponse, overdueResponse, activityResponse] = await Promise.all([
          api.get("/dashboard/stats"),
          api.get("/dashboard/overdue"),
          api.get("/dashboard/activity"),
        ]);

        if (!isMounted) {
          return;
        }

        setStats(statsResponse.data);
        setOverdue(overdueResponse.data);
        setActivity(activityResponse.data);
      } catch (requestError) {
        if (isMounted) {
          setError("Unable to load dashboard data right now.");
          showToast("Unable to load dashboard data.", "error");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  const statCards = useMemo(() => {
    if (!stats) {
      return [];
    }
    return [
      {
        label: "Total Tasks",
        value: stats.total_tasks,
        accent: statusColors.total,
        helper: "All tracked work across your accessible projects.",
      },
      {
        label: "In Progress",
        value: stats.by_status?.in_progress ?? 0,
        accent: statusColors.in_progress,
        helper: "Tasks actively moving through execution right now.",
      },
      {
        label: "Done",
        value: stats.by_status?.done ?? 0,
        accent: statusColors.done,
        helper: "Completed tasks reflected in the current workspace snapshot.",
      },
      {
        label: "Overdue",
        value: stats.overdue_count,
        accent: statusColors.overdue,
        helper: "Past-due work that still needs attention.",
      },
    ];
  }, [stats]);

  const workloadData = useMemo(() => {
    if (!stats?.per_member_count) {
      return [];
    }
    return Object.entries(stats.per_member_count).map(([name, count]) => ({ name, count }));
  }, [stats]);

  const completionData = useMemo(() => {
    if (!stats?.daily_completed) {
      return [];
    }
    return stats.daily_completed.map((item) => ({
      ...item,
      label: formatShortDate(item.date),
    }));
  }, [stats]);

  return (
    <AppFrame
      title="Dashboard"
      subtitle="Track delivery velocity, see overdue work, and monitor recent team activity across every project you can access."
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
        {loading && !statCards.length
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-[1.75rem] border border-slate-200 bg-white/70" />
            ))
          : null}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Burndown</h3>
              <p className="mt-1 text-sm text-slate-500">Tasks completed per day over the last 14 days.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              14 days
            </span>
          </div>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={completionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Workload</h3>
              <p className="mt-1 text-sm text-slate-500">Assigned task count by teammate.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Team
            </span>
          </div>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[12, 12, 0, 0]}>
                  {workloadData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={index % 2 === 0 ? "#0f172a" : "#f59e0b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Overdue tasks</h3>
              <p className="mt-1 text-sm text-slate-500">Past-due work across all projects you can access.</p>
            </div>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">
              Needs attention
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-semibold">Task title</th>
                  <th className="px-3 py-3 font-semibold">Project</th>
                  <th className="px-3 py-3 font-semibold">Assignee</th>
                  <th className="px-3 py-3 font-semibold">Due date</th>
                  <th className="px-3 py-3 font-semibold">Days overdue</th>
                </tr>
              </thead>
              <tbody>
                {overdue.length ? (
                  overdue.map((item) => (
                    <tr key={item.id} className="border-b border-rose-100 bg-rose-50/70 text-slate-700 last:border-b-0">
                      <td className="px-3 py-3 font-medium text-slate-900">{item.title}</td>
                      <td className="px-3 py-3">{item.project_name}</td>
                      <td className="px-3 py-3">{item.assignee_name || "Unassigned"}</td>
                      <td className="px-3 py-3">{formatDate(item.due_date)}</td>
                      <td className="px-3 py-3 font-semibold text-rose-700">{item.days_overdue}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-3 py-8 text-center text-slate-500">
                      No overdue tasks. Nice work.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Activity feed</h3>
              <p className="mt-1 text-sm text-slate-400">Last 20 events from your projects.</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
              Live
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {activity.length ? (
              activity.map((item) => (
                <article key={item.id} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-400/90 text-sm font-bold text-slate-950">
                      {item.actor_avatar_url ? (
                        <img src={item.actor_avatar_url} alt={item.actor_name} className="h-full w-full object-cover" />
                      ) : (
                        item.actor_name?.charAt(0)?.toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-6 text-white">{describeActivity(item)}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{formatRelativeTime(item.created_at)}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
                No recent activity yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppFrame>
  );
}

export default Dashboard;
