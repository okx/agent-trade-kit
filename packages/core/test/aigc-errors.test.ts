import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withAigcErrors } from "../src/tools/aigc-errors.js";
import { OkxApiError, ValidationError } from "../src/utils/errors.js";

describe("withAigcErrors", () => {
  it("returns the result when no error is thrown", async () => {
    const result = await withAigcErrors(async () => "ok");
    assert.equal(result, "ok");
  });

  it("rethrows non-OkxApiError unchanged", async () => {
    const err = new ValidationError("bad param");
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => thrown === err,
    );
  });

  it("rethrows OkxApiError with unknown code unchanged (e.g. 902)", async () => {
    const err = new OkxApiError("Oops", { code: "902" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).code, "902");
        assert.equal((thrown as OkxApiError).suggestion, undefined);
        return true;
      },
    );
  });

  it("injects suggestion for code 50029 (Bean Validation)", async () => {
    const err = new OkxApiError("Invalid parameter", { code: "50029" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).code, "50029");
        assert.ok(typeof (thrown as OkxApiError).suggestion === "string");
        assert.ok((thrown as OkxApiError).suggestion!.length > 0);
        return true;
      },
    );
  });

  it("injects suggestion for code 51000 (invalid parameter value)", async () => {
    const err = new OkxApiError("Invalid param", { code: "51000" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).code, "51000");
        assert.ok(typeof (thrown as OkxApiError).suggestion === "string");
        return true;
      },
    );
  });

  it("injects suggestion for code 41001 (pair spread invalid instId)", async () => {
    const err = new OkxApiError("Bad instrument", { code: "41001" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).code, "41001");
        assert.ok(typeof (thrown as OkxApiError).suggestion === "string");
        return true;
      },
    );
  });

  it("injects suggestion for code 41020 (pair spread same instruments)", async () => {
    const err = new OkxApiError("Same inst", { code: "41020" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).code, "41020");
        assert.ok(typeof (thrown as OkxApiError).suggestion === "string");
        return true;
      },
    );
  });

  it("injects suggestion for code 41030 (pair spread unsupported bar)", async () => {
    const err = new OkxApiError("Bad bar", { code: "41030" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).code, "41030");
        assert.ok(typeof (thrown as OkxApiError).suggestion === "string");
        return true;
      },
    );
  });

  it("preserves endpoint and traceId on re-throw", async () => {
    const err = new OkxApiError("err", { code: "50029", endpoint: "/test", traceId: "abc" });
    await assert.rejects(
      () => withAigcErrors(async () => { throw err; }),
      (thrown) => {
        assert.ok(thrown instanceof OkxApiError);
        assert.equal((thrown as OkxApiError).endpoint, "/test");
        assert.equal((thrown as OkxApiError).traceId, "abc");
        return true;
      },
    );
  });
});
