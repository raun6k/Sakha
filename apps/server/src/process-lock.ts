import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { z } from "zod";
export function lockDatabase(path: string) {
  const lock = `${path}.lock`;
  function claim() {
    const descriptor = openSync(lock, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
    closeSync(descriptor);
  }
  try {
    claim();
  } catch (error) {
    if (!existsSync(lock)) throw error;
    let pid: number;
    try {
      pid = z
        .object({ pid: z.number().int().positive() })
        .parse(JSON.parse(readFileSync(lock, "utf8"))).pid;
    } catch {
      throw new Error(
        "Database lock is invalid; preserve it and inspect the running process before removing it",
      );
    }
    let running = true;
    try {
      process.kill(pid, 0);
    } catch (failure) {
      if (
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "ESRCH"
      )
        running = false;
    }
    if (running)
      throw new Error("Sakha is already running against this database");
    unlinkSync(lock);
    claim();
  }
  return () => {
    if (existsSync(lock)) {
      const owner = z
        .object({ pid: z.number() })
        .parse(JSON.parse(readFileSync(lock, "utf8")));
      if (owner.pid === process.pid) unlinkSync(lock);
    }
  };
}
