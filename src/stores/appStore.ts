import { writable } from "svelte/store";
import type { App } from "obsidian";

export const app = writable<App | null>(null);
