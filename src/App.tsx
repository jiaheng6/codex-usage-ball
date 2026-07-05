import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  Languages,
  MonitorCog,
  Moon,
  Power,
  RefreshCcw,
  Settings,
  Sun,
  X,
} from "lucide-react";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import "./App.css";
import {
  defaultSettings,
  normalizeAppSettings,
  normalizeLowNoticeThreshold,
  type AppSettings,
  type Language,
  type ResolvedTheme,
  type ThemeMode,
} from "./settings";
import { skinOptions } from "./skins";

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
type WindowKind = "ball" | "main" | "settings";
type LowNoticeWindowKey = "fiveHour" | "sevenDay";
type RateLimitBucketOption = {
  id: string;
  name: string;
};

type Copy = {
  appAria: string;
  appEyebrow: string;
  appTitle: string;
  ballLabel: string;
  openMainPanel: string;
  hideMainPanel: string;
  hideFloatingBall: string;
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
  settings: string;
  exit: string;
  settingsTitle: string;
  close: string;
  language: string;
  chinese: string;
  english: string;
  theme: string;
  themeSkin: string;
  activeRateLimitBucket: string;
  defaultRateLimitBucket: string;
  rateLimitBucketAria: string;
  showRateLimit: (selected: boolean) => string;
  followSystem: string;
  light: string;
  dark: string;
  refreshFrequency: string;
  seconds: (value: number) => string;
  lowNotice: string;
  noticeThreshold: (value: number) => string;
  noticeThresholdAria: string;
  lowNoticeTitle: string;
  lowNoticeBody: (windowName: string, remaining: number, threshold: number) => string;
  startup: string;
  enableStartup: string;
  disableStartup: string;
  comingSoon: string;
  unknown: string;
  windowFiveHoursShort: string;
  windowSevenDaysShort: string;
  windowFiveHours: string;
  windowSevenDays: string;
  minuteWindow: (value: number) => string;
  hourWindow: (value: number) => string;
};

const STORAGE_KEY = "codex-usage-ball-settings";
const SETTINGS_CHANGED_EVENT = "codex-usage-ball-settings-changed";
const LOW_NOTICE_STATE_KEY = "codex-usage-ball-low-notice-state";
const DRAG_START_THRESHOLD_PX = 5;
const BALL_CLICK_REFRESH_DELAY_MS = 220;
const BALL_CONTEXT_MENU_WIDTH = 104;
const BALL_CONTEXT_MENU_HEIGHT = 78;
const DEFAULT_RATE_LIMIT_ID = "__default__";

