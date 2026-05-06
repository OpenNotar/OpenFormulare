import { spawnSync } from 'child_process';
import path from 'path';

function resolveBackendPath(relativePath: string): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === 'backend') {
    return path.resolve(cwd, relativePath);
  }

  return path.resolve(cwd, 'backend', relativePath);
}

export function runYoyoMigrations(databasePath: string) {
  const scriptPath = resolveBackendPath('scripts/run_yoyo.py');
  const migrationsDir = resolveBackendPath('migrations');

  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const result = spawnSync(pythonBin, [scriptPath], {
    env: {
      ...process.env,
      SQLITE_PATH: databasePath,
      YOYO_MIGRATIONS_DIR: migrationsDir,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `yoyo migration failed: ${result.stderr || result.stdout || 'unknown error'}`,
    );
  }
}
