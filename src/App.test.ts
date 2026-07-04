// @ts-expect-error 测试环境使用 Node 内置模块读取源码文件，应用构建不依赖 Node 类型。
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import appSource from "./App.tsx?raw";

const appStyles = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const rustSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
) as {
  app: {
    windows: Array<{
      height: number;
      label: string;
      width: number;
    }>;
  };
};

function cssBlocks(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...appStyles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))].map(
    (match) => match[1],
  );
}

function cssBlock(selector: string, marker?: string) {
  const blocks = cssBlocks(selector);
  return marker ? blocks.find((block) => block.includes(marker)) ?? "" : blocks[0] ?? "";
}

describe("悬浮球刷新状态", () => {
  test("悬浮球不渲染正在刷新提示", () => {
    expect(appSource).not.toContain("ball-loading");
  });

  test("悬浮球不保留正在刷新提示样式", () => {
    expect(appStyles).not.toContain(".ball-loading");
  });
});

describe("悬浮球交互", () => {
  test("单击刷新，双击打开主面板", () => {
    expect(appSource).toContain("const { usage, loadUsage } = useUsageData");
    expect(appSource).toContain("const handleBallDoubleClick");
    expect(appSource).toContain("onDoubleClick={handleBallDoubleClick}");
    expect(appSource).toContain('invoke("show_main_panel")');
    expect(appSource).toContain("BALL_CLICK_REFRESH_DELAY_MS");
  });

  test("右键显示自定义菜单，包含隐藏悬浮球和退出程序", () => {
    expect(appSource).toContain("const handleBallContextMenu");
    expect(appSource).toContain("onContextMenu={handleBallContextMenu}");
    expect(appSource).toContain("ball-context-menu");
    expect(appSource).toContain('invoke("hide_ball_window")');
    expect(appSource).toContain('invoke("exit_app")');
  });

  test("后端注册隐藏悬浮球命令", () => {
    expect(rustSource).toContain("fn hide_ball_window");
    expect(rustSource).toContain("hide_ball_window(app: AppHandle)");
    expect(rustSource).toContain("hide_ball_window,");
  });
});

describe("面板拖拽", () => {
  test("主面板和设置面板标题栏启动窗口拖拽", () => {
    expect(appSource).toContain("function startWindowDrag");
    expect(appSource).toContain("startDragging()");
    expect((appSource.match(/onMouseDown=\{startWindowDrag\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(appStyles).toContain(".draggable-header");
  });
});

describe("低额度通知", () => {
  test("设置面板提供 1 到 100 的低额度提醒阈值输入", () => {
    expect(appSource).toContain("lowNoticeThreshold");
    expect(appSource).toContain('type="number"');
    expect(appSource).toContain("min={1}");
    expect(appSource).toContain("max={100}");
    expect(appSource).toContain("value={settings.lowNoticeThreshold}");
  });

  test("5 小时和 7 天窗口都会触发一次性系统通知", () => {
    expect(appSource).toContain("LOW_NOTICE_STATE_KEY");
    expect(appSource).toContain("sendNotification");
    expect(appSource).toContain("isPermissionGranted");
    expect(appSource).toContain("requestPermission");
    expect(appSource).toContain("text.windowFiveHours");
    expect(appSource).toContain("text.windowSevenDays");
    expect((appSource.match(/useLowLimitNotifications\(activeLimit, settings, text\);/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("后端注册系统通知插件", () => {
    expect(rustSource).toContain("tauri_plugin_notification::init()");
  });
});

describe("窗口视觉和滚动容器", () => {
  test("设置面板不覆盖成直角", () => {
    expect(appStyles).not.toMatch(/\.settings-panel\s*\{[^}]*border-radius:\s*0\b/s);
  });

  test("设置窗口由面板内部滚动", () => {
    expect(cssBlock(".settings-shell", "display: grid")).toContain("height: 100vh");

    const settingsPanelBlock = cssBlock(".settings-panel", "width: 100%");
    expect(settingsPanelBlock).toContain("height: 100vh");
    expect(settingsPanelBlock).toContain("overflow-y: auto");
  });

  test("设置面板隐藏滚动条但保留滚动能力", () => {
    const settingsPanelBlock = cssBlock(".settings-panel", "width: 100%");
    const webkitScrollbarBlock = cssBlock(".settings-panel::-webkit-scrollbar");

    expect(settingsPanelBlock).toContain("overflow-y: auto");
    expect(settingsPanelBlock).toContain("scrollbar-width: none");
    expect(settingsPanelBlock).toContain("-ms-overflow-style: none");
    expect(webkitScrollbarBlock).toContain("display: none");
  });

  test("悬浮球不使用额外外圈边框伪元素", () => {
    expect(appStyles).not.toContain(".compact-ball::before");
  });

  test("5 小时中心区域不使用边框", () => {
    expect(cssBlock(".ball-core")).not.toMatch(/\bborder\s*:/);
  });

  test("悬浮球窗口为下方阴影预留空间", () => {
    const ballWindow = tauriConfig.app.windows.find((window) => window.label === "ball");

    expect(ballWindow?.width).toBe(112);
    expect(ballWindow?.height).toBeGreaterThan(112);
  });
});
