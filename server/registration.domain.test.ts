import { describe, expect, it } from "vitest";
import {
  GROUP_PREFIXES,
  SCHOOL_CLASSES,
  dedupeFingerprint,
  familyRegistrationInputSchema,
  findClassGroup,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  registrationInputSchema,
  registrationLookupSchema,
} from "@shared/registration";

const validInput = {
  studentName: "Aisha Ibrahim",
  guardianEmail: "parent@example.com",
  guardianPhone: "0805 778 2932",
  schoolClass: "Basic 4",
  consentToEmail: true as const,
};

describe("class groups", () => {
  it("maps every selectable class to a group with a prefix", () => {
    for (const schoolClass of SCHOOL_CLASSES) {
      const group = findClassGroup(schoolClass);
      expect(group, `${schoolClass} should map to a group`).not.toBeNull();
      expect(GROUP_PREFIXES[group!]).toBeTruthy();
    }
  });

  it("returns null for an unknown class rather than throwing", () => {
    expect(findClassGroup("Year 9")).toBeNull();
    expect(findClassGroup("")).toBeNull();
  });

  it("places boundary classes in the expected groups", () => {
    expect(findClassGroup("Nursery 2")).toBe("Lower Class");
    expect(findClassGroup("Basic 2")).toBe("Lower Class");
    expect(findClassGroup("Basic 3")).toBe("Middle Class");
    expect(findClassGroup("JSS 3")).toBe("Upper Class");
    expect(findClassGroup("SS 1")).toBe("Advance 1");
    expect(findClassGroup("Higher institution and above")).toBe("Advance 2");
  });
});

describe("normalisation", () => {
  it("reduces a phone number to digits", () => {
    expect(normalizePhone("0805 778 2932")).toBe("08057782932");
    expect(normalizePhone("0805-778-2932")).toBe("08057782932");
    expect(normalizePhone("(0805) 778 2932")).toBe("08057782932");
  });

  it("keeps a single leading international prefix", () => {
    expect(normalizePhone("+234 805 778 2932")).toBe("+2348057782932");
    expect(normalizePhone("+234+805")).toBe("+234805");
    expect(normalizePhone("234+805")).toBe("234805");
  });

  it("lowercases and trims emails", () => {
    expect(normalizeEmail("  Parent@Example.COM ")).toBe("parent@example.com");
  });

  it("collapses whitespace in names", () => {
    expect(normalizeName("  Aisha   Ibrahim ")).toBe("aisha ibrahim");
  });
});

describe("duplicate fingerprint", () => {
  it("treats the same participant written differently as one person", () => {
    const a = dedupeFingerprint({ studentName: "Aisha Ibrahim", guardianPhone: "0805 778 2932", schoolClass: "Basic 4" });
    const b = dedupeFingerprint({ studentName: "  aisha   IBRAHIM ", guardianPhone: "0805-778-2932", schoolClass: "basic 4" });
    expect(a).toBe(b);
  });

  it("keeps siblings distinct", () => {
    const a = dedupeFingerprint({ studentName: "Aisha Ibrahim", guardianPhone: "08057782932", schoolClass: "Basic 4" });
    const b = dedupeFingerprint({ studentName: "Yusuf Ibrahim", guardianPhone: "08057782932", schoolClass: "Basic 4" });
    expect(a).not.toBe(b);
  });

  it("keeps the same child in a different class distinct", () => {
    const a = dedupeFingerprint({ studentName: "Aisha Ibrahim", guardianPhone: "08057782932", schoolClass: "Basic 4" });
    const b = dedupeFingerprint({ studentName: "Aisha Ibrahim", guardianPhone: "08057782932", schoolClass: "Basic 5" });
    expect(a).not.toBe(b);
  });
});

describe("registrationInputSchema", () => {
  it("accepts a well-formed registration", () => {
    const parsed = registrationInputSchema.safeParse(validInput);
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing or malformed email", () => {
    for (const guardianEmail of ["", "   ", "not-an-email", "missing@domain", "@example.com"]) {
      const parsed = registrationInputSchema.safeParse({ ...validInput, guardianEmail });
      expect(parsed.success, `${guardianEmail || "(empty)"} should be rejected`).toBe(false);
    }
  });

  it("rejects a name that is too short or has no letters", () => {
    expect(registrationInputSchema.safeParse({ ...validInput, studentName: "A" }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...validInput, studentName: "123" }).success).toBe(false);
  });

  it("rejects a phone number with too few digits", () => {
    expect(registrationInputSchema.safeParse({ ...validInput, guardianPhone: "0805" }).success).toBe(false);
  });

  it("rejects a class that is not on the list", () => {
    expect(registrationInputSchema.safeParse({ ...validInput, schoolClass: "Year 9" }).success).toBe(false);
    expect(registrationInputSchema.safeParse({ ...validInput, schoolClass: "" }).success).toBe(false);
  });

  it("requires explicit email consent", () => {
    expect(registrationInputSchema.safeParse({ ...validInput, consentToEmail: false }).success).toBe(false);
    const { consentToEmail: _omitted, ...withoutConsent } = validInput;
    expect(registrationInputSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("trims whitespace off accepted values", () => {
    const parsed = registrationInputSchema.safeParse({ ...validInput, studentName: "  Aisha Ibrahim  ", guardianEmail: " parent@example.com " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.studentName).toBe("Aisha Ibrahim");
      expect(parsed.data.guardianEmail).toBe("parent@example.com");
    }
  });
});

describe("familyRegistrationInputSchema", () => {
  const familyValid = {
    registrationType: "family" as const,
    guardianPhone: "0805 778 2932",
    guardianEmail: "",
    consentToEmail: false,
    participants: [
      { studentName: "Aisha Ibrahim", schoolClass: "Basic 4" },
      { studentName: "Yusuf Ibrahim", schoolClass: "SS 1" },
    ],
  };

  it("accepts a two-child family without email", () => {
    expect(familyRegistrationInputSchema.safeParse(familyValid).success).toBe(true);
  });

  it("rejects a family with one child", () => {
    expect(familyRegistrationInputSchema.safeParse({ ...familyValid, participants: [familyValid.participants[0]] }).success).toBe(false);
  });

  it("requires email when consent is given", () => {
    expect(familyRegistrationInputSchema.safeParse({ ...familyValid, consentToEmail: true }).success).toBe(false);
    expect(familyRegistrationInputSchema.safeParse({ ...familyValid, consentToEmail: true, guardianEmail: "parent@example.com" }).success).toBe(true);
  });
});

describe("registrationLookupSchema", () => {
  it("accepts a registration number and phone", () => {
    expect(registrationLookupSchema.safeParse({ registrationNumber: "MIDDLE-014", guardianPhone: "08057782932" }).success).toBe(true);
  });

  it("rejects a too-short registration number", () => {
    expect(registrationLookupSchema.safeParse({ registrationNumber: "AB", guardianPhone: "08057782932" }).success).toBe(false);
  });
});
