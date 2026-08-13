import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir, existsSync } from 'fs/promises';
import { join, dirname } from 'path';

const execAsync = promisify(exec);

export interface ExecutionResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
  workingDirectory: string;
  timestamp: number;
}

export interface ExecutionContext {
  workingDirectory: string;
  timeout?: number;
}

export interface ScriptGeneration {
  filename: string;
  content: string;
  language: string;
  executeCommand?: string;
}

export class ExecutionEngine {
  private static instance: ExecutionEngine | null = null;
  private history: any[] = [];

  private constructor() {}

  static getInstance() {
    if (!ExecutionEngine.instance) {
      ExecutionEngine.instance = new ExecutionEngine();
    }
    return ExecutionEngine.instance;
  }

  async executeCommand(command: string, context: ExecutionContext = { workingDirectory: process.cwd() }) {
    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.workingDirectory,
        timeout: context.timeout || 30000,
        maxBuffer: 1024 * 1024,
      });
      const result = {
        success: true,
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - startTime,
        command,
        workingDirectory: context.workingDirectory,
        timestamp: Date.now(),
      };
      this.history.push(result);
      console.log(`[KRONOS_EXEC] OK: ${command}`);
      return result;
    } catch (error: any) {
      const result = {
        success: false,
        exitCode: error.exitCode ?? -1,
        stdout: error.stdout?.trim() || '',
        stderr: error.message || 'Unknown error',
        duration: Date.now() - startTime,
        command,
        workingDirectory: context.workingDirectory,
        timestamp: Date.now(),
      };
      this.history.push(result);
      console.error(`[KRONOS_ERROR] ${command}: ${result.stderr}`);
      return result;
    }
  }

  async executeScript(script: ScriptGeneration) {
    const scriptPath = join(process.cwd(), script.filename);
    try {
      await writeFile(scriptPath, script.content, 'utf-8');
      console.log(`[KRONOS_EXEC] Script saved: ${scriptPath}`);
      const command = script.executeCommand || (script.language === 'python' ? 'python' : 'node');
      return await this.executeCommand(`${command} ${script.filename}`);
    } catch (error: any) {
      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: `Failed to save/execute: ${error.message}`,
        duration: 0,
        command: script.filename,
        workingDirectory: process.cwd(),
        timestamp: Date.now(),
      };
    }
  }

  async readFile(path: string) {
    try {
      const content = await readFile(path, 'utf-8');
      return { success: true, content };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async writeFile(path: string, content: string) {
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(path, content, 'utf-8');
      console.log(`[KRONOS_SUCCESS] File saved: ${path}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getHistory() {
    return this.history;
  }

  getSuccessRate() {
    if (this.history.length === 0) return 0;
    return this.history.filter(r => r.success).length / this.history.length;
  }
}

export const executionEngine = ExecutionEngine.getInstance();
console.log('[ExecutionEngine] Initialized');
