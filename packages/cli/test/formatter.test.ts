import {afterEach, beforeEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import {markFailedIfSCodeError} from "../src/formatter.js";

describe("markFailedIfSCodeError", () => {
    let originalExitCode: number | undefined;

    beforeEach(() => {
        originalExitCode = process.exitCode as number | undefined;
        process.exitCode = 0;
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
    });

    describe("when data is not an array", () => {
        it("does nothing for null", () => {
            markFailedIfSCodeError(null);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for undefined", () => {
            markFailedIfSCodeError(undefined);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for a plain object", () => {
            markFailedIfSCodeError({sCode: "51008"});
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for a string", () => {
            markFailedIfSCodeError("51008");
            assert.equal(process.exitCode, 0);
        });
    });

    describe("when data is an array without sCode (read-only endpoints)", () => {
        it("does nothing for an empty array", () => {
            markFailedIfSCodeError([]);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing when items have no sCode field", () => {
            markFailedIfSCodeError([
                {instId: "BTC-USDT", last: "50000"},
                {instId: "ETH-USDT", last: "3000"},
            ]);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for an array of primitives", () => {
            markFailedIfSCodeError([1, 2, 3]);
            assert.equal(process.exitCode, 0);
        });
    });

    describe("when all items succeeded (sCode = '0')", () => {
        it("does nothing for a single successful item", () => {
            markFailedIfSCodeError([{ordId: "123", sCode: "0", sMsg: ""}]);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for multiple successful items", () => {
            markFailedIfSCodeError([
                {ordId: "123", sCode: "0", sMsg: ""},
                {ordId: "456", sCode: "0", sMsg: ""},
            ]);
            assert.equal(process.exitCode, 0);
        });

        it("treats numeric 0 as success", () => {
            markFailedIfSCodeError([{ordId: "123", sCode: 0}]);
            assert.equal(process.exitCode, 0);
        });
    });

    describe("when a business failure is present (sCode != '0')", () => {
        it("sets exit code 1 for insufficient balance (51008)", () => {
            markFailedIfSCodeError([{ordId: "", sCode: "51008", sMsg: "Insufficient balance"}]);
            assert.equal(process.exitCode, 1);
        });

        it("sets exit code 1 for any non-zero sCode string", () => {
            markFailedIfSCodeError([{ordId: "", sCode: "50000", sMsg: "Some error"}]);
            assert.equal(process.exitCode, 1);
        });

        it("sets exit code 1 when one item fails in a batch", () => {
            markFailedIfSCodeError([
                {ordId: "123", sCode: "0", sMsg: ""},
                {ordId: "", sCode: "51008", sMsg: "Insufficient balance"},
            ]);
            assert.equal(process.exitCode, 1);
        });

        it("sets exit code 1 when the first item fails in a batch", () => {
            markFailedIfSCodeError([
                {ordId: "", sCode: "51008", sMsg: "Insufficient balance"},
                {ordId: "123", sCode: "0", sMsg: ""},
            ]);
            assert.equal(process.exitCode, 1);
        });
    });
});
