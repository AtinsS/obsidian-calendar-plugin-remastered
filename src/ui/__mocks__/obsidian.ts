export class TFile {}
export class PluginSettingTab {}
export class Modal {}
export class Notice {}
export function normalizePath(): string {
  return "";
}

// Minimal mock implementations used by tests
export class TFolder {
  path = "";
  children: Array<TFolder | TFile> = [];
  constructor(path?: string) {
    if (path) this.path = path;
  }
}

export class App {
  vault: any;
  constructor() {
    this.vault = {
      getRoot: () => new TFolder("") as any,
    };
  }
}

export class SuggestModal<T> {
  app: any;
  constructor(app?: any) {
    this.app = app;
  }
  setPlaceholder(_: string) { /* noop */ }
  open() { /* noop */ }
  close() { /* noop */ }
  // Methods expected by subclasses
  getSuggestions(_query: string): T[] {
    return [] as T[];
  }
  renderSuggestion(_suggestion: T, _el: HTMLElement) { /* noop */ }
  onChooseSuggestion(_suggestion: T) { /* noop */ }
}
