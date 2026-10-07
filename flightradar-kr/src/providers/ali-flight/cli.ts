import { execFile } from "node:child_process";
import { ProviderUnavailableError } from "../types";
import type { FlyaiFlightResponse } from "./types";

type ExecFileFn = (
  file: string,
  args: string[],
  opts: { timeout: number; maxBuffer: number; signal?: AbortSignal },
  cb: (err: (Error & { code?: string | number }) | null, stdout: string, stderr: string) => void,
) => unknown;

export interface FlyaiCliOptions {
  /** Path/name of the official CLI binary (`npm i -g @fly-ai/flyai-cli`). */
  binary: string;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Injectable for tests. */
  execFileImpl?: ExecFileFn;
}

/**
 * Runs the official FlyAI CLI: `flyai search-flight …` and parses its
 * single-line JSON stdout. No shell is involved (argument array only).
 */
export function runFlyaiCli(args: string[], opts: FlyaiCliOptions): Promise<FlyaiFlightResponse> {
  const exec = (opts.execFileImpl ?? (execFile as unknown as ExecFileFn));
  return new Promise((resolve, reject) => {
    exec(opts.binary, args, { timeout: opts.timeoutMs, maxBuffer: 8 * 1024 * 1024, signal: opts.signal }, (err, stdout) => {
      if (err) {
        if (err.code === "ENOENT") {
          return reject(new ProviderUnavailableError("ali-flight", "unavailable", "flyai CLI가 설치되어 있지 않습니다 (npm i -g @fly-ai/flyai-cli)"));
        }
        return reject(new Error("flyai CLI failed"));
      }
      let parsed: FlyaiFlightResponse;
      try {
        parsed = JSON.parse(stdout) as FlyaiFlightResponse;
      } catch {
        return reject(new Error("flyai CLI returned non-JSON output"));
      }
      if (parsed.status !== undefined && parsed.status !== 0) return reject(new Error(`flyai returned status ${parsed.status}`));
      resolve(parsed);
    });
  });
}
