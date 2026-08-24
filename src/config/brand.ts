export const APP_NAME = "MaiAI Switch";

export const WEBSITE_URL = "https://maiai.ai/";

// Keep source and release links separate from the public product website.
export const PROJECT_URL = "https://gitee.com/timimai/mai-ai-switch";
export const RELEASES_URL = `${PROJECT_URL}/releases`;

// The updater is hosted separately from the source mirror so Tauri can read
// its signed latest.json metadata when a release pipeline is enabled.
export const UPDATE_METADATA_URL =
  "https://github.com/1814603398-lab/mai-ai-switch-build/releases/latest/download/latest.json";
