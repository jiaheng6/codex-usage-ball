export type Language = "zh-CN" | "en-US";
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export type AppSettings = {
  language: Language;
  themeMode: ThemeMode;
  refreshIntervalSec: 30 | 60;
  launchAtLogin: boolean;
};

export const defaultSettings: AppSettings = {
  language: "zh-CN",
  themeMode: "system",
  refreshIntervalSec: 60,
  launchAtLogin: false,
};

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
  };
}