const copy: Record<Language, Copy> = {
  "zh-CN": {
    appAria: "Codex 用量悬浮球",
    appEyebrow: "Codex 用量",
    appTitle: "剩余额度",
    ballLabel: "剩余",
    openMainPanel: "显示主面板",
    hideMainPanel: "隐藏主面板",
    hideFloatingBall: "隐藏悬浮球",
    refresh: "刷新用量",
    readFailed: "读取 Codex 用量失败",
    shortFallback: "短期窗口",
    longFallback: "长期窗口",
    resetSuffix: "重置",
    plan: "计划",
    credits: "Credits",
    status: "状态",
    available: "可用",
    reached: "已受限",
    unlimited: "不限",
    limitsTitle: "模型用量桶",
    collapse: "收起",
    expand: "展开",
    loading: "正在刷新",
    waiting: "等待数据",
    updated: (time) => `${time} 更新`,
    settings: "偏好设置",
    exit: "退出程序",
    settingsTitle: "偏好设置",
    close: "关闭",
    language: "语言",
    chinese: "中文",
    english: "English",
    theme: "主题",
    themeSkin: "主题皮肤",
    activeRateLimitBucket: "模型用量桶",
    defaultRateLimitBucket: "默认桶(默认)",
    rateLimitBucketAria: "当前显示模型用量桶",
    showRateLimit: (selected) => (selected ? "正在展示" : "切换展示"),
    followSystem: "跟随系统",
    light: "亮色",
    dark: "暗色",
    refreshFrequency: "刷新频率",
    seconds: (value) => `${value} 秒`,
    lowNotice: "低额度通知",
    noticeThreshold: (value) => `低于 ${value}% 提醒`,
    noticeThresholdAria: "低额度提醒阈值",
    lowNoticeTitle: "Codex 低额度提醒",
    lowNoticeBody: (windowName, remaining, threshold) =>
      `${windowName}剩余额度 ${remaining}%，已低于 ${threshold}%`,
    startup: "开机自启",
    enableStartup: "开启",
    disableStartup: "关闭",
    comingSoon: "稍后接入",
    unknown: "未知",
    windowFiveHoursShort: "5小时",
    windowSevenDaysShort: "7天",
    windowFiveHours: "5 小时窗口",
    windowSevenDays: "7 天窗口",
    minuteWindow: (value) => `${value} 分钟窗口`,
    hourWindow: (value) => `${value} 小时窗口`,
  },
  "en-US": {
    appAria: "Codex usage ball",
    appEyebrow: "Codex Usage",
    appTitle: "Remaining Limits",
    ballLabel: "Left",
    openMainPanel: "Show main panel",
    hideMainPanel: "Hide main panel",
    hideFloatingBall: "Hide ball",
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
    settings: "Preferences",
    exit: "Exit app",
    settingsTitle: "Preferences",
    close: "Close",
    language: "Language",
    chinese: "中文",
    english: "English",
    theme: "Theme",
    themeSkin: "Skin",
    activeRateLimitBucket: "Rate limit bucket",
    defaultRateLimitBucket: "Default bucket",
    rateLimitBucketAria: "Rate limit bucket",
    showRateLimit: (selected) => (selected ? "Showing" : "Switch"),
    followSystem: "System",
    light: "Light",
    dark: "Dark",
    refreshFrequency: "Refresh rate",
    seconds: (value) => `${value}s`,
    lowNotice: "Low-limit alert",
    noticeThreshold: (value) => `Alert below ${value}%`,
    noticeThresholdAria: "Low-limit alert threshold",
    lowNoticeTitle: "Codex low-limit alert",
    lowNoticeBody: (windowName, remaining, threshold) =>
      `${windowName} has ${remaining}% remaining, below ${threshold}%`,
    startup: "Launch at login",
    enableStartup: "On",
    disableStartup: "Off",
    comingSoon: "Coming later",
    unknown: "Unknown",
    windowFiveHoursShort: "5h",
    windowSevenDaysShort: "7d",
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
    codex_spark: {
      credits: null,
      limitId: "codex_spark",
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

function getWindowKind(): WindowKind {
  const windowKind = new URLSearchParams(window.location.search).get("window");
  if (windowKind === "ball" || windowKind === "settings") return windowKind;
  return "main";
}

function isTauriRuntime() {
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function readSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;

    return normalizeAppSettings(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
}

function persistSettings(settings: AppSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAppSettings(settings)));
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function remainingPercent(windowData: RateLimitWindow | null) {
  if (!windowData) return null;
  return 100 - clampPercent(windowData.usedPercent);
}

function limitName(limit: RateLimitSnapshot | null, text: Copy) {
  return limit?.limitName || limit?.limitId || text.defaultRateLimitBucket;
}

function resolveActiveLimit(
  usage: RateLimitsResponse | null,
  activeRateLimitId: string,
) {
  if (!usage) return null;
  if (
    activeRateLimitId &&
    activeRateLimitId !== DEFAULT_RATE_LIMIT_ID &&
    usage.rateLimitsByLimitId?.[activeRateLimitId]
  ) {
    return usage.rateLimitsByLimitId[activeRateLimitId];
  }

  return usage.rateLimits;
}

function resolveRateLimitBucketOptions(
  usage: RateLimitsResponse | null,
  text: Copy,
) {
  const options: RateLimitBucketOption[] = [
    { id: DEFAULT_RATE_LIMIT_ID, name: text.defaultRateLimitBucket },
  ];

  if (!usage?.rateLimitsByLimitId) return options;

  for (const [limitId, limit] of Object.entries(usage.rateLimitsByLimitId)) {
    if (limitId === DEFAULT_RATE_LIMIT_ID) continue;
    if (!limit) continue;
    options.push({
      id: limitId,
      name: limitName(limit, text),
    });
  }

  return options;
}

function readLowNoticeState(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(LOW_NOTICE_STATE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === true),
    ) as Record<string, true>;
  } catch {
    return {};
  }
}

function writeLowNoticeState(state: Record<string, true>) {
  if (Object.keys(state).length === 0) {
    window.localStorage.removeItem(LOW_NOTICE_STATE_KEY);
    return;
  }

  window.localStorage.setItem(LOW_NOTICE_STATE_KEY, JSON.stringify(state));
}

function lowNoticeStateKey(windowKey: LowNoticeWindowKey, threshold: number) {
  return `${windowKey}:${threshold}`;
}

function clearLowNoticeWindowState(state: Record<string, true>, windowKey: LowNoticeWindowKey) {
  const prefix = `${windowKey}:`;
  let changed = false;
  const next = { ...state };

  for (const key of Object.keys(next)) {
    if (key.startsWith(prefix)) {
      delete next[key];
      changed = true;
    }
  }

  return { changed, next };
}

async function sendLowLimitNotification(
  windowName: string,
  remaining: number,
  threshold: number,
  text: Copy,
) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }

    if (!granted) return;

    sendNotification({
      title: text.lowNoticeTitle,
      body: text.lowNoticeBody(windowName, remaining, threshold),
    });
  } catch (err) {
    console.error("发送低额度通知失败", err);
  }
}

