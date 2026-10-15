export const projectRoot: string;
export function requireCompatibleNode(version?: string): void;
export function localPort(value?: string): number;
export function localEnvironment(root: string, inherited?: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv;
export function prepareConfiguration(root?: string): Promise<string>;
export function installIfNeeded(root?: string): Promise<void>;
export function assertPortAvailable(port?: number): Promise<void>;
export function run(command: string, args: string[], options?: import('node:child_process').SpawnOptions): Promise<void>;
export function main(action?: string): Promise<void>;
