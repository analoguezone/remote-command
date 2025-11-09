/**
 * Command Safety Classification
 *
 * Classifies commands based on their potential impact on the system.
 */

export type SafetyLevel = 'safe' | 'modify' | 'dangerous';

export interface CommandClassification {
  level: SafetyLevel;
  reason: string;
  command: string;
}

/**
 * Dangerous command patterns that can cause significant system changes
 */
const DANGEROUS_PATTERNS = [
  // Package management
  /\b(apt|apt-get|yum|dnf|pacman|zypper|brew)\s+(install|remove|purge|autoremove|upgrade|dist-upgrade)/,

  // System services
  /\b(systemctl|service|supervisorctl)\s+(start|stop|restart|reload|enable|disable|mask)/,

  // Docker dangerous operations
  /\b(docker)\s+(stop|kill|rm|restart|pause|unpause)\s/,
  /\b(docker-compose)\s+(down|stop|restart|kill)/,

  // Firewall
  /\b(ufw|iptables|firewalld|nft)\s+(enable|disable|allow|deny|delete|flush)/,

  // User management
  /\b(useradd|userdel|usermod|groupadd|groupdel|passwd)\b/,

  // Destructive file operations
  /\brm\s+(-rf|--recursive|--force|-r\s+-f|-f\s+-r)/,
  /\b(mkfs|fdisk|parted|dd)\b/,

  // System configuration
  /\b(shutdown|reboot|halt|poweroff|init)\b/,

  // Process killing
  /\bkill\s+-9/,
  /\bkillall\b/,

  // Cron/scheduled tasks
  /\bcrontab\s+-[re]/,

  // Network configuration
  /\b(ifconfig|ip)\s+(addr|link|route)\s+(add|del|delete)/,
];

/**
 * Modify command patterns that change files but are less dangerous
 */
const MODIFY_PATTERNS = [
  // File operations
  /\b(touch|mkdir|cp|mv|ln)\b/,

  // Permissions
  /\b(chmod|chown|chgrp)\b/,

  // Text editing
  /\b(echo|cat|tee)\s+.*>>/,  // Append is safer
  /\b(sed|awk)\s+-i/,  // In-place editing

  // Archive operations
  /\b(tar|zip|unzip|gzip|gunzip)\b/,
];

/**
 * Commands that are explicitly safe (read-only)
 */
const SAFE_PATTERNS = [
  /^(ls|ll|dir)\b/,
  /^(cat|less|more|head|tail|grep|egrep|fgrep)\b/,
  /^(find|locate|which|whereis|type)\b/,
  /^(ps|top|htop|free|df|du|uptime|w|who)\b/,
  /^(netstat|ss|ip\s+addr|ifconfig|ping|traceroute|nslookup|dig)\b/,
  /^(uname|hostname|date|cal|history)\b/,
  /^(git\s+(status|log|diff|show|branch))\b/,
  /^(docker\s+(ps|images|logs|inspect))\b/,
  /^(systemctl\s+(status|list-units|is-active|is-enabled))\b/,
  /^(journalctl|dmesg)\b/,
  /^(env|printenv|export)\b/,
  /^(pwd|cd)\b/,
  /^(echo|printf)\s+[^>]/, // echo without redirection
];

/**
 * Classify a command based on its safety level
 */
export function classifyCommand(command: string): CommandClassification {
  const trimmed = command.trim();

  // Empty command
  if (!trimmed) {
    return {
      level: 'safe',
      reason: 'Empty command',
      command: trimmed
    };
  }

  // Check for pipes and command chaining
  const hasMultipleCommands = /[;&|]/.test(trimmed);

  // Split by pipes/chains for analysis
  const commandParts = trimmed.split(/[;&|]+/).map(p => p.trim());

  // Check each part
  let maxLevel: SafetyLevel = 'safe';
  let reasons: string[] = [];

  for (const part of commandParts) {
    // Check dangerous patterns first
    let foundDangerous = false;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(part)) {
        maxLevel = 'dangerous';
        reasons.push(`Contains dangerous operation: ${pattern.toString()}`);
        foundDangerous = true;
        break;
      }
    }

    if (foundDangerous) continue;

    // Check modify patterns (only if not already dangerous)
    if (maxLevel !== 'dangerous') {
      for (const pattern of MODIFY_PATTERNS) {
        if (pattern.test(part)) {
          if (maxLevel === 'safe') {
            maxLevel = 'modify';
          }
          reasons.push(`Contains modify operation: ${pattern.toString()}`);
          break;
        }
      }
    }

    // Check for output redirection (potentially dangerous)
    if (/>\s*[^>]/.test(part)) {  // Single > (overwrite)
      if (maxLevel !== 'dangerous') {
        maxLevel = 'modify';
        reasons.push('Contains output redirection (overwrite)');
      }
    }
  }

  // If we found dangerous or modify patterns, return that level
  if (maxLevel !== 'safe') {
    return {
      level: maxLevel,
      reason: reasons.join('; '),
      command: trimmed
    };
  }

  // Check if explicitly safe
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        level: 'safe',
        reason: 'Read-only command',
        command: trimmed
      };
    }
  }

  // Unknown command - treat as modify to be safe
  return {
    level: 'modify',
    reason: 'Unknown command - classified as modify for safety',
    command: trimmed
  };
}

/**
 * Generate a random approval challenge code
 */
export function generateChallengeCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Pending approval storage
 */
export interface PendingApproval {
  id: string;
  command: string;
  classification: CommandClassification;
  challenge: string;
  timestamp: number;
  expiresAt: number;
}

export class ApprovalManager {
  private approvals: Map<string, PendingApproval> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired approvals every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Create a pending approval
   */
  createApproval(command: string, classification: CommandClassification): PendingApproval {
    const id = Math.random().toString(36).substring(2, 15);
    const challenge = generateChallengeCode();
    const timestamp = Date.now();
    const expiresAt = timestamp + 60000; // 60 seconds

    const approval: PendingApproval = {
      id,
      command,
      classification,
      challenge,
      timestamp,
      expiresAt
    };

    this.approvals.set(id, approval);
    return approval;
  }

  /**
   * Verify and consume an approval
   */
  verifyApproval(id: string, challenge: string): PendingApproval | null {
    const approval = this.approvals.get(id);

    if (!approval) {
      return null;
    }

    // Check if expired
    if (Date.now() > approval.expiresAt) {
      this.approvals.delete(id);
      return null;
    }

    // Check challenge code
    if (approval.challenge !== challenge.toUpperCase()) {
      return null;
    }

    // Valid approval - consume it
    this.approvals.delete(id);
    return approval;
  }

  /**
   * Get approval info without consuming it
   */
  getApproval(id: string): PendingApproval | null {
    const approval = this.approvals.get(id);

    if (!approval) {
      return null;
    }

    // Check if expired
    if (Date.now() > approval.expiresAt) {
      this.approvals.delete(id);
      return null;
    }

    return approval;
  }

  /**
   * Clean up expired approvals
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, approval] of this.approvals.entries()) {
      if (now > approval.expiresAt) {
        this.approvals.delete(id);
      }
    }
  }

  /**
   * Cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
