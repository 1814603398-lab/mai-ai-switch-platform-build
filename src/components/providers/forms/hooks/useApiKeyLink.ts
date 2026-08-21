import { useMemo } from "react";
import type { AppId } from "@/lib/api";
import type { ProviderCategory } from "@/types";
import type { ProviderPreset } from "@/config/claudeProviderPresets";
import type { CodexProviderPreset } from "@/config/codexProviderPresets";
import type { GeminiProviderPreset } from "@/config/geminiProviderPresets";
import type { OpenCodeProviderPreset } from "@/config/opencodeProviderPresets";
import type { ClaudeDesktopProviderPreset } from "@/config/claudeDesktopProviderPresets";
import { isCommercialPartnerPreset } from "@/config/presetVisibility";

type PresetEntry = {
  id: string;
  preset:
    | ProviderPreset
    | CodexProviderPreset
    | GeminiProviderPreset
    | OpenCodeProviderPreset
    | ClaudeDesktopProviderPreset;
};

interface UseApiKeyLinkProps {
  appId: AppId;
  category?: ProviderCategory;
  selectedPresetId: string | null;
  presetEntries: PresetEntry[];
  formWebsiteUrl: string;
}

/**
 * 管理 API Key 获取链接的显示和 URL
 */
export function useApiKeyLink({
  appId,
  category,
  selectedPresetId,
  presetEntries,
  formWebsiteUrl,
}: UseApiKeyLinkProps) {
  // 获取当前预设条目
  const currentPresetEntry = useMemo(() => {
    if (selectedPresetId && selectedPresetId !== "custom") {
      return presetEntries.find((item) => item.id === selectedPresetId);
    }
    return undefined;
  }, [selectedPresetId, presetEntries]);

  const isCommercialPreset = useMemo(
    () =>
      currentPresetEntry
        ? isCommercialPartnerPreset(currentPresetEntry.preset)
        : false,
    [currentPresetEntry],
  );

  // 判断是否显示 API Key 获取链接。合作伙伴预设即使从旧配置中恢复，
  // 也不再展示带推广属性的入口。
  const shouldShowApiKeyLink = useMemo(() => {
    return (
      !isCommercialPreset &&
      category !== "official" &&
      (category === "cn_official" ||
        category === "aggregator" ||
        category === "third_party")
    );
  }, [category, isCommercialPreset]);

  // 获取当前供应商的网址（用于 API Key 链接）
  const getWebsiteUrl = useMemo(() => {
    if (currentPresetEntry) {
      const preset = currentPresetEntry.preset;
      return preset.websiteUrl || "";
    }
    return formWebsiteUrl || "";
  }, [currentPresetEntry, formWebsiteUrl]);

  // 提取合作伙伴信息
  const isPartner = useMemo(() => {
    return currentPresetEntry?.preset.isPartner ?? false;
  }, [currentPresetEntry]);

  const partnerPromotionKey = useMemo(() => {
    return currentPresetEntry?.preset.partnerPromotionKey;
  }, [currentPresetEntry]);

  return {
    shouldShowApiKeyLink:
      appId === "claude" ||
      appId === "claude-desktop" ||
      appId === "codex" ||
      appId === "gemini" ||
      appId === "opencode" ||
      appId === "openclaw" ||
      appId === "hermes"
        ? shouldShowApiKeyLink
        : false,
    websiteUrl: getWebsiteUrl,
    isPartner,
    partnerPromotionKey,
  };
}
