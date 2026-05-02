import { useEffect, useState } from "react";

import api from "../api/axios";

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchProjects() {
      try {
        const response = await api.get("/projects/");
        if (isMounted) {
          setProjects(response.data);
        }
      } catch (requestError) {
        if (isMounted) {
          setError("Unable to load projects.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProjects();

    return () => {
      isMounted = false;
    };
  }, []);

  return { projects, loading, error };
}
