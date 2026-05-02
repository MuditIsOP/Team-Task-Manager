import { useEffect, useMemo, useState } from "react";

import axios from "axios";

import api from "../api/axios";
import { useToast } from "../context/ToastContext";

const statusOptions = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function createEmptyTask(projectId) {
  return {
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    project_id: projectId,
    assignee_id: null,
    due_date: "",
    labels: [],
    attachments: [],
    comments: [],
  };
}

function TaskModal({ projectId, task, members, canEdit, canManage, onClose, onSaved, onDeleted }) {
  const { showToast } = useToast();
  const isCreating = !task?.id;
  const [form, setForm] = useState(createEmptyTask(projectId));
  const [commentBody, setCommentBody] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTask() {
      if (!task?.id) {
        setForm(createEmptyTask(projectId));
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await api.get(`/tasks/${task.id}`);
        if (isMounted) {
          setForm({
            ...response.data,
            due_date: response.data.due_date || "",
          });
        }
      } catch (requestError) {
        if (isMounted) {
          setError("Unable to load task details.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTask();
    return () => {
      isMounted = false;
    };
  }, [projectId, task?.id]);

  const assigneeOptions = useMemo(() => members.map((member) => member.user).filter(Boolean), [members]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleAddLabel() {
    const next = labelInput.trim();
    if (!next || form.labels.includes(next)) {
      return;
    }
    updateField("labels", [...form.labels, next]);
    setLabelInput("");
  }

  function handleRemoveLabel(label) {
    updateField(
      "labels",
      form.labels.filter((item) => item !== label),
    );
  }

  async function handleSave() {
    setLoading(true);
    setError("");

    try {
      const payload = {
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        project_id: projectId,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
        labels: form.labels,
        attachments: form.attachments,
      };

      const response = isCreating
        ? await api.post("/tasks/", payload)
        : await api.patch(`/tasks/${task.id}`, payload);

      onSaved(response.data);
      showToast(isCreating ? "Task created." : "Task updated.", "success");
      onClose();
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to save task.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusOnlyChange(value) {
    setLoading(true);
    setError("");

    try {
      const response = await api.patch(`/tasks/${task.id}/status`, { status: value });
      setForm((current) => ({ ...current, status: response.data.status }));
      onSaved(response.data);
      showToast("Task status changed.", "success");
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to update status.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddComment() {
    if (!task?.id || !commentBody.trim()) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.post(`/tasks/${task.id}/comments`, { body: commentBody.trim() });
      setForm((current) => ({
        ...current,
        comments: [...(current.comments || []), response.data],
      }));
      onSaved({
        ...task,
        comment_count: (task.comment_count ?? 0) + 1,
      });
      setCommentBody("");
      showToast("Comment added.", "success");
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to add comment.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadAttachment(event) {
    const file = event.target.files?.[0];
    if (!file || !task?.id) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const presignResponse = await api.post("/attachments/presigned-url", {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        task_id: task.id,
      });

      await axios.put(presignResponse.data.upload_url, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      const nextAttachments = [
        ...(form.attachments || []),
        { name: file.name, url: presignResponse.data.file_url, size: file.size },
      ];

      const taskResponse = await api.patch(`/tasks/${task.id}`, {
        attachments: nextAttachments,
      });

      setForm((current) => ({
        ...current,
        attachments: nextAttachments,
      }));
      onSaved(taskResponse.data);
      showToast("Attachment uploaded.", "success");
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to upload attachment.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function handleDeleteAttachment(url) {
    if (!task?.id) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.delete("/attachments/", { data: { task_id: task.id, url } });
      const nextAttachments = form.attachments.filter((attachment) => attachment.url !== url);
      setForm((current) => ({ ...current, attachments: nextAttachments }));
      const taskResponse = await api.patch(`/tasks/${task.id}`, { attachments: nextAttachments });
      onSaved(taskResponse.data);
      showToast("Attachment removed.", "success");
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to remove attachment.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTask() {
    if (!task?.id || !window.confirm("Delete this task permanently?")) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.delete(`/tasks/${task.id}`);
      onDeleted(task.id);
      showToast("Task deleted.", "success");
      onClose();
    } catch (requestError) {
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to delete task.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">{isCreating ? "Create Task" : "Task Detail"}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{isCreating ? "New task" : form.title || "Untitled task"}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">
            Close
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Title</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                disabled={!canManage || loading}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Description</span>
              <textarea
                rows="5"
                value={form.description || ""}
                onChange={(event) => updateField("description", event.target.value)}
                disabled={!canManage || loading}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Labels</span>
              <div className="flex flex-wrap gap-2">
                {form.labels.map((label) => (
                  <span key={label} className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                    {label}
                    {canManage ? (
                      <button type="button" onClick={() => handleRemoveLabel(label)} className="text-slate-500">
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
              {canManage ? (
                <div className="mt-3 flex gap-2">
                  <input
                    value={labelInput}
                    onChange={(event) => setLabelInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddLabel();
                      }
                    }}
                    placeholder="Add a label"
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  />
                  <button type="button" onClick={handleAddLabel} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">
                    Add
                  </button>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Attachments</span>
                {canEdit && !isCreating ? (
                  <label className="cursor-pointer rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 hover:border-amber-300 hover:text-amber-700">
                    Upload
                    <input type="file" className="hidden" onChange={handleUploadAttachment} />
                  </label>
                ) : null}
              </div>
              <div className="space-y-2">
                {(form.attachments || []).length ? (
                  form.attachments.map((attachment) => (
                    <div key={attachment.url} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <a href={attachment.url} target="_blank" rel="noreferrer" className="truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                          {attachment.name}
                        </a>
                        <p className="mt-1 text-xs text-slate-500">
                          {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : "Unknown size"}
                        </p>
                      </div>
                      {canManage ? (
                        <button type="button" onClick={() => handleDeleteAttachment(attachment.url)} className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No attachments yet.</div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => (canManage || isCreating ? updateField("status", event.target.value) : handleStatusOnlyChange(event.target.value))}
                  disabled={loading || (isCreating && !canManage)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Priority</span>
                <select
                  value={form.priority}
                  onChange={(event) => updateField("priority", event.target.value)}
                  disabled={!canManage || loading}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Assignee</span>
                <select
                  value={form.assignee_id || ""}
                  onChange={(event) => updateField("assignee_id", event.target.value || null)}
                  disabled={!canManage || loading}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name || member.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Due date</span>
                <input
                  type="date"
                  value={form.due_date || ""}
                  onChange={(event) => updateField("due_date", event.target.value)}
                  disabled={!canManage || loading}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
                />
              </label>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-950">Comments</h4>
                <span className="text-xs text-slate-500">{(form.comments || []).length} total</span>
              </div>
              <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
                {(form.comments || []).map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xs font-bold text-white">
                        {comment.user_avatar_url ? (
                          <img src={comment.user_avatar_url} alt={comment.user_name} className="h-full w-full object-cover" />
                        ) : (
                          comment.user_name?.slice(0, 1)?.toUpperCase() || "?"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{comment.user_name || "Teammate"}</p>
                          <p className="text-xs text-slate-500">{new Date(comment.created_at).toLocaleString()}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{comment.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!isCreating ? (
                <div className="mt-4">
                  <textarea
                    rows="3"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Add a comment"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={!commentBody.trim() || loading}
                    className="mt-3 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    Post comment
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {!isCreating && canManage ? (
              <button
                type="button"
                onClick={handleDeleteTask}
                disabled={loading}
                className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-rose-600 hover:bg-rose-50"
              >
                Delete task
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || !form.title.trim()}
                className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-70"
              >
                {loading ? "Saving..." : isCreating ? "Create task" : "Save changes"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskModal;
