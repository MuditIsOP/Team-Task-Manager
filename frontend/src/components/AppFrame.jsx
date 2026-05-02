import { Link, NavLink } from "react-router-dom";
import { useEffect, useState } from "react";

import Notifications from "./Notifications";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const staticNavItems = [
  { to: "/dashboard", label: "Dashboard" },
];

function AppFrame({ title, subtitle, children }) {
  const { signOut, user } = useAuth();
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadProjects() {
      try {
        const response = await api.get("/projects/");
        if (isMounted) {
          setProjects(response.data);
        }
      } catch (error) {
        // Silently fail if projects can't be loaded
      }
    }
    loadProjects();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreateProject() {
    const name = window.prompt("Enter new project name:");
    if (!name?.trim()) return;
    try {
      const response = await api.post("/projects/", { name: name.trim(), description: "" });
      setProjects((prev) => [...prev, response.data]);
    } catch (error) {
      alert("Failed to create project");
    }
  }

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-white/70 bg-slate-950 px-6 py-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
          <Link to="/dashboard" className="inline-flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-lg font-black text-slate-950">
              TM
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Team Task</p>
              <h1 className="text-lg font-semibold">Manager</h1>
            </div>
          </Link>

          <nav className="mt-10 space-y-2">
            {staticNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Projects</p>
              <button 
                type="button" 
                onClick={handleCreateProject}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
                title="Create Project"
              >
                +
              </button>
            </div>
            {projects.map((project) => (
              <NavLink
                key={project.id}
                to={`/projects/${project.id}`}
                className={({ isActive }) =>
                  `flex items-center rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <span className="truncate">{project.name}</span>
              </NavLink>
            ))}

            <div className="pt-4">
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                Settings
              </NavLink>
            </div>
          </nav>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Signed in</p>
            <p className="mt-2 text-sm font-semibold">{user?.displayName || user?.email}</p>
            <p className="mt-1 text-xs text-slate-400">{user?.email}</p>
            <button
              type="button"
              onClick={signOut}
              className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white transition hover:border-amber-300 hover:text-amber-200"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_30px_80px_rgba(148,163,184,0.18)] backdrop-blur xl:p-8">
          <header className="mb-8 flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Command Center</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <Notifications />
              <div className="rounded-2xl bg-slate-900 px-4 py-3 text-right text-white shadow-lg">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300">Sync Target</p>
                <p className="mt-1 text-sm font-medium">{import.meta.env.VITE_API_URL || "Set VITE_API_URL"}</p>
              </div>
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}

export default AppFrame;
