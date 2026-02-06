import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCodexMode } from "../lib/config.js";
import type { PluginConfig } from "../lib/types.js";

describe("Plugin Configuration", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CODEX_MODE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CODEX_MODE;
    } else {
      process.env.CODEX_MODE = originalEnv;
    }
  });

  describe("getCodexMode", () => {
    it("should return true by default", () => {
      delete process.env.CODEX_MODE;
      const config: PluginConfig = {};

      const result = getCodexMode(config);

      expect(result).toBe(true);
    });

    it("should use config value when env var not set", () => {
      delete process.env.CODEX_MODE;
      const config: PluginConfig = { codexMode: false };

      const result = getCodexMode(config);

      expect(result).toBe(false);
    });

    it("should prioritize env var CODEX_MODE=1 over config", () => {
      process.env.CODEX_MODE = "1";
      const config: PluginConfig = { codexMode: false };

      const result = getCodexMode(config);

      expect(result).toBe(true);
    });

    it("should prioritize env var CODEX_MODE=0 over config", () => {
      process.env.CODEX_MODE = "0";
      const config: PluginConfig = { codexMode: true };

      const result = getCodexMode(config);

      expect(result).toBe(false);
    });

    it("should handle env var with any value other than '1' as false", () => {
      process.env.CODEX_MODE = "false";
      const config: PluginConfig = { codexMode: true };

      const result = getCodexMode(config);

      expect(result).toBe(false);
    });

    it("should use config codexMode=true when explicitly set", () => {
      delete process.env.CODEX_MODE;
      const config: PluginConfig = { codexMode: true };

      const result = getCodexMode(config);

      expect(result).toBe(true);
    });
  });

  describe("Priority order", () => {
    it("should follow priority: env var > config file > default", () => {
      // Test 1: env var overrides config
      process.env.CODEX_MODE = "0";
      expect(getCodexMode({ codexMode: true })).toBe(false);

      // Test 2: config overrides default
      delete process.env.CODEX_MODE;
      expect(getCodexMode({ codexMode: false })).toBe(false);

      // Test 3: default when neither set
      expect(getCodexMode({})).toBe(true);
    });
  });
});
