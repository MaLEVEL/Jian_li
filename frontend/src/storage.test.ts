import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "./constants";
import {
  createStoredPayload,
  looksLikeStoredPayload,
  normalizeStoredState,
  STORAGE_VERSION,
} from "./storage";

const sections = {
  summary: "React frontend developer",
  skills: ["React", "TypeScript"],
  education: ["Software Engineering"],
  projects: ["JobFit AI web app"],
  experience: ["Frontend intern"],
  awards: [],
};

describe("storage normalization", () => {
  it("rejects partial JSON that only happens to contain a known field", () => {
    expect(looksLikeStoredPayload({ profile: "hello" })).toBe(false);
    expect(looksLikeStoredPayload(createStoredPayload(DEFAULT_PROFILE, [], []))).toBe(true);
  });

  it("filters applications whose resumeId does not exist", () => {
    const payload = {
      version: STORAGE_VERSION,
      profile: DEFAULT_PROFILE,
      resumes: [
        {
          id: "resume-1",
          title: "Frontend base",
          source: "generated",
          targetRole: "Frontend Engineer",
          sections,
          plainText: "React TypeScript Vite",
          unsupportedClaims: [],
          reviewed: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      applications: [
        {
          id: "app-1",
          job: { company: "JobFit", title: "Frontend Engineer", description: "React TypeScript" },
          status: "applied",
          resumeId: "resume-1",
          resumeTitle: "Stale title",
          report: { score: 80, matchedKeywords: [], missingKeywords: [], strengths: [], gaps: [], suggestions: [], optimizedBullets: [] },
          questions: { technical: [], project: [], behavioral: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "app-2",
          job: { company: "Ghost", title: "Unknown", description: "React" },
          status: "saved",
          resumeId: "missing-resume",
          resumeTitle: "Missing",
          report: { score: 10, matchedKeywords: [], missingKeywords: [], strengths: [], gaps: [], suggestions: [], optimizedBullets: [] },
          questions: { technical: [], project: [], behavioral: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const restored = normalizeStoredState(payload);

    expect(restored.applications).toHaveLength(1);
    expect(restored.applications[0].resumeId).toBe("resume-1");
    expect(restored.applications[0].resumeTitle).toBe("Frontend base");
  });

  it("restores safe appearance defaults and clamps invalid typography settings", () => {
    const restored = normalizeStoredState({
      version: STORAGE_VERSION,
      profile: DEFAULT_PROFILE,
      resumes: [
        {
          id: "resume-styled",
          title: "Styled resume",
          source: "generated",
          template: "academic",
          targetRole: "Researcher",
          sections,
          plainText: "React TypeScript Vite",
          unsupportedClaims: [],
          reviewed: false,
          appearance: {
            fontFamily: "serif",
            fontSize: 99,
            lineHeight: 0.2,
            pageMargin: 80,
            pageCount: 2,
            accent: "#123456",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      applications: [],
    });

    expect(restored.resumes[0].appearance).toMatchObject({
      fontFamily: "serif",
      fontSize: 16,
      lineHeight: 1.25,
      pageMargin: 24,
      pageCount: 2,
      accent: "#123456",
    });
  });
  it("keeps optimized resumes but clears missing parent links", () => {
    const restored = normalizeStoredState({
      version: STORAGE_VERSION,
      profile: DEFAULT_PROFILE,
      resumes: [
        {
          id: "resume-optimized",
          title: "Frontend custom",
          source: "optimized",
          targetRole: "Frontend Engineer",
          parentResumeId: "deleted-base",
          sections,
          plainText: "React TypeScript Vite",
          unsupportedClaims: [],
          reviewed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      applications: [],
    });

    expect(restored.resumes[0].parentResumeId).toBeUndefined();
  });
});
