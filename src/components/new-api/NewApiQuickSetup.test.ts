import { describe, expect, it } from "vitest";
import { getModelList } from "./NewApiQuickSetup";

describe("NewApiQuickSetup model parsing", () => {
  it("reads New API's OpenAI-style model objects", () => {
    expect(
      getModelList({
        data: [
          { id: "gpt-5.6-sol", object: "model" },
          { id: "claude-sonnet-5", object: "model" },
          { id: "gpt-5.6-sol", object: "model" },
        ],
      }),
    ).toEqual(["claude-sonnet-5", "gpt-5.6-sol"]);
  });

  it("keeps compatibility with string and nested model responses", () => {
    expect(
      getModelList({
        data: {
          models: ["z-model", { name: "a-model" }, { model: "m-model" }],
        },
      }),
    ).toEqual(["a-model", "m-model", "z-model"]);
  });
});
