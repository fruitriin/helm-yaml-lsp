import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { SymbolMapping } from '@/types/rendering';

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cache', 'helm-yaml-lsp');

type ChecksumEntry = {
  file: string;
  mtimeMs: number;
  size: number;
};

/**
 * Persistent file cache for SymbolMapping data.
 * Uses mtime-based checksums for invalidation.
 */
export class FileCache {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
  }

  /**
   * Generate a hash key from chartDir + templatePath
   */
  private hashKey(chartDir: string, templatePath: string): string {
    return crypto
      .createHash('sha256')
      .update(`${chartDir}::${templatePath}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Get the cache directory for a specific key
   */
  private getCacheDir(key: string): string {
    return path.join(this.cacheDir, key);
  }

  /**
   * Save a SymbolMapping to disk
   */
  async save(chartDir: string, templatePath: string, mapping: SymbolMapping): Promise<void> {
    const key = this.hashKey(chartDir, templatePath);
    const dir = this.getCacheDir(key);

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'mapping.json'), JSON.stringify(mapping));

      // Save checksums for source files
      const checksums = await this.computeChecksums(chartDir, templatePath);
      fs.writeFileSync(path.join(dir, 'checksums.json'), JSON.stringify(checksums));
    } catch {
      // Cache save failures are non-critical
    }
  }

  /**
   * Load a SymbolMapping from disk if valid
   */
  async load(chartDir: string, templatePath: string): Promise<SymbolMapping | null> {
    const key = this.hashKey(chartDir, templatePath);
    const dir = this.getCacheDir(key);
    const mappingPath = path.join(dir, 'mapping.json');
    const checksumPath = path.join(dir, 'checksums.json');

    try {
      if (!fs.existsSync(mappingPath) || !fs.existsSync(checksumPath)) {
        return null;
      }

      // Validate checksums
      const savedChecksums: ChecksumEntry[] = JSON.parse(fs.readFileSync(checksumPath, 'utf-8'));
      const currentChecksums = await this.computeChecksums(chartDir, templatePath);

      if (!this.checksumsMatch(savedChecksums, currentChecksums)) {
        // Stale cache - remove
        this.removeDir(dir);
        return null;
      }

      return JSON.parse(fs.readFileSync(mappingPath, 'utf-8')) as SymbolMapping;
    } catch {
      return null;
    }
  }

  /**
   * Invalidate cache entries matching a chartDir prefix
   */
  invalidate(chartDir: string, templatePath?: string): void {
    if (templatePath) {
      const key = this.hashKey(chartDir, templatePath);
      this.removeDir(this.getCacheDir(key));
    } else {
      // Remove all entries for this chartDir by scanning
      try {
        if (!fs.existsSync(this.cacheDir)) return;
        for (const entry of fs.readdirSync(this.cacheDir)) {
          const dir = path.join(this.cacheDir, entry);
          const checksumPath = path.join(dir, 'checksums.json');
          try {
            if (fs.existsSync(checksumPath)) {
              const checksums: ChecksumEntry[] = JSON.parse(fs.readFileSync(checksumPath, 'utf-8'));
              if (checksums.some(c => c.file.startsWith(chartDir))) {
                this.removeDir(dir);
              }
            }
          } catch {
            // Ignore individual entry errors
          }
        }
      } catch {
        // Ignore scan errors
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.removeDir(this.cacheDir);
  }

  /**
   * Compute checksums for relevant files
   */
  private async computeChecksums(chartDir: string, templatePath: string): Promise<ChecksumEntry[]> {
    const files = [
      path.join(chartDir, templatePath),
      path.join(chartDir, 'values.yaml'),
      path.join(chartDir, 'Chart.yaml'),
    ];

    const checksums: ChecksumEntry[] = [];
    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        checksums.push({
          file,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {
        // File doesn't exist - include with zero values
        checksums.push({ file, mtimeMs: 0, size: 0 });
      }
    }
    return checksums;
  }

  /**
   * Check if two checksum arrays match
   */
  private checksumsMatch(saved: ChecksumEntry[], current: ChecksumEntry[]): boolean {
    if (saved.length !== current.length) return false;
    for (let i = 0; i < saved.length; i++) {
      if (saved[i].file !== current[i].file) return false;
      if (saved[i].mtimeMs !== current[i].mtimeMs) return false;
      if (saved[i].size !== current[i].size) return false;
    }
    return true;
  }

  /**
   * Safely remove a directory
   */
  private removeDir(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore removal errors
    }
  }
}
