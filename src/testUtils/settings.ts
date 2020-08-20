import type { ISettings } from "src/settings";
import type { ILocaleOverride } from "obsidian-calendar-ui";

export function getDefaultSettings(
  overrides: Partial<ISettings> = {}
): ISettings {
  return Object.assign(
    {},
    {
      shouldConfirmBeforeCreate: false,
      wordsPerDot: 50,
      showWeeklyNote: false,
      weeklyNoteFolder: "",
      weeklyNoteFormat: "",
      weeklyNoteTemplate: "",
      localeOverride: "default" as ILocaleOverride,
    },
    overrides
  ) as ISettings;
}