function maybeNotifyLowLimit({
  remaining,
  text,
  threshold,
  windowKey,
  windowName,
}: {
  remaining: number | null;
  text: Copy;
  threshold: number;
  windowKey: LowNoticeWindowKey;
  windowName: string;
}) {
  if (remaining === null) return;

  const state = readLowNoticeState();
  if (remaining >= threshold) {
    const { changed, next } = clearLowNoticeWindowState(state, windowKey);
    if (changed) writeLowNoticeState(next);
    return;
  }

  if (!isTauriRuntime()) return;

  const key = lowNoticeStateKey(windowKey, threshold);
  if (state[key]) return;

  writeLowNoticeState({ ...state, [key]: true });
  void sendLowLimitNotification(windowName, remaining, threshold, text);
}

function useLowLimitNotifications(
  activeLimit: RateLimitSnapshot | null,
  settings: AppSettings,
  text: Copy,
) {
  useEffect(() => {
    if (!activeLimit) return;

    const threshold = settings.lowNoticeThreshold;
    maybeNotifyLowLimit({
      remaining: remainingPercent(activeLimit.primary),
      text,
      threshold,
      windowKey: "fiveHour",
      windowName: text.windowFiveHours,
    });
    maybeNotifyLowLimit({
      remaining: remainingPercent(activeLimit.secondary),
      text,
      threshold,
      windowKey: "sevenDay",
      windowName: text.windowSevenDays,
    });
  }, [activeLimit, settings.lowNoticeThreshold, text]);
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

function formatBallPercent(percent: number | null) {
  return percent === null ? "--" : `${percent}%`;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme {
  return mode === "system" ? systemTheme : mode;
}

function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(readSettings);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = normalizeAppSettings({ ...current, ...patch });
      persistSettings(next);
      return next;
    });
  }, []);

  const setLaunchAtLogin = useCallback(async (launchAtLogin: boolean) => {
    if (isTauriRuntime()) {
      if (launchAtLogin) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    }
    updateSettings({ launchAtLogin });
  }, [updateSettings]);

  useEffect(() => {
    const syncSettings = () => setSettings(readSettings());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncSettings();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncSettings);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, syncSettings);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemTheme(query.matches ? "dark" : "light");

    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    void isAutostartEnabled()
      .then((launchAtLogin) => {
        if (!disposed) updateSettings({ launchAtLogin });
      })
      .catch((err) => {
        console.error("同步开机自启状态失败", err);
      });

    return () => {
      disposed = true;
    };
  }, [updateSettings]);

  const resolvedTheme = resolveTheme(settings.themeMode, systemTheme);
  const text = copy[settings.language];

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = settings.language;
  }, [resolvedTheme, settings.language]);

  return { settings, updateSettings, setLaunchAtLogin, resolvedTheme, text };
}

