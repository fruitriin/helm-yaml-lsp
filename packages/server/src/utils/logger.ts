/**
 * ロガーユーティリティ
 * "@/" エイリアスの使用例
 */

import type { ServerSettings } from '@/types';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LoggerConfig = {
  level: LogLevel;
  settings: ServerSettings;
};

export class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }

  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  debug(message: string): void {
    if (this.config.level === 'debug') {
      console.debug(`[DEBUG] ${message}`);
    }
  }
}
