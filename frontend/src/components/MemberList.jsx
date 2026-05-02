import { useState } from "react";

import api from "../api/axios";
import { useToast } from "../context/ToastContext";

function MemberList({ projectId, members, isAdmin, onClose, onMembersChange }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function refreshMembers() {
    const response = await api.get(`/projects/${projectId}`);
    onMembersChange(response.data.members || []);
  }

  async function handleAddMember(event) {
    event.preventDefault();
    if (!isAdmin || !email) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await api.post(`/projects/${projectId}/members`, { email });
      await refreshMembers();
      setEmail("");
      showToast("Member added.", "success");
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to add member.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveMember(member) {
    if (!isAdmin) {
      return;
    }

    try {
      await api.delete(`/projects/${projectId}/members/${member.user_id}`);
      await refreshMembers();
      showToast("Member removed.", "success");
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to remove member.");
      setError(msg);
      showToast(msg, "error");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 px-4">
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Project Members</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Team roster</h3>
            <p className="mt-2 text-sm text-slate-600">See roles, add teammates by email, and remove members when needed.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">
            Close
          </button>
        </div>

        {isAdmin ? (
          <form onSubmit={handleAddMember} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {submitting ? "Adding..." : "Add member"}
            </button>
          </form>
        ) : null}

        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-6 space-y-3">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xs font-bold text-white">
                  {member.user?.avatar_url ? (
                    <img src={member.user.avatar_url} alt={member.user.name} className="h-full w-full object-cover" />
                  ) : (
                    member.user?.name?.slice(0, 1)?.toUpperCase() || "?"
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{member.user?.name || member.user?.email}</p>
                  <p className="truncate text-xs text-slate-500">{member.user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${member.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-700"}`}>
                  {member.role}
                </span>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member)}
                    className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-rose-600 transition hover:bg-rose-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MemberList;
