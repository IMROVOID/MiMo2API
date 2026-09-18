import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveModelId, getModelList, isSupportedModel } from "../../src/proxy/model-catalog.js";

describe("model-catalog", () => {
  it("resolves preview aliases to MiMo-X-Pro-Preview", () => {
    assert.equal(resolveModelId("mimo-x-pro"), "MiMo-X-Pro-Preview");
    assert.equal(resolveModelId("mimo-x"), "MiMo-X-Pro-Preview");
    assert.equal(resolveModelId("gpt-4o"), "MiMo-X-Pro-Preview");
    assert.equal(resolveModelId("MiMo-X-Pro-Preview"), "MiMo-X-Pro-Preview");
  });

  it("resolves flash aliases to MiMo-X-Flash-Preview", () => {
    assert.equal(resolveModelId("mimo-x-flash"), "MiMo-X-Flash-Preview");
    assert.equal(resolveModelId("mimo-flash"), "MiMo-X-Flash-Preview");
    assert.equal(resolveModelId("MiMo-X-Flash-Preview"), "MiMo-X-Flash-Preview");
  });

  it("resolves V2.5 model identifiers directly", () => {
    assert.equal(resolveModelId("mimo-v2.5-pro"), "mimo-v2.5-pro");
    assert.equal(resolveModelId("mimo-v2.5-flash"), "mimo-v2.5-flash");
  });

  it("passes through unknown model names unmodified", () => {
    assert.equal(resolveModelId("custom-unknown-model"), "custom-unknown-model");
  });

  it("checks supported model recognition", () => {
    assert.equal(isSupportedModel("mimo-x-pro"), true);
    assert.equal(isSupportedModel("MiMo-X-Pro-Preview"), true);
    assert.equal(isSupportedModel("random-string-123"), false);
  });

  it("returns an OpenAI-compliant model list", () => {
    const list = getModelList();
    assert.equal(list.object, "list");
    assert.ok(Array.isArray(list.data));
    assert.ok(list.data.length >= 4);

    const ids = list.data.map((m) => m.id);
    assert.ok(ids.includes("mimo-x-pro"));
    assert.ok(ids.includes("mimo-x-flash"));
    assert.ok(ids.includes("MiMo-X-Pro-Preview"));
  });
});
