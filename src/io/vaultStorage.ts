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
