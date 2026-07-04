import { describe, expect, it } from "vitest";
import { normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("旧设置没有开机自启字段时默认关闭", () => {
    expect(normalizeAppSettings({ language: "zh-CN", themeMode: "light" })).toMatchObject({
      language: "zh-CN",
      themeMode: "light",
      launchAtLogin: false,
      skin: "glass",
    });
  });

  it("保留用户已开启的开机自启设置", () => {
    expect(normalizeAppSettings({ launchAtLogin: true })).toMatchObject({
      launchAtLogin: true,
    });
  });

  it("保留用户选择的合法主题皮肤", () => {
    expect(normalizeAppSettings({ skin: "terminal" })).toMatchObject({
      skin: "terminal",
    });
  });

  it("非法主题皮肤会回退到清透玻璃", () => {
    expect(normalizeAppSettings({ skin: "unknown" })).toMatchObject({
      skin: "glass",
    });
  });

  it("低额度通知阈值默认是 15", () => {
    expect(normalizeAppSettings({})).toMatchObject({
      lowNoticeThreshold: 15,
    });
  });

  it("保留 1 到 100 范围内的低额度通知阈值", () => {
    expect(normalizeAppSettings({ lowNoticeThreshold: 42 })).toMatchObject({
      lowNoticeThreshold: 42,
    });
  });

  it("低额度通知阈值会限制在 1 到 100", () => {
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
});
