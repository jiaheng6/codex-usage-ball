import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  ChevronDown,
  Languages,
  MonitorCog,
  Moon,
  Pin,
  Power,
  RefreshCcw,
  Settings,
  Sun,
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
type Language = "zh-CN" | "en-US";
type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

type AppSettings = {
  language: Language;
  themeMode: ThemeMode;
  refreshIntervalSec: 30 | 60;
};

type Copy = {
  appAria: string;
  appEyebrow: string;
  appTitle: string;
  refresh: string;
  readFailed: string;
  shortFallback: string;
  longFallback: string;
  resetSuffix: string;
  plan: string;
  credits: string;
  status: string;
  available: string;
  reached: string;
  unlimited: string;
  limitsTitle: string;
  collapse: string;
  expand: string;
  loading: string;
  waiting: string;
  updated: (time: string) => string;
  pinPosition: string;
  settings: string;
  exit: string;
  settingsTitle: string;
  language: string;
  chinese: string;
  english: string;
  theme: string;
  followSystem: string;
  light: string;
  dark: string;
  refreshFrequency: string;
  seconds: (value: number) => string;
  lowNotice: string;
  noticeAt15: string;
  startup: string;
  comingSoon: string;
  unknown: string;
  windowFiveHours: string;
  windowSevenDays: string;
  minuteWindow: (value: number) => string;
  hourWindow: (value: number) => string;
};

const STORAGE_KEY = "codex-usage-ball-settings";

const defaultSettings: AppSettings = {
  language: "zh-CN",
  themeMode: "system",
  refreshIntervalSec: 60,
};

const copy: Record<Language, Copy> = {
  "zh-CN": {
    appAria: "Codex 用量悬浮球",
    appEyebrow: "Codex 用量",
    appTitle: "剩余额度",
    refresh: "刷新用量",
    readFailed: "读取 Codex 用量失败",
    shortFallback: "短期窗口",
    longFallback: "长期窗口",
    resetSuffix: "重置",
    plan: "计划",
    credits: "Credits",
    status: "状态",
    available: "可用",
    reached: "已触顶",
    unlimited: "不限",
    limitsTitle: "模型用量桶",
    collapse: "收起",
    expand: "展开",
    loading: "正在刷新",
    waiting: "等待数据",
    updated: (time) => `${time} 更新`,
    pinPosition: "固定位置",
    settings: "设置",
    exit: "退出",
    settingsTitle: "偏好设置",
    language: "语言",
    chinese: "中文",
    english: "English",
    theme: "主题",
    followSystem: "跟随系统",
    light: "亮色",
    dark: "暗色",
    refreshFrequency: "刷新频率",
    seconds: (value) => `${value} 秒`,
    lowNotice: "低额度通知",
    noticeAt15: "低于 15% 提醒",
    startup: "开机自启",
    comingSoon: "稍后接入",
    unknown: "未知",
    windowFiveHours: "5 小时窗口",
    windowSevenDays: "7 天窗口",
    minuteWindow: (value) => `${value} 分钟窗口`,
    hourWindow: (value) => `${value} 小时窗口`,
  },
  "en-US": {
    appAria: "Codex usage ball",
    appEyebrow: "Codex Usage",
    appTitle: "Remaining Limits",
    refresh: "Refresh usage",
    readFailed: "Failed to read Codex usage",
    shortFallback: "Short window",
    longFallback: "Long window",
    resetSuffix: "reset",
    plan: "Plan",
    credits: "Credits",
    status: "Status",
    available: "Available",
    reached: "Limited",
    unlimited: "Unlimited",
    limitsTitle: "Model buckets",
    collapse: "Collapse",
    expand: "Expand",
    loading: "Refreshing",
    waiting: "Waiting for data",
    updated: (time) => `Updated ${time}`,
    pinPosition: "Pin position",
    settings: "Settings",
    exit: "Exit",
    settingsTitle: "Preferences",
    language: "Language",
    chinese: "中文",
    english: "English",
    theme: "Theme",
    followSystem: "System",
    light: "Light",
    dark: "Dark",
    refreshFrequency: "Refresh rate",
    seconds: (value) => `${value}s`,
    lowNotice: "Low-limit alert",
    noticeAt15: "Alert below 15%",
    startup: "Launch at login",
    comingSoon: "Coming later",
    unknown: "Unknown",
    windowFiveHours: "5-hour window",
    windowSevenDays: "7-day window",
    minuteWindow: (value) => `${value}-minute window`,
    hourWindow: (value) => `${value}-hour window`,
  },
};

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

function readSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      language: parsed.language === "en-US" ? "en-US" : "zh-CN",
      themeMode:
        parsed.themeMode === "light" || parsed.themeMode === "dark" ? parsed.themeMode : "system",
      refreshIntervalSec: parsed.refreshIntervalSec === 30 ? 30 : 60,
    };
  } catch {
    return defaultSettings;
  }
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function remainingPercent(windowData: RateLimitWindow | null) {
  if (!windowData) return null;
  return 100 - clampPercent(windowData.usedPercent);
}

function formatResetTime(timestamp: number | null, language: Language, text: Copy) {
  if (!timestamp) return text.unknown;
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatTime(date: Date, language: Language) {
  return date.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWindowName(windowData: RateLimitWindow | null, fallback: string, text: Copy) {
  if (!windowData?.windowDurationMins) return fallback;
  if (windowData.windowDurationMins === 300) return text.windowFiveHours;
  if (windowData.windowDurationMins === 10080) return text.windowSevenDays;
  if (windowData.windowDurationMins < 60) return text.minuteWindow(windowData.windowDurationMins);
  if (windowData.windowDurationMins % 60 === 0) {
    return text.hourWindow(windowData.windowDurationMins / 60);
  }
  return text.minuteWindow(windowData.windowDurationMins);
}

function getTone(percent: number | null) {
  if (percent === null) return "unknown";
  if (percent <= 15) return "danger";
  if (percent <= 30) return "warning";
  return "good";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme {
  return mode === "system" ? systemTheme : mode;
}

function WindowMetric({
  fallbackName,
  language,
  text,
  value,
}: {
  fallbackName: string;
  language: Language;
  text: Copy;
  value: RateLimitWindow | null;
}) {
  const remain = remainingPercent(value);
  const tone = getTone(remain);
  const resetTime = formatResetTime(value?.resetsAt ?? null, language, text);

  return (
    <section className={`metric metric-${tone}`}>
      <div>
        <p className="metric-label">{formatWindowName(value, fallbackName, text)}</p>
        <p className="metric-reset">
          {resetTime} {text.resetSuffix}
        </p>
      </div>
      <strong>{remain === null ? "--" : `${remain}%`}</strong>
    </section>
  );
}

function ChoiceButton<T extends string | number>({
  active,
  children,
  onClick,
  value,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: (value: T) => void;
  value: T;
}) {
  return (
    <button
      className={`choice-button${active ? " choice-button-active" : ""}`}
      type="button"
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  );
}

function App() {
  const [usage, setUsage] = useState<RateLimitsResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [settings, setSettings] = useState<AppSettings>(readSettings);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [showSettings, setShowSettings] = useState(false);
  const [showLimits, setShowLimits] = useState(true);

  const text = copy[settings.language];
  const resolvedTheme = resolveTheme(settings.themeMode, systemTheme);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = settings.language;
  }, [resolvedTheme, settings.language]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemTheme(query.matches ? "dark" : "light");

    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    loadUsage();
    const timer = window.setInterval(loadUsage, settings.refreshIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [loadUsage, settings.refreshIntervalSec]);

  const activeLimit = usage?.rateLimits ?? null;
  const limits = useMemo(() => {
    if (!usage?.rateLimitsByLimitId) return [];
    return Object.values(usage.rateLimitsByLimitId);
  }, [usage]);

  const primaryRemaining = remainingPercent(activeLimit?.primary ?? null);
  const primaryTone = getTone(primaryRemaining);

  return (
    <main className="app-shell" data-tauri-drag-region data-theme={resolvedTheme}>
      <section className={`usage-ball usage-ball-${primaryTone}`} aria-label={text.appAria}>
        <span>{primaryRemaining === null ? "--" : primaryRemaining}</span>
        <small>%</small>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">{text.appEyebrow}</p>
            <h1>{text.appTitle}</h1>
          </div>
          <button className="icon-button" type="button" aria-label={text.refresh} onClick={loadUsage}>
            <RefreshCcw size={18} />
          </button>
        </header>

        {state === "error" ? (
          <section className="notice">
            <AlertTriangle size={18} />
            <p>{error ?? text.readFailed}</p>
          </section>
        ) : null}

        <div className="metrics">
          <WindowMetric
            fallbackName={text.shortFallback}
            language={settings.language}
            text={text}
            value={activeLimit?.primary ?? null}
          />
          <WindowMetric
            fallbackName={text.longFallback}
            language={settings.language}
            text={text}
            value={activeLimit?.secondary ?? null}
          />
        </div>

        <section className="summary">
          <div>
            <span>{text.plan}</span>
            <strong>{activeLimit?.planType ?? "--"}</strong>
          </div>
          <div>
            <span>{text.credits}</span>
            <strong>
              {activeLimit?.credits?.unlimited
                ? text.unlimited
                : activeLimit?.credits?.balance ?? "--"}
            </strong>
          </div>
          <div>
            <span>{text.status}</span>
            <strong>{activeLimit?.rateLimitReachedType ? text.reached : text.available}</strong>
          </div>
        </section>

        <section className="limits">
          <button
            className="limits-title"
            type="button"
            onClick={() => setShowLimits((current) => !current)}
          >
            <span>{text.limitsTitle}</span>
            <span className="section-action">
              {showLimits ? text.collapse : text.expand}
              <ChevronDown size={16} className={showLimits ? "chevron-open" : ""} />
            </span>
          </button>
          {showLimits ? (
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
          ) : null}
        </section>

        {showSettings ? (
          <section className="settings-sheet">
            <div className="settings-title">
              <Settings size={16} />
              <strong>{text.settingsTitle}</strong>
            </div>

            <div className="setting-row">
              <span>
                <Languages size={15} />
                {text.language}
              </span>
              <div className="segmented">
                <ChoiceButton
                  active={settings.language === "zh-CN"}
                  onClick={(language: Language) => updateSettings({ language })}
                  value="zh-CN"
                >
                  {text.chinese}
                </ChoiceButton>
                <ChoiceButton
                  active={settings.language === "en-US"}
                  onClick={(language: Language) => updateSettings({ language })}
                  value="en-US"
                >
                  {text.english}
                </ChoiceButton>
              </div>
            </div>

            <div className="setting-row">
              <span>
                <MonitorCog size={15} />
                {text.theme}
              </span>
              <div className="segmented segmented-compact">
                <ChoiceButton
                  active={settings.themeMode === "system"}
                  onClick={(themeMode: ThemeMode) => updateSettings({ themeMode })}
                  value="system"
                >
                  {text.followSystem}
                </ChoiceButton>
                <ChoiceButton
                  active={settings.themeMode === "light"}
                  onClick={(themeMode: ThemeMode) => updateSettings({ themeMode })}
                  value="light"
                >
                  <Sun size={14} />
                  {text.light}
                </ChoiceButton>
                <ChoiceButton
                  active={settings.themeMode === "dark"}
                  onClick={(themeMode: ThemeMode) => updateSettings({ themeMode })}
                  value="dark"
                >
                  <Moon size={14} />
                  {text.dark}
                </ChoiceButton>
              </div>
            </div>

            <div className="setting-row">
              <span>{text.refreshFrequency}</span>
              <div className="segmented">
                <ChoiceButton
                  active={settings.refreshIntervalSec === 60}
                  onClick={(refreshIntervalSec: 30 | 60) => updateSettings({ refreshIntervalSec })}
                  value={60}
                >
                  {text.seconds(60)}
                </ChoiceButton>
                <ChoiceButton
                  active={settings.refreshIntervalSec === 30}
                  onClick={(refreshIntervalSec: 30 | 60) => updateSettings({ refreshIntervalSec })}
                  value={30}
                >
                  {text.seconds(30)}
                </ChoiceButton>
              </div>
            </div>

            <div className="setting-row">
              <span>{text.lowNotice}</span>
              <em>{text.noticeAt15}</em>
            </div>

            <div className="setting-row">
              <span>{text.startup}</span>
              <em>{text.comingSoon}</em>
            </div>
          </section>
        ) : null}

        <footer>
          <span>
            {state === "loading"
              ? text.loading
              : lastUpdatedAt
                ? text.updated(formatTime(lastUpdatedAt, settings.language))
                : text.waiting}
          </span>
          <div className="footer-actions">
            <button className="icon-button" type="button" aria-label={text.pinPosition}>
              <Pin size={16} />
            </button>
            <button
              className={`icon-button${showSettings ? " icon-button-active" : ""}`}
              type="button"
              aria-label={text.settings}
              onClick={() => setShowSettings((current) => !current)}
            >
              <Settings size={16} />
            </button>
            <button className="icon-button" type="button" aria-label={text.exit}>
              <Power size={16} />
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default App;
