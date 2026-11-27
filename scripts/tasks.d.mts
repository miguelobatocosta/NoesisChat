// Types for scripts/tasks.mjs (plain Node script, imported by the server's tests).
export declare const TASKS: { app: string; backup: string };
export declare function appTaskXml(opts: { root: string; user: string }): string;
export declare function backupTaskXml(opts: { root: string; user: string; start?: string }): string;
