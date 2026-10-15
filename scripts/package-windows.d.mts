export function distributable(path: string, mode?: string): boolean;
export function git(args: string[]): string;
export function packageWindows(destination?: string): Promise<{path:string;sha256:string;sourceCommit:string;selected:string[];info:string}>;
