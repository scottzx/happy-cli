import { pathToFileURL } from 'url';
import { logger } from '@/ui/logger';

/**
 * Context handed to an external RPC adapter module. Generic, downstream-agnostic —
 * it only exposes the primitives an integration needs to register extra
 * machine-scoped RPC handlers (registration + the machine's server/token/crypto).
 */
export interface RpcAdapterContext {
    /** Register a handler on the machine-scoped RPC manager (scope prefix is added automatically). */
    registerHandler: (method: string, handler: (params: any) => Promise<any>) => void;
    /** Happy server (relay) base URL. */
    serverUrl: string;
    /** This machine's bearer token. */
    token: string;
    /** Encrypt a value with the machine key and return base64. */
    encrypt: (body: unknown) => string;
    /** Decrypt a base64 value with the machine key. */
    decrypt: (b64: string) => unknown | null;
    /** Optional file logger (reuses the CLI's logger so adapters don't pollute stdout). */
    log?: (msg: string, ...args: unknown[]) => void;
}

/**
 * Generic extension point. Loads an external module (path from
 * `HAPPY_RPC_ADAPTER_ENTRY`) and calls its `register(ctx)` so downstream
 * integrations keep their app-specific RPC glue in their own repo — this CLI
 * stays free of downstream-specific code and can track upstream cleanly.
 *
 * The module must export `register(ctx)` (named or default). Failures are logged,
 * never thrown — a broken/missing adapter must not take the daemon down.
 */
export async function loadRpcAdapter(entry: string, ctx: RpcAdapterContext): Promise<void> {
    try {
        const mod = await import(pathToFileURL(entry).href);
        const register = (mod.register ?? mod.default?.register ?? mod.default) as
            | ((c: RpcAdapterContext) => void | Promise<void>)
            | undefined;
        if (typeof register !== 'function') {
            logger.debug(`[rpc-adapter] ${entry} has no register() export`);
            return;
        }
        await register(ctx);
        logger.debug(`[rpc-adapter] loaded ${entry}`);
    } catch (error) {
        logger.debug('[rpc-adapter] failed to load', entry, error);
    }
}
