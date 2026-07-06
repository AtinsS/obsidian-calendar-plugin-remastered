const moment = require("moment");

// Mock window.moment for tests
window.moment = moment;

// Mock Obsidian Notice
jest.mock("obsidian", () => ({
  Notice: class Notice {
    constructor() {}
  },
  Modal: class Modal {
    constructor() {}
    open() {}
    close() {}
  },
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {
    constructor() {}
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addDropdown() { return this; }
    addTextArea() { return this; }
  },
  TFile: class TFile {},
  normalizePath: () => "",
}));
