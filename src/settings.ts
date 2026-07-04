export type Language = "zh-CN" | "en-US";
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type SkinName =
  | "glass"
  | "dashboard"
  | "minimal"
  | "terminal"
  | "sea"
  | "contrast";

export type AppSettings = {
  language: Language;
  themeMode: ThemeMode;
  refreshIntervalSec: 30 | 60;
  launchAtLogin: boolean;
  lowNoticeThreshold: number;
  skin: SkinName;
  activeRateLimitId: string;
};

export const defaultSettings: AppSettings = {
  language: "zh-CN",
  themeMode: "system",
  refreshIntervalSec: 60,
  launchAtLogin: false,
  lowNoticeThreshold: 15,
  skin: "glass",
  activeRateLimitId: "__default__",
};

export const skinNames = [
  "glass",
  "dashboard",
  "minimal",
  "terminal",
  "sea",
  "contrast",
] as const satisfies readonly SkinName[];

function normalizeSkin(value: unknown): SkinName {
  return skinNames.includes(value as SkinName) ? (value as SkinName) : defaultSettings.skin;
}

export function normalizeLowNoticeThreshold(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSettings.lowNoticeThreshold;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const parsed =
    value && typeof value === "object" ? (value as Partial<AppSettings>) : {};

  return {
    language: parsed.language === "en-US" ? "en-US" : "zh-CN",
    themeMode:
      parsed.themeMode === "light" || parsed.themeMode === "dark"
        ? parsed.themeMode
        : "system",
    refreshIntervalSec: parsed.refreshIntervalSec === 30 ? 30 : 60,
    launchAtLogin: parsed.launchAtLogin === true,
    lowNoticeThreshold: normalizeLowNoticeThreshold(parsed.lowNoticeThreshold),
    skin: normalizeSkin(parsed.skin),
    activeRateLimitId:
      typeof parsed.activeRateLimitId === "string" ? parsed.activeRateLimitId : defaultSettings.activeRateLimitId,
  };
}
