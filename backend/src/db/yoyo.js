"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runYoyoMigrations = runYoyoMigrations;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
function resolveBackendPath(relativePath) {
    const cwd = process.cwd();
    if (path_1.default.basename(cwd) === 'backend') {
        return path_1.default.resolve(cwd, relativePath);
    }
    return path_1.default.resolve(cwd, 'backend', relativePath);
}
function runYoyoMigrations(databasePath) {
    const scriptPath = resolveBackendPath('scripts/run_yoyo.py');
    const migrationsDir = resolveBackendPath('migrations');
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const result = (0, child_process_1.spawnSync)(pythonBin, [scriptPath], {
        env: {
            ...process.env,
            SQLITE_PATH: databasePath,
            YOYO_MIGRATIONS_DIR: migrationsDir,
        },
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`yoyo migration failed: ${result.stderr || result.stdout || 'unknown error'}`);
    }
}
