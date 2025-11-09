/**
 * Configuration management
 */

import * as fs from 'fs';
import * as path from 'path';
import { RemoteConfig, RemoteHost, SSHOptions } from '../types.js';
import { logger } from './logger.js';

export class ConfigManager {
  private config: RemoteConfig | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
  }

  /**
   * Get default config path
   */
  private getDefaultConfigPath(): string {
    // Try ./config/remotes.json first
    const localConfig = path.join(process.cwd(), 'config', 'remotes.json');
    if (fs.existsSync(localConfig)) {
      return localConfig;
    }

    // Try ~/.remote-command/config.json
    const homeConfig = path.join(
      process.env.HOME || '~',
      '.remote-command',
      'config.json'
    );
    return homeConfig;
  }

  /**
   * Load configuration
   */
  load(): RemoteConfig {
    if (this.config) {
      return this.config;
    }

    if (!fs.existsSync(this.configPath)) {
      logger.warn(`Config file not found: ${this.configPath}`);
      this.config = {
        version: '1.0',
        remotes: {}
      };
      return this.config;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      logger.info(`Loaded config from ${this.configPath}`);
      return this.config!;
    } catch (err) {
      logger.error(`Failed to load config: ${err}`);
      throw new Error(`Failed to load config: ${err}`);
    }
  }

  /**
   * Get a remote host configuration
   */
  getRemote(name: string): RemoteHost | null {
    const config = this.load();
    return config.remotes[name] || null;
  }

  /**
   * List all configured remotes
   */
  listRemotes(): string[] {
    const config = this.load();
    return Object.keys(config.remotes);
  }

  /**
   * Parse host string (user@host or config name)
   */
  parseHost(hostString: string): SSHOptions {
    // Check if it's a config name
    const remote = this.getRemote(hostString);
    if (remote) {
      return {
        host: remote.host,
        username: remote.user,
        port: remote.port,
        identityFile: remote.identityFile
      };
    }

    // Parse user@host format
    const match = hostString.match(/^(?:(.+)@)?([^:]+)(?::(\d+))?$/);
    if (!match) {
      throw new Error(`Invalid host format: ${hostString}`);
    }

    const [, username, host, port] = match;

    // Default identity file
    const defaultIdentityFile = path.join(process.env.HOME || '~', '.ssh', 'id_rsa');

    return {
      host,
      username: username || process.env.USER || 'root',
      port: port ? parseInt(port, 10) : 22,
      identityFile: defaultIdentityFile
    };
  }

  /**
   * Save configuration
   */
  save(config: RemoteConfig): void {
    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    this.config = config;
    logger.info(`Config saved to ${this.configPath}`);
  }

  /**
   * Add a remote host
   */
  addRemote(name: string, remote: RemoteHost): void {
    const config = this.load();
    config.remotes[name] = remote;
    this.save(config);
  }

  /**
   * Remove a remote host
   */
  removeRemote(name: string): void {
    const config = this.load();
    delete config.remotes[name];
    this.save(config);
  }
}

export const config = new ConfigManager();
