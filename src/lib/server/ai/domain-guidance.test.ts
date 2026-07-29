import { describe, expect, it } from "vitest";

import {
  domainGuidanceInstruction,
  selectDomainGuidance,
} from "./domain-guidance";

describe("domain guidance", () => {
  it.each([
    ["云商务 GTM", { role: "云计算 GTM", skills: ["Pipeline", "BANT"] }, "cloud-gtm"],
    ["游戏运营", { role: "游戏运营", skills: ["版本运营", "DAU"] }, "game-operations-publishing"],
    ["全球传播", { role: "Global Communications", skills: ["media relations"] }, "global-communications"],
    ["产品运营", { role: "产品运营", skills: ["用户分层"] }, "operations"],
  ])("selects %s from role context", (_label, input, expected) => {
    expect(selectDomainGuidance(input)?.id).toBe(expected);
  });

  it("prefers the more specific game-audio guide over broad game or business signals", () => {
    expect(
      selectDomainGuidance({
        role: "游戏音频商务拓展",
        skills: ["Wwise", "版权合作", "游戏"],
      })?.id,
    ).toBe("game-audio-business-development");
  });

  it("does not inject a guide for unrelated or weakly matched input", () => {
    expect(
      selectDomainGuidance({ role: "软件工程师", skills: ["TypeScript", "云原生"] }),
    ).toBeNull();
  });

  it("marks selected knowledge as rubric context rather than candidate evidence", () => {
    const instruction = domainGuidanceInstruction(
      { role: "游戏音频商务拓展", skills: ["FMOD"] },
      "interview",
    );

    expect(instruction).toContain("game audio business development");
    expect(instruction).toContain("not evidence about the candidate");
    expect(instruction).toContain("never assert that the candidate performed them");
  });
});
