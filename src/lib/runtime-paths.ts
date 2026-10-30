import fs from 'fs';
import os from 'os';
import path from 'path';

let resolvedDataDir: string | null = null;

/**
 * Resolves a writable data directory across both local/server environments (`./data`)
 * and read-only serverless runtimes such as Vercel / AWS Lambda (`/tmp/frimin-data`).
 */
export function getWritableDataDir(): string {
  if (resolvedDataDir) return resolvedDataDir;

  if (process.env.FRIMIN_DATA_DIR) {
    fs.mkdirSync(process.env.FRIMIN_DATA_DIR, { recursive: true });
    resolvedDataDir = process.env.FRIMIN_DATA_DIR;
    return resolvedDataDir;
  }

  const isServerless = Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.NETLIFY
  );

  if (!isServerless) {
    const localDir = path.join(process.cwd(), 'data');
    try {
      fs.mkdirSync(localDir, { recursive: true });
      const probe = path.join(localDir, `.write-probe-${process.pid}`);
      fs.writeFileSync(probe, 'ok', 'utf8');
      fs.unlinkSync(probe);
      resolvedDataDir = localDir;
      return resolvedDataDir;
    } catch {
      // Read-only filesystem (EROFS / EACCES) -> fall through to os.tmpdir()
    }
  }

  const tmpDir = path.join(os.tmpdir(), 'frimin-data');
  fs.mkdirSync(tmpDir, { recursive: true });
  resolvedDataDir = tmpDir;
  return resolvedDataDir;
}
