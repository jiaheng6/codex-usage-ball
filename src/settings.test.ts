import { describe, expect, it } from "vitest";
import { normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("使用默认值归一化主题相关配置", () => {
    expect(normalizeAppSettings({ language: "zh-CN", themeMode: "light" })).toMatchObject({
      language: "zh-CN",
      themeMode: "light",
      launchAtLogin: false,
      skin: "glass",
      activeRateLimitId: "__default__",
    });
  });

  it("保留用户开启的开机启动配置", () => {
    expect(normalizeAppSettings({ launchAtLogin: true })).toMatchObject({
      launchAtLogin: true,
    });
  });

  it("保留用户可用皮肤配置", () => {
    expect(normalizeAppSettings({ skin: "terminal" })).toMatchObject({
      skin: "terminal",
    });
  });

  it("非法皮肤配置回退为默认值", () => {
    expect(normalizeAppSettings({ skin: "unknown" })).toMatchObject({
      skin: "glass",
    });
  });

  it("低额度提醒阈值默认是 15", () => {
    expect(normalizeAppSettings({})).toMatchObject({
      lowNoticeThreshold: 15,
    });
  });

  it("允许 1-100 的阈值设置", () => {
    expect(normalizeAppSettings({ lowNoticeThreshold: 42 })).toMatchObject({
      lowNoticeThreshold: 42,
    });
  });

  it("低于 1 或高于 100 都会被限制边界", () => {
    expect(normalizeAppSettings({ lowNoticeThreshold: 0 })).toMatchObject({
      lowNoticeThreshold: 1,
    });
    expect(normalizeAppSettings({ lowNoticeThreshold: 101 })).toMatchObject({
      lowNoticeThreshold: 100,
    });
    expect(normalizeAppSettings({ lowNoticeThreshold: "15" })).toMatchObject({
      lowNoticeThreshold: 15,
    });
  });

  it("保留有效的额度桶设置值", () => {
    expect(normalizeAppSettings({ activeRateLimitId: "codex_spark" })).toMatchObject({
      activeRateLimitId: "codex_spark",
    });
  });

  it("非法额度桶设置回退为默认值", () => {
    expect(normalizeAppSettings({ activeRateLimitId: 123 as unknown })).toMatchObject({
      activeRateLimitId: "__default__",
    });
  });

  it("缺省时使用默认额度桶", () => {
    expect(normalizeAppSettings({})).toMatchObject({
      activeRateLimitId: "__default__",
    });
  });
});
