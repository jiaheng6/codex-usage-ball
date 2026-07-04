import type { Language, SkinName } from "./settings";

export type SkinOption = {
  id: SkinName;
  label: Record<Language, string>;
  description: Record<Language, string>;
  previewClassName: string;
};

export const skinOptions: SkinOption[] = [
  {
    id: "glass",
    label: { "zh-CN": "清透玻璃", "en-US": "Glass" },
    description: { "zh-CN": "轻盈玻璃和凸起圆环", "en-US": "Light glass and raised rings" },
    previewClassName: "skin-preview-glass",
  },
  {
    id: "dashboard",
    label: { "zh-CN": "夜间仪表", "en-US": "Night Gauge" },
    description: { "zh-CN": "深色仪表盘和发光刻度", "en-US": "Dark gauges with glow" },
    previewClassName: "skin-preview-dashboard",
  },
  {
    id: "minimal",
    label: { "zh-CN": "极简办公", "en-US": "Minimal Office" },
    description: { "zh-CN": "干净卡片和低干扰边框", "en-US": "Clean cards and quiet borders" },
    previewClassName: "skin-preview-minimal",
  },
  {
    id: "terminal",
    label: { "zh-CN": "终端绿", "en-US": "Terminal Green" },
    description: { "zh-CN": "黑色终端和霓虹绿", "en-US": "Black terminal and neon green" },
    previewClassName: "skin-preview-terminal",
  },
  {
    id: "sea",
    label: { "zh-CN": "海盐蓝绿", "en-US": "Sea Teal" },
    description: { "zh-CN": "柔和蓝绿和半透明层次", "en-US": "Soft teal translucent layers" },
    previewClassName: "skin-preview-sea",
  },
  {
    id: "contrast",
    label: { "zh-CN": "高对比彩色", "en-US": "High Contrast" },
    description: { "zh-CN": "强轮廓和高辨识色块", "en-US": "Bold outlines and clear color" },
    previewClassName: "skin-preview-contrast",
  },
];
