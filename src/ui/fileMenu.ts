import { App, Menu, Point, TFile } from "obsidian";

export function showNoteContextMenu(app: App, file: TFile, position: Point): void {
  const fileMenu = new Menu(app);
  fileMenu.addItem((item) =>
    item
      .setTitle("Delete")
      .setIcon("trash")
      .onClick(() => {
        (app.fileManager as unknown as { promptForFileDeletion: (file: TFile) => void }).promptForFileDeletion(file);
      })
  );

  app.workspace.trigger(
    "file-menu",
    fileMenu,
    file,
    "calendar-context-menu",
    null
  );
  fileMenu.showAtPosition(position);
}
