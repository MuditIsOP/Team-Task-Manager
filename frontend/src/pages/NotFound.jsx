import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-[2.25rem] border border-white/80 bg-white/85 p-10 text-center shadow-[0_30px_90px_rgba(148,163,184,0.22)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-600">404</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">Page not found</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          The route you tried to open does not exist in this workspace. Head back to the dashboard to keep moving.
        </p>
        <Link
          to="/dashboard"
          className="mt-8 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
