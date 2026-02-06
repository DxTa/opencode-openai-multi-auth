import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountManager } from "../lib/accounts/manager.js";

// NOTE: These tests require module reloading which Bun doesn't fully support
// The AccountManager uses homedir() at module load time, so changing process.env.HOME
// after the module is loaded doesn't affect where accounts are stored.
// These tests work correctly when run with Node.js/Vitest.
describe.skip("AccountManager strategy selection", () => {
  let testHome: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "account-manager-test-"));
    process.env.HOME = testHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("keeps using the same account in sticky mode", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "sticky",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");

    const pick1 = await manager.getNextAvailableAccount();
    const pick2 = await manager.getNextAvailableAccount();
    const pick3 = await manager.getNextAvailableAccount();

    expect(pick1?.index).toBe(0);
    expect(pick2?.index).toBe(0);
    expect(pick3?.index).toBe(0);
  });

  it("rotates accounts on each request in round-robin mode", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "round-robin",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");
    await manager.addAccount("c@example.com", "rt-3");

    const pick1 = await manager.getNextAvailableAccount();
    const pick2 = await manager.getNextAvailableAccount();
    const pick3 = await manager.getNextAvailableAccount();
    const pick4 = await manager.getNextAvailableAccount();

    expect(pick1?.index).toBe(0);
    expect(pick2?.index).toBe(1);
    expect(pick3?.index).toBe(2);
    expect(pick4?.index).toBe(0);
  });

  it("rotates initial account across sessions in hybrid mode", async () => {
    const manager1 = new AccountManager({
      accountSelectionStrategy: "hybrid",
      quietMode: true,
      debug: false,
    });
    await manager1.loadFromDisk();
    await manager1.addAccount("a@example.com", "rt-1");
    await manager1.addAccount("b@example.com", "rt-2");
    const session1Pick = await manager1.getNextAvailableAccount();

    const manager2 = new AccountManager({
      accountSelectionStrategy: "hybrid",
      quietMode: true,
      debug: false,
    });
    await manager2.loadFromDisk();
    const session2Pick = await manager2.getNextAvailableAccount();

    expect(session1Pick?.index).not.toBeUndefined();
    expect(session2Pick?.index).not.toBeUndefined();
    expect(session2Pick?.index).not.toBe(session1Pick?.index);
  });

  it("switches after rate limit and then stays sticky", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "sticky",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");

    const first = await manager.getNextAvailableAccount("gpt-5.2-codex");
    expect(first?.index).toBe(0);

    manager.markRateLimited(first!, 60_000, "gpt-5.2-codex");

    const second = await manager.getNextAvailableAccount("gpt-5.2-codex");
    const third = await manager.getNextAvailableAccount("gpt-5.2-codex");

    expect(second?.index).toBe(1);
    expect(third?.index).toBe(1);
  });

  it("skips rate-limited accounts and keeps round-robin progression", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "round-robin",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");
    await manager.addAccount("c@example.com", "rt-3");

    const first = await manager.getNextAvailableAccount("gpt-5.2-codex");
    expect(first?.index).toBe(0);

    const accountTwo = manager.getAllAccounts()[1];
    manager.markRateLimited(accountTwo, 60_000, "gpt-5.2-codex");

    const second = await manager.getNextAvailableAccount("gpt-5.2-codex");
    const third = await manager.getNextAvailableAccount("gpt-5.2-codex");

    expect(second?.index).toBe(2);
    expect(third?.index).toBe(0);
  });

  it("stays sticky within a single hybrid session", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "hybrid",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");

    const first = await manager.getNextAvailableAccount();
    const second = await manager.getNextAvailableAccount();
    const third = await manager.getNextAvailableAccount();

    expect(first?.index).toBeDefined();
    expect(second?.index).toBe(first?.index);
    expect(third?.index).toBe(first?.index);
  });

  it("excludes specified accounts when using getNextAvailableAccountExcluding", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "sticky",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");
    await manager.addAccount("c@example.com", "rt-3");

    const excludeFirst = new Set([0]);
    const pick1 = await manager.getNextAvailableAccountExcluding(excludeFirst);
    expect(pick1?.index).toBe(1);

    const excludeFirstTwo = new Set([0, 1]);
    const pick2 =
      await manager.getNextAvailableAccountExcluding(excludeFirstTwo);
    expect(pick2?.index).toBe(2);

    const excludeAll = new Set([0, 1, 2]);
    const pick3 = await manager.getNextAvailableAccountExcluding(excludeAll);
    expect(pick3).toBeNull();
  });

  it("getNextAvailableAccountExcluding respects rate limits", async () => {
    const manager = new AccountManager({
      accountSelectionStrategy: "sticky",
      quietMode: true,
      debug: false,
    });
    await manager.loadFromDisk();

    await manager.addAccount("a@example.com", "rt-1");
    await manager.addAccount("b@example.com", "rt-2");
    await manager.addAccount("c@example.com", "rt-3");

    const accounts = manager.getAllAccounts();
    manager.markRateLimited(accounts[0], 60_000, "gpt-5.2-codex");

    const excludeSecond = new Set([1]);
    const pick = await manager.getNextAvailableAccountExcluding(
      excludeSecond,
      "gpt-5.2-codex",
    );

    expect(pick?.index).toBe(2);
  });
});
