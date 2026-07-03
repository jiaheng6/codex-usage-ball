import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  ChevronDown,
  Pin,
  Power,
  RefreshCcw,
  Settings,
} from "lucide-react";
import "./App.css";

type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

type CreditsSnapshot = {
  balance: string | null;
  hasCredits: boolean;
  unlimited: boolean;
};

type RateLimitSnapshot = {
  credits: CreditsSnapshot | null;
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: RateLimitWindow | null;
  rateLimitReachedType: string | null;
  secondary: RateLimitWindow | null;
};

type RateLimitsResponse = {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot> | null;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const mockUsage: RateLimitsResponse = {
  rateLimits: {
    credits: { balance: "0", hasCredits: false, unlimited: false },
    limitId: "codex",
    limitName: null,
    planType: "prolite",
    primary: {
      usedPercent: 16,
      windowDurationMins: 300,
      resetsAt: Math.floor(Date.now() / 1000) + 62 * 60,
    },
    rateLimitReachedType: null,
    secondary: {
      usedPercent: 67,
      windowDurationMins: 10080,
      resetsAt: Math.floor(Date.now() / 1000) + 4 * 24 * 60 * 60,
    },
  },
  rateLimitsByLimitId: {
    codex: {
      credits: { balance: "0", hasCredits: false, unlimited: false },
      limitId: "codex",
      limitName: null,
      planType: "prolite",
      primary: {
        usedPercent: 16,
        windowDurationMins: 300,
        resetsAt: Math.floor(Date.now() / 1000) + 62 * 60,
      },
      rateLimitReachedType: null,
      secondary: {
        usedPercent: 67,
        windowDurationMins: 10080,
        resetsAt: Math.floor(Date.now() / 1000) + 4 * 24 * 60 * 60,
      },
    },
    codex_bengalfox: {
      credits: null,
      limitId: "codex_bengalfox",
      limitName: "GPT-5.3-Codex-Spark",
      planType: "prolite",
      primary: {
        usedPercent: 0,
        windowDurationMins: 300,
        resetsAt: Math.floor(Date.now() / 1000) + 118 * 60,
      },
      rateLimitReachedType: null,
      secondary: {
        usedPercent: 0,
        windowDurationMins: 10080,
        resetsAt: Math.floor(Date.now() / 1000) + 4 * 24 * 60 * 60,
      },
    },
  },
};

function isTauriRuntime() {
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function remainingPercent(windowData: RateLimitWindow | null) {
  if (!windowData) return null;
  return 100 - clampPercent(windowData.usedPercent);
}

function formatResetTime(timestamp: number | null) {
  if (!timestamp) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatWindowName(windowData: RateLimitWindow | null, fallback: string) {
  if (!windowData?.windowDurationMins) return fallback;
  if (windowData.windowDurationMins === 300) return "5 小时窗口";
  if (windowData.windowDurationMins === 10080) return "7 天窗口";
  if (windowData.windowDurationMins < 60) return `${windowData.windowDurationMins} 分钟窗口`;
  if (windowData.windowDurationMins % 60 === 0) {
    return `${windowData.windowDurationMins / 60} 小时窗口`;
  }
  return `${windowData.windowDurationMins} 分钟窗口`;
}

function getTone(percent: number | null) {
  if (percent === null) return "unknown";
  if (percent <= 15) return "danger";
  if (percent <= 30) return "warning";
  return "good";
}

function WindowMetric({
  fallbackName,
  value,
}: {
  fallbackName: string;
  value: RateLimitWindow | null;
}) {
  const remain = remainingPercent(value);
  const tone = getTone(remain);

  return (
    <section className={`metric metric-${tone}`}>
      <div>
        <p className="metric-label">{formatWindowName(value, fallbackName)}</p>
        <p className="metric-reset">{formatResetTime(value?.resetsAt ?? null)} 重置</p>
      </div>
      <strong>{remain === null ? "--" : `${remain}%`}</strong>
    </section>
  );
}

function App() {
  const [usage, setUsage] = useState<RateLimitsResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadUsage = useCallback(async () => {
    setState("loading");
    setError(null);

    try {
      const data = isTauriRuntime()
        ? await invoke<RateLimitsResponse>("read_rate_limits")
        : await Promise.resolve(mockUsage);

      setUsage(data);
      setLastUpdatedAt(new Date());
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, []);

  useEffect(() => {
    loadUsage();
    const timer = window.setInterval(loadUsage, 60_000);
    return () => window.clearInterval(timer);
  }, [loadUsage]);

  const activeLimit = usage?.rateLimits ?? null;
  const limits = useMemo(() => {
    if (!usage?.rateLimitsByLimitId) return [];
    return Object.values(usage.rateLimitsByLimitId);
  }, [usage]);

  const primaryRemaining = remainingPercent(activeLimit?.primary ?? null);
  const primaryTone = getTone(primaryRemaining);

  return (
    <main className="app-shell" data-tauri-drag-region>
      <section className={`usage-ball usage-ball-${primaryTone}`} aria-label="Codex 用量悬浮球">
        <span>{primaryRemaining === null ? "--" : primaryRemaining}</span>
        <small>%</small>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Codex 用量</p>
            <h1>剩余额度</h1>
          </div>
          <button className="icon-button" type="button" aria-label="刷新用量" onClick={loadUsage}>
            <RefreshCcw size={18} />
          </button>
        </header>

        {state === "error" ? (
          <section className="notice">
            <AlertTriangle size={18} />
            <p>{error ?? "读取 Codex 用量失败"}</p>
          </section>
        ) : null}

        <div className="metrics">
          <WindowMetric fallbackName="短期窗口" value={activeLimit?.primary ?? null} />
          <WindowMetric fallbackName="长期窗口" value={activeLimit?.secondary ?? null} />
        </div>

        <section className="summary">
          <div>
            <span>计划</span>
            <strong>{activeLimit?.planType ?? "--"}</strong>
          </div>
          <div>
            <span>Credits</span>
            <strong>
              {activeLimit?.credits?.unlimited
                ? "不限"
                : activeLimit?.credits?.balance ?? "--"}
            </strong>
          </div>
          <div>
            <span>状态</span>
            <strong>{activeLimit?.rateLimitReachedType ? "已触顶" : "可用"}</strong>
          </div>
        </section>

        <section className="limits">
          <button className="limits-title" type="button">
            <span>模型用量桶</span>
            <ChevronDown size={16} />
          </button>
          <div className="limit-list">
            {limits.map((limit) => {
              const remain = remainingPercent(limit.primary);
              return (
                <div className="limit-row" key={limit.limitId ?? limit.limitName ?? "default"}>
                  <span>{limit.limitName ?? limit.limitId ?? "Codex"}</span>
                  <strong>{remain === null ? "--" : `${remain}%`}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <footer>
          <span>
            {state === "loading"
              ? "正在刷新"
              : lastUpdatedAt
                ? `${lastUpdatedAt.toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} 更新`
                : "等待数据"}
          </span>
          <div className="footer-actions">
            <button className="icon-button" type="button" aria-label="固定位置">
              <Pin size={16} />
            </button>
            <button className="icon-button" type="button" aria-label="设置">
              <Settings size={16} />
            </button>
            <button className="icon-button" type="button" aria-label="退出">
              <Power size={16} />
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default App;
