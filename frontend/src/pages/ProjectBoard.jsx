import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import api from "../api/axios";
import AppFrame from "../components/AppFrame";
import KanbanBoard from "../components/KanbanBoard";
import MemberList from "../components/MemberList";
import TaskModal from "../components/TaskModal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWebSocket } from "../hooks/useWebSocket";

function hydrateTask(task, comments = [], members = []) {
  const assignee = members.find((member) => member.user?.id === task.assignee_id)?.user;
  return {
    ...task,
    assignee_name: task.assignee_name ?? assignee?.name ?? null,
    assignee_avatar_url: task.assignee_avatar_url ?? assignee?.avatar_url ?? null,
    comment_count: task.comment_count ?? comments.length ?? 0,
    attachment_count: task.attachment_count ?? task.attachments?.length ?? 0,
  };
}

function ProjectBoard() {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showMemberList, setShowMemberList] = useState(false);

  const currentMember = useMemo(
    () => members.find((member) => member.user?.email === user?.email),
    [members, user?.email],
  );
  const isAdmin = currentMember?.role === "admin";

  const handleTaskSave = useCallback((savedTask) => {
    setTasks((current) => {
      const exists = current.some((task) => task.id === savedTask.id);
      const assignee = members.find((member) => member.user?.id === savedTask.assignee_id)?.user;
      const nextTask = {
        ...hydrateTask(savedTask, [], members),
        assignee_name: savedTask.assignee_name ?? assignee?.name ?? null,
        assignee_avatar_url: savedTask.assignee_avatar_url ?? assignee?.avatar_url ?? null,
      };
      if (!exists) {
        return [...current, nextTask];
      }
      return current.map((task) => (task.id === savedTask.id ? { ...task, ...nextTask } : task));
    });
  }, [members]);

  const handleTaskDelete = useCallback((taskId) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  useWebSocket(id, {
    setTasks,
    setMembers,
    onTaskAssigned: (task) => {
      if (currentMember?.user_id === task.assignee_id) {
        showToast(`Task assigned to you: ${task.title}.`, "info");
      }
    },
  });

  useEffect(() => {
    let isMounted = true;

    async function loadBoard() {
      setLoading(true);
      setError("");

      try {
        const [projectResponse, tasksResponse] = await Promise.all([
          api.get(`/projects/${id}`),
          api.get(`/projects/${id}/tasks`),
        ]);

        const enrichedTasks = await Promise.all(
          tasksResponse.data.map(async (task) => {
            try {
              const commentsResponse = await api.get(`/tasks/${task.id}/comments`);
              return hydrateTask(task, commentsResponse.data, projectResponse.data.members || []);
            } catch (commentError) {
              return hydrateTask(task, [], projectResponse.data.members || []);
            }
          }),
        );

        if (!isMounted) {
          return;
        }

        setProject(projectResponse.data);
        setMembers(projectResponse.data.members || []);
        setTasks(enrichedTasks);
      } catch (requestError) {
        if (isMounted) {
          const rawDetail = requestError?.response?.data?.detail;
          const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to load project board.");
          setError(msg);
          showToast(msg, "error");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadBoard();

    return () => {
      isMounted = false;
    };
  }, [id, showToast]);

  async function handleStatusChange(taskId, nextStatus) {
    const previousTasks = tasks;
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)));

    try {
      const response = await api.patch(`/tasks/${taskId}/status`, { status: nextStatus });
      handleTaskSave(response.data);
      showToast("Task status changed.", "success");
    } catch (requestError) {
      setTasks(previousTasks);
      const rawDetail = requestError?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to update task status.");
      setError(msg);
      showToast(msg, "error");
    }
  }

  return (
    <AppFrame
      title={project?.name || "Project Board"}
      subtitle={project?.description || "Plan, move, and review work across the kanban flow with realtime team updates."}
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="mb-6 flex flex-col gap-3 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Realtime Board</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{project?.name || id}</h3>
          <p className="mt-2 text-sm text-slate-600">
            {tasks.length} tasks across {members.length || 0} members.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMemberList(true)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-700"
          >
            Members
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setSelectedTask({ project_id: id })}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Add Task
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[24rem] animate-pulse rounded-[1.75rem] border border-slate-200 bg-white/70" />
          ))}
        </div>
      ) : (
        <KanbanBoard tasks={tasks} onStatusChange={handleStatusChange} onOpenTask={setSelectedTask} />
      )}

      {selectedTask ? (
        <TaskModal
          projectId={id}
          task={selectedTask.id ? selectedTask : null}
          members={members}
          canEdit
          canManage={isAdmin}
          onClose={() => setSelectedTask(null)}
          onSaved={handleTaskSave}
          onDeleted={handleTaskDelete}
        />
      ) : null}

      {showMemberList ? (
        <MemberList
          projectId={id}
          members={members}
          isAdmin={isAdmin}
          onClose={() => setShowMemberList(false)}
          onMembersChange={setMembers}
        />
      ) : null}
    </AppFrame>
  );
}

export default ProjectBoard;