function useUsageData(refreshIntervalSec: 30 | 60) {
  const [usage, setUsage] = useState<RateLimitsResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const usageRequestRef = useRef<Promise<void> | null>(null);

  const loadUsage = useCallback(async () => {
    if (usageRequestRef.current) {
      return usageRequestRef.current;
    }

    const request = (async () => {
      setState((current) => (current === "loading" ? current : "loading"));
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
    })();

    usageRequestRef.current = request;
    request.finally(() => {
      if (usageRequestRef.current === request) {
        usageRequestRef.current = null;
      }
    });

    return request;
  }, []);

  useEffect(() => {
    void loadUsage();
    const timer = window.setInterval(() => {
      void loadUsage();
    }, refreshIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [loadUsage, refreshIntervalSec]);

  return { usage, state, error, lastUpdatedAt, loadUsage };
}

function startWindowDrag(event: PointerEvent<HTMLElement>) {
  if (event.button !== 0) return;

  if (
    event.target instanceof Element &&
    event.target.closest("button, a, input, select, textarea, [data-no-window-drag]")
  ) {
    return;
  }

  void getCurrentWindow().startDragging();
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

function ChoiceButton<T extends string | number | boolean>({
  active,
  children,
  onClick,
  value,
}: {
  active: boolean;
  children: ReactNode;
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

function SkinPreview({ active }: { active: boolean }) {
  return (
    <span className={`skin-preview${active ? " skin-preview-active" : ""}`} aria-hidden="true">
      <span className="skin-preview-ball">
        <span />
      </span>
      <span className="skin-preview-panel">
        <span />
        <span />
      </span>
    </span>
  );
}

function SkinButton({
  active,
  description,
  label,
  onClick,
  previewClassName,
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
  previewClassName: string;
}) {
  return (
    <button
      className={`skin-button ${previewClassName}${active ? " skin-button-active" : ""}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      <SkinPreview active={active} />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function SettingsFields({
  settings,
  text,
  updateSettings,
  setLaunchAtLogin,
}: {
  settings: AppSettings;
  text: Copy;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
}) {
  return (
    <section className="settings-fields">
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
        <span>
          <Clock3 size={15} />
          {text.refreshFrequency}
        </span>
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

      <div className="setting-row inline-setting">
        <span>{text.lowNotice}</span>
        <div className="threshold-control">
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={settings.lowNoticeThreshold}
            aria-label={text.noticeThresholdAria}
            onChange={(event) =>
              updateSettings({
                lowNoticeThreshold: normalizeLowNoticeThreshold(Number(event.currentTarget.value)),
              })
            }
          />
          <em>{text.noticeThreshold(settings.lowNoticeThreshold)}</em>
        </div>
      </div>

      <div className="setting-row inline-setting">
        <span>{text.startup}</span>
        <div className="segmented">
          <ChoiceButton
            active={settings.launchAtLogin}
            onClick={(launchAtLogin: boolean) => void setLaunchAtLogin(launchAtLogin)}
            value={true}
          >
            {text.enableStartup}
          </ChoiceButton>
          <ChoiceButton
            active={!settings.launchAtLogin}
            onClick={(launchAtLogin: boolean) => void setLaunchAtLogin(launchAtLogin)}
            value={false}
          >
            {text.disableStartup}
          </ChoiceButton>
        </div>
      </div>

      <div className="setting-row">
        <span>
          <MonitorCog size={15} />
          {text.themeSkin}
        </span>
        <div className="skin-grid">
          {skinOptions.map((skin) => (
            <SkinButton
              active={settings.skin === skin.id}
              description={skin.description[settings.language]}
              key={skin.id}
              label={skin.label[settings.language]}
              onClick={() => updateSettings({ skin: skin.id })}
              previewClassName={skin.previewClassName}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BallView() {
  const { settings, resolvedTheme, text } = useAppSettings();
  const { usage, loadUsage } = useUsageData(settings.refreshIntervalSec);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    dragging: boolean;
    pointerId: number;
    scaleFactor: number;
    windowX: number;
    windowY: number;
    ready: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const clickRefreshTimerRef = useRef<number | null>(null);
  const activeLimit = resolveActiveLimit(usage, settings.activeRateLimitId);
  useLowLimitNotifications(activeLimit, settings, text);
  const primaryRemaining = remainingPercent(activeLimit?.primary ?? null);
  const secondaryRemaining = remainingPercent(activeLimit?.secondary ?? null);
  const primaryTone = getTone(primaryRemaining);
  const secondaryTone = getTone(secondaryRemaining);
  const primaryPercentText = formatBallPercent(primaryRemaining);
  const secondaryPercentText = formatBallPercent(secondaryRemaining);
  const ballStyle = {
    "--ball-primary-progress": `${primaryRemaining ?? 0}`,
    "--ball-secondary-progress": `${secondaryRemaining ?? 0}`,
  } as CSSProperties;
  const ballTitle = `${limitName(activeLimit, text)}：${text.windowFiveHoursShort} ${primaryPercentText} ${text.windowSevenDaysShort} ${secondaryPercentText}`;

  const clearClickRefreshTimer = useCallback(() => {
    if (clickRefreshTimerRef.current === null) return;
    window.clearTimeout(clickRefreshTimerRef.current);
    clickRefreshTimerRef.current = null;
  }, []);

  useEffect(() => clearClickRefreshTimer, [clearClickRefreshTimer]);

  const resetDragState = useCallback((event?: PointerEvent<HTMLButtonElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, []);

  const handleBallPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    setContextMenu(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = false;
    dragStartRef.current = {
      x: event.screenX,
      y: event.screenY,
      dragging: false,
      pointerId: event.pointerId,
      scaleFactor: window.devicePixelRatio || 1,
      windowX: 0,
      windowY: 0,
      ready: false,
    };

    const appWindow = getCurrentWindow();
    void Promise.all([appWindow.outerPosition(), appWindow.scaleFactor()])
      .then(([position, scaleFactor]) => {
        const start = dragStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        start.windowX = position.x;
        start.windowY = position.y;
        start.scaleFactor = scaleFactor;
        start.ready = true;
      })
      .catch(() => {
        resetDragState(event);
      });
  }, [resetDragState]);

  const handleBallPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start) return;

    const distance = Math.hypot(event.screenX - start.x, event.screenY - start.y);
    if (!start.dragging && distance < DRAG_START_THRESHOLD_PX) return;
    if (!start.ready) return;

    start.dragging = true;
    suppressClickRef.current = true;
    const nextX = Math.round(start.windowX + (event.screenX - start.x) * start.scaleFactor);
    const nextY = Math.round(start.windowY + (event.screenY - start.y) * start.scaleFactor);
    void getCurrentWindow().setPosition(new PhysicalPosition(nextX, nextY));
  }, [resetDragState]);

  const handleBallClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      return;
    }
    setContextMenu(null);
    clearClickRefreshTimer();
    clickRefreshTimerRef.current = window.setTimeout(() => {
      clickRefreshTimerRef.current = null;
      void loadUsage();
    }, BALL_CLICK_REFRESH_DELAY_MS);
  }, [clearClickRefreshTimer, loadUsage]);

  const handleBallDoubleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearClickRefreshTimer();
    setContextMenu(null);
    void invoke("show_main_panel");
  }, [clearClickRefreshTimer]);

  const handleBallContextMenu = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearClickRefreshTimer();
    suppressClickRef.current = true;
    const maxX = Math.max(4, window.innerWidth - BALL_CONTEXT_MENU_WIDTH - 4);
    const maxY = Math.max(4, window.innerHeight - BALL_CONTEXT_MENU_HEIGHT - 4);
    setContextMenu({
      x: Math.min(Math.max(4, event.clientX), maxX),
      y: Math.min(Math.max(4, event.clientY), maxY),
    });
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [clearClickRefreshTimer]);

  const hideFloatingBall = useCallback(() => {
    setContextMenu(null);
    void invoke("hide_ball_window");
  }, []);

  const exitFromBallMenu = useCallback(() => {
    setContextMenu(null);
    void invoke("exit_app");
  }, []);

  return (
    <main className="ball-shell" data-skin={settings.skin} data-theme={resolvedTheme}>
      <button
        className={`usage-ball compact-ball usage-ball-${primaryTone} usage-ball-secondary-${secondaryTone}`}
        type="button"
        aria-label={text.refresh}
        title={ballTitle}
        style={ballStyle}
        onClick={handleBallClick}
        onContextMenu={handleBallContextMenu}
        onDoubleClick={handleBallDoubleClick}
        onPointerCancel={resetDragState}
        onPointerDown={handleBallPointerDown}
        onPointerMove={handleBallPointerMove}
        onPointerUp={resetDragState}
      >
        <svg className="ball-ring-outer" viewBox="0 0 112 112" aria-hidden="true">
          <circle className="ball-ring-track" cx="56" cy="56" r="50" pathLength="100" />
          <circle className="ball-ring-progress" cx="56" cy="56" r="50" pathLength="100" />
        </svg>
        <span className="ball-core">
          <span className="ball-window-label">{text.windowFiveHoursShort}</span>
          <span className="ball-primary-value">{primaryPercentText}</span>
        </span>
        <span className="ball-secondary-card" aria-label={`${text.windowSevenDaysShort} ${secondaryPercentText}`}>
          <svg className="ball-ring-inner" viewBox="0 0 44 44" aria-hidden="true">
            <circle className="ball-ring-secondary-track" cx="22" cy="22" r="18" pathLength="100" />
            <circle className="ball-ring-secondary-progress" cx="22" cy="22" r="18" pathLength="100" />
          </svg>
          <span className="ball-secondary-label">{text.windowSevenDaysShort}</span>
          <span className="ball-secondary-value">{secondaryPercentText}</span>
        </span>
      </button>
      {contextMenu ? (
        <div
          className="ball-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" role="menuitem" onClick={hideFloatingBall}>
            {text.hideFloatingBall}
          </button>
          <button type="button" role="menuitem" onClick={exitFromBallMenu}>
            {text.exit}
          </button>
        </div>
      ) : null}
    </main>
  );
}

function MainPanelView() {
  const { settings, resolvedTheme, text, updateSettings } = useAppSettings();
  const { usage, state, error, lastUpdatedAt, loadUsage } = useUsageData(settings.refreshIntervalSec);
  const [showLimits, setShowLimits] = useState(true);

  const activeLimit = resolveActiveLimit(usage, settings.activeRateLimitId);
  useLowLimitNotifications(activeLimit, settings, text);
  const rateLimitBuckets = useMemo(() => {
    return resolveRateLimitBucketOptions(usage, text)
      .map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        limit:
          bucket.id === DEFAULT_RATE_LIMIT_ID
            ? usage?.rateLimits ?? null
            : usage?.rateLimitsByLimitId?.[bucket.id] ?? null,
      }))
      .filter((bucket) => Boolean(bucket.limit));
  }, [usage, text]);
  const hasMultipleBucketOptions = (usage?.rateLimitsByLimitId
    ? Object.keys(usage.rateLimitsByLimitId).length
    : 0) > 1;
  const canSwitchRateLimit = rateLimitBuckets.length > 1 && hasMultipleBucketOptions;

  const primaryRemaining = remainingPercent(activeLimit?.primary ?? null);
  const primaryTone = getTone(primaryRemaining);
  const activeBucketName = limitName(activeLimit, text);

  return (
    <main className="app-shell" data-skin={settings.skin} data-theme={resolvedTheme}>
      <section className="panel main-panel" aria-label={text.appAria}>
        <header
          className="panel-header draggable-header"
          onPointerDown={startWindowDrag}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div data-tauri-drag-region>
            <p className="eyebrow">{text.appEyebrow}</p>
            <h1>{text.appTitle}</h1>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              type="button"
              aria-label={text.refresh}
              title={text.refresh}
              onClick={loadUsage}
            >
              <RefreshCcw size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={text.settings}
              title={text.settings}
              onClick={() => void invoke("show_settings_window")}
            >
              <Settings size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={text.hideMainPanel}
              title={text.hideMainPanel}
              onClick={() => void invoke("hide_main_panel")}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <section className={`headline headline-${primaryTone}`}>
          <span>{activeBucketName}</span>
          <strong>{primaryRemaining === null ? "--" : `${primaryRemaining}%`}</strong>
        </section>

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
              {rateLimitBuckets.map((bucket) => {
                const remain = remainingPercent(bucket.limit?.primary ?? null);
                const selected = settings.activeRateLimitId === bucket.id;
                return (
                  <div className="limit-row" key={bucket.id}>
                    <span>{bucket.name}</span>
                    {canSwitchRateLimit ? (
                      <button
                        className={`rate-limit-switch${selected ? " rate-limit-switch-selected" : ""}`}
                        type="button"
                        disabled={selected}
                        onClick={() => {
                          if (!selected) {
                            updateSettings({ activeRateLimitId: bucket.id });
                          }
                        }}
                      >
                        {text.showRateLimit(selected)}
                      </button>
                    ) : null}
                    <strong>{remain === null ? "--" : `${remain}%`}</strong>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <footer>
          <span>
            {state === "loading"
              ? text.loading
              : lastUpdatedAt
                ? text.updated(formatTime(lastUpdatedAt, settings.language))
                : text.waiting}
          </span>
          <div className="footer-actions">
            <button
              className="exit-button"
              type="button"
              aria-label={text.exit}
              title={text.exit}
              onClick={() => void invoke("exit_app")}
            >
              <Power size={16} />
              <span>{text.exit}</span>
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

function SettingsView() {
  const { settings, updateSettings, setLaunchAtLogin, resolvedTheme, text } = useAppSettings();

  return (
    <main className="settings-shell" data-skin={settings.skin} data-theme={resolvedTheme}>
      <section className="settings-panel">
        <header
          className="settings-header draggable-header"
          onPointerDown={startWindowDrag}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div data-tauri-drag-region>
            <p className="eyebrow">{text.appEyebrow}</p>
            <h1>{text.settingsTitle}</h1>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={text.close}
            title={text.close}
            onClick={() => void invoke("hide_settings_window")}
          >
            <X size={18} />
          </button>
        </header>

        <SettingsFields
          settings={settings}
          text={text}
          updateSettings={updateSettings}
          setLaunchAtLogin={setLaunchAtLogin}
        />
      </section>
    </main>
  );
}

function App() {
  const windowKind = getWindowKind();
  if (windowKind === "ball") return <BallView />;
  if (windowKind === "settings") return <SettingsView />;
  return <MainPanelView />;
}

export default App;
