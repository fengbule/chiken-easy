import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export default function useAgents() {
  const [agents, setAgents] = useState([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const request = useRef(null);
  const refresh = useCallback(async () => {
    if (active.current || !mounted.current) return;
    active.current = true;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setPending(true);
    try {
      const rows = await api("/api/agents", { signal: controller.signal });
      if (!Array.isArray(rows)) throw new Error("服务器列表格式异常");
      if (mounted.current) {
        setAgents(rows);
        setUpdatedAt(new Date());
        setError("");
      }
    } catch (failure) {
      if (mounted.current)
        setError(
          controller.signal.aborted
            ? "请求超时，请检查连接后重试。"
            : failure.message || "无法获取服务器列表",
        );
    } finally {
      clearTimeout(timeout);
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 5000);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      request.current?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return { agents, pending, error, updatedAt, refresh };
}
