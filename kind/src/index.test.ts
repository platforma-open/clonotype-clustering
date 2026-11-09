import { describe, expect, test } from "vitest";
import { kind } from "./index";

const parse = (params: unknown) => kind.parseInitializationParams(params);

describe("templates written by earlier versions of the kind", () => {
  test("a defaultBlockLabel key is ignored, not rejected", () => {
    const parsed = parse({
      identity: 0.9,
      defaultBlockLabel: "CDR3 aa, BLOSUM62, ident:0.9, cov:0.8",
      customBlockLabel: "My clustering",
    });
    expect(parsed).toEqual({ identity: 0.9, customBlockLabel: "My clustering" });
    expect(parsed).not.toHaveProperty("defaultBlockLabel");
  });
});
