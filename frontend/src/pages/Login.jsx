import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const { loading, signInWithEmail, signInWithGoogle, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && !loading) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, navigate, user]);

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await signInWithEmail(email, password);
      navigate("/dashboard", { replace: true });
    } catch (authError) {
      setError("We couldn't sign you in with email and password. Double-check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setSubmitting(true);
    setError("");

    try {
      await signInWithGoogle();
      navigate("/dashboard", { replace: true });
    } catch (authError) {
      setError("Google sign-in was interrupted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(247,127,0,0.22),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(20,33,61,0.14),transparent_28%)]" />
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2.25rem] border border-white/70 bg-slate-950 px-8 py-10 text-white shadow-[0_30px_90px_rgba(15,23,42,0.35)] sm:px-10 lg:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">Realtime Workspace</p>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Focus your team around work that actually moves.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Team Task Manager brings boards, activity, assignments, notifications, and role-based collaboration into one
            calm operating surface.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Projects", "Shared visibility for owners, admins, and members."],
              ["Realtime", "WebSocket updates for fast-moving task changes."],
              ["Delivery", "GitHub Pages frontend with Railway-ready backend."],
            ].map(([label, copy]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-2 text-sm text-slate-400">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2.25rem] border border-white/70 bg-white/80 p-8 shadow-[0_30px_90px_rgba(148,163,184,0.22)] backdrop-blur sm:p-10">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Authentication</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Sign in to your workspace</h2>
            <p className="mt-2 text-sm text-slate-600">
              Use Google for one-tap access or email and password for direct sign-in.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting || loading}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-950">G</span>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            or
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email address</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || loading}
              className="w-full rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Signing you in..." : "Sign in with Email"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            If the email account does not exist yet, the app will create it with the password you provide.
          </p>
        </section>
      </div>
    </div>
  );
}

export default Login;
