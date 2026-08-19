import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { AuditEvent, AuditTrail } from "../../../ports/outbound/audit-trail.js";
import { withFileLock } from "./_shared/file-lock.js";

export class FsAuditTrail implements AuditTrail {
  private readonly filePath: string;

  public constructor(homeDir: string = homedir()) {
    this.filePath = join(homeDir, ".arka-norn", "logs", "audit.jsonl");
  }

  public async append(event: AuditEvent): Promise<void> {
    await withFileLock(this.filePath, async () => {
      await fs.mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      const handle = await fs.open(this.filePath, "a", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify({
          schemaVersion: 1,
          occurredAt: event.occurredAt.toISOString(),
          action: event.action,
          entityType: event.entityType,
          ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
          ...(event.root === undefined ? {} : { root: event.root }),
          ...(event.details === undefined ? {} : { details: event.details }),
        })}\n`, "utf8");
        await handle.sync();
        await fs.chmod(this.filePath, 0o600);
      } finally {
        await handle.close();
      }
    });
  }
}
