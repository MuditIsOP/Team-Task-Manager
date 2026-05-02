import axios from "axios";

import { auth } from "../context/AuthContext";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (!user) {
    return config;
  }

  const token = await user.getIdToken();
  config.headers = config.headers ?? {};
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && window.location.hash !== "#/login") {
      window.location.hash = "#/login";
    }
    return Promise.reject(error);
  },
);

export default api;
