import { App, TFile, TAbstractFile } from "obsidian";

const VAULT_DATA_FILE = "calendar-data.json";

export interface VaultData {
  taskTracker?: Record<string, unknown>;
  habitTracker?: Record<string, unknown>;
  [key: string]: unknown;
}

function isTFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile;
}

// Write queue — serializes all read-modify-write cycles on calendar-data.json
// to prevent cross-module race conditions (task/habit/finance all write to the same file)
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(fn).catch((e) => {
    console.error("[vaultStorage] queued write failed:", e);
  });
  return writeQueue;
}

export async function loadVaultData(app: App): Promise<VaultData> {
  try {
    const file = app.vault.getAbstractFileByPath(VAULT_DATA_FILE);
    if (!isTFile(file)) {
      return {};
    }

    const content = await app.vault.read(file);
    return JSON.parse(content) as VaultData;
  } catch {
    return {};
  }
}

export async function saveVaultData(
  app: App,
  data: VaultData
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const file = app.vault.getAbstractFileByPath(VAULT_DATA_FILE);

  if (isTFile(file)) {
    await app.vault.modify(file, content);
  } else {
    await app.vault.create(VAULT_DATA_FILE, content);
  }
}

/**
 * Atomic read-modify-write for a single key in calendar-data.json.
 * Serializes through a queue so concurrent calls from different modules
 * don't overwrite each other's changes.
 */
export async function saveVaultKey(
  app: App,
  key: string,
  value: unknown
): Promise<void> {
  await enqueueWrite(async () => {
    const vaultData = await loadVaultData(app);
    vaultData[key] = value as Record<string, unknown>;
    await saveVaultData(app, vaultData);
  });
}

export interface NotificationSyncSettings {
  overdueCheckEnabled: boolean;
  ntfyTopic: string;
}

export async function saveNotificationSyncSettings(
  app: App,
  settings: NotificationSyncSettings
): Promise<void> {
  // Merge with existing notificationSync to preserve fields set by GitHub Actions
  // (e.g. lastSummarySent) that the plugin doesn't manage
  await enqueueWrite(async () => {
    const vaultData = await loadVaultData(app);
    const existing = (vaultData["notificationSync"] as Record<string, unknown>) || {};
    vaultData["notificationSync"] = { ...existing, ...settings };
    await saveVaultData(app, vaultData);
  });
}

/**
 * Sync notification settings to vault on plugin load.
 * This ensures calendar-data.json always has the latest settings
 * for GitHub Actions workflows.
 */
export async function syncNotificationSettingsOnLoad(app: App, options: {
  syncToVault: boolean;
  overdueCheckEnabled: boolean;
  ntfyTopic: string;
}): Promise<void> {
  if (!options.syncToVault) return;
  await saveNotificationSyncSettings(app, {
    overdueCheckEnabled: options.overdueCheckEnabled,
    ntfyTopic: options.ntfyTopic || "Calendar_Remastered",
  });
}
