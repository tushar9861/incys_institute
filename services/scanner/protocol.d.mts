export const MAX_UPLOAD: number;
export function clamCommand(command: string, bytes?: Buffer, options?: { host?: string; port?: number; timeout?: number }): Promise<string>;
export function freshSignatures(version: string, now?: number): boolean;
