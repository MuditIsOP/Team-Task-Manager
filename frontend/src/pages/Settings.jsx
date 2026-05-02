import AppFrame from "../components/AppFrame";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import axios from "axios";
import { useEffect, useState } from "react";

function Settings() {
  const { signOut, user } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const response = await api.get("/users/me");
        if (isMounted) {
          setName(response.data.name || "");
          setAvatarUrl(response.data.avatar_url || "");
        }
      } catch (error) {
        if (isMounted) {
          showToast("Unable to load your profile.", "error");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [showToast]);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await api.patch("/users/me", { name, avatar_url: avatarUrl || null });
      showToast("Profile updated.", "success");
    } catch (error) {
      const rawDetail = error?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to update profile.");
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSaving(true);
    try {
      const presignResponse = await api.post("/attachments/avatar-presigned-url", {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
      });

      await axios.put(presignResponse.data.upload_url, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      setAvatarUrl(presignResponse.data.file_url);
      await api.patch("/users/me", { avatar_url: presignResponse.data.file_url });
      showToast("Avatar updated.", "success");
    } catch (error) {
      const rawDetail = error?.response?.data?.detail;
      const msg = typeof rawDetail === 'string' ? rawDetail : (Array.isArray(rawDetail) ? rawDetail[0]?.msg : "Unable to upload avatar.");
      showToast(msg, "error");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  return (
    <AppFrame
      title="Settings"
      subtitle="Update your profile, set an avatar, and manage your active session."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Profile</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xl font-bold text-white">
              {avatarUrl ? <img src={avatarUrl} alt={name || user?.email} className="h-full w-full object-cover" /> : (name || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{name || user?.displayName || "No display name yet"}</h3>
              <p className="mt-2 text-sm text-slate-600">{user?.email}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Display name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading || saving}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Avatar image</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-700">
                  {saving ? "Uploading..." : "Upload avatar"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
                {avatarUrl ? <span className="text-xs text-slate-500">Stored on Storj</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={loading || saving}
                className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-70"
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Environment checklist</h3>
          <ul className="mt-5 space-y-3 text-sm text-slate-600">
            <li>`VITE_API_URL` should point at the FastAPI backend.</li>
            <li>`VITE_WS_URL` should point at the websocket base for project rooms.</li>
            <li>`VITE_FIREBASE_*` values should match your Firebase web app config.</li>
          </ul>
        </section>
      </div>
    </AppFrame>
  );
}

export default Settings;
