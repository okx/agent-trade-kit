/**
 * Tests for TP/SL amend discoverability (#151).
 *
 * Verifies that MCP tool descriptions contain the routing hints that guide
 * AI agents and users toward the correct path for modifying attached TP/SL orders:
 *   get_algo_orders → amend_algo_order
 *
 * These tests prevent regressions where description changes silently remove
 * the cross-reference guidance.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allToolSpecs } from "../src/tools/index.js";

function getDescriptionByName(name: string): string {
  const specs = allToolSpecs();
  const spec = specs.find((s) => s.name === name);
  assert.ok(spec, `Tool spec '${name}' not found`);
  return spec.description;
}

describe("TP/SL amend discoverability — MCP tool descriptions", () => {
  describe("regular amend tools: must route users to algo amend for TP/SL", () => {
    it("spot_amend_order description references spot_amend_algo_order", () => {
      const desc = getDescriptionByName("spot_amend_order");
      assert.ok(
        desc.includes("spot_amend_algo_order"),
        `Expected spot_amend_order description to mention spot_amend_algo_order.\nGot: "${desc}"`,
      );
    });

    it("spot_amend_order description references spot_get_algo_orders", () => {
      const desc = getDescriptionByName("spot_amend_order");
      assert.ok(
        desc.includes("spot_get_algo_orders"),
        `Expected spot_amend_order description to mention spot_get_algo_orders.\nGot: "${desc}"`,
      );
    });

    it("spot_amend_order description references swap_amend_algo_order to prevent swap user confusion", () => {
      const desc = getDescriptionByName("spot_amend_order");
      assert.ok(
        desc.includes("swap_amend_algo_order"),
        `Expected spot_amend_order description to mention swap_amend_algo_order (swap users may reach this tool via CLI).\nGot: "${desc}"`,
      );
    });

    it("futures_amend_order description references futures_amend_algo_order", () => {
      const desc = getDescriptionByName("futures_amend_order");
      assert.ok(
        desc.includes("futures_amend_algo_order"),
        `Expected futures_amend_order description to mention futures_amend_algo_order.\nGot: "${desc}"`,
      );
    });

    it("futures_amend_order description references futures_get_algo_orders", () => {
      const desc = getDescriptionByName("futures_amend_order");
      assert.ok(
        desc.includes("futures_get_algo_orders"),
        `Expected futures_amend_order description to mention futures_get_algo_orders.\nGot: "${desc}"`,
      );
    });

    it("option_amend_order description references option_amend_algo_order", () => {
      const desc = getDescriptionByName("option_amend_order");
      assert.ok(
        desc.includes("option_amend_algo_order"),
        `Expected option_amend_order description to mention option_amend_algo_order.\nGot: "${desc}"`,
      );
    });

    it("option_amend_order description references option_get_algo_orders", () => {
      const desc = getDescriptionByName("option_amend_order");
      assert.ok(
        desc.includes("option_get_algo_orders"),
        `Expected option_amend_order description to mention option_get_algo_orders.\nGot: "${desc}"`,
      );
    });
  });

  describe("algo amend tools: must mention attached TP/SL coverage", () => {
    it("spot_amend_algo_order description mentions attached TP/SL", () => {
      const desc = getDescriptionByName("spot_amend_algo_order");
      assert.ok(
        desc.includes("TP/SL orders attached"),
        `Expected spot_amend_algo_order description to mention 'TP/SL orders attached'.\nGot: "${desc}"`,
      );
    });

    it("spot_amend_algo_order description references spot_get_algo_orders for algoId lookup", () => {
      const desc = getDescriptionByName("spot_amend_algo_order");
      assert.ok(
        desc.includes("spot_get_algo_orders"),
        `Expected spot_amend_algo_order description to mention spot_get_algo_orders.\nGot: "${desc}"`,
      );
    });

    it("swap_amend_algo_order description mentions attached TP/SL", () => {
      const desc = getDescriptionByName("swap_amend_algo_order");
      assert.ok(
        desc.includes("TP/SL orders attached"),
        `Expected swap_amend_algo_order description to mention 'TP/SL orders attached'.\nGot: "${desc}"`,
      );
    });

    it("swap_amend_algo_order description references swap_get_algo_orders for algoId lookup", () => {
      const desc = getDescriptionByName("swap_amend_algo_order");
      assert.ok(
        desc.includes("swap_get_algo_orders"),
        `Expected swap_amend_algo_order description to mention swap_get_algo_orders.\nGot: "${desc}"`,
      );
    });

    it("futures_amend_algo_order description mentions attached TP/SL", () => {
      const desc = getDescriptionByName("futures_amend_algo_order");
      assert.ok(
        desc.includes("TP/SL orders attached"),
        `Expected futures_amend_algo_order description to mention 'TP/SL orders attached'.\nGot: "${desc}"`,
      );
    });

    it("futures_amend_algo_order description references futures_get_algo_orders for algoId lookup", () => {
      const desc = getDescriptionByName("futures_amend_algo_order");
      assert.ok(
        desc.includes("futures_get_algo_orders"),
        `Expected futures_amend_algo_order description to mention futures_get_algo_orders.\nGot: "${desc}"`,
      );
    });

    it("option_amend_algo_order description mentions attached TP/SL", () => {
      const desc = getDescriptionByName("option_amend_algo_order");
      assert.ok(
        desc.includes("TP/SL orders attached"),
        `Expected option_amend_algo_order description to mention 'TP/SL orders attached'.\nGot: "${desc}"`,
      );
    });

    it("option_amend_algo_order description references option_get_algo_orders for algoId lookup", () => {
      const desc = getDescriptionByName("option_amend_algo_order");
      assert.ok(
        desc.includes("option_get_algo_orders"),
        `Expected option_amend_algo_order description to mention option_get_algo_orders.\nGot: "${desc}"`,
      );
    });
  });
});
