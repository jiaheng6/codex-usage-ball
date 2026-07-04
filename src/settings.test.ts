import { describe, expect, it } from "vitest";
import { normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("旧设置没有开机自启字段时默认关闭", () => {
    expect(normalizeAppSettings({ language: "zh-CN", themeMode: "light" })).toMatchObject({
      language: "zh-CN",
      themeMode: "light",
      launchAtLogin: false,
    });
  });

  it("保留用户已开启的开机自启设置", () => {
    expect(normalizeAppSettings({ launchAtLogin: true })).toMatchObject({
      launchAtLogin: true,
    });
  });
});
