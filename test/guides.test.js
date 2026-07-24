import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItems, sliceVceUnits, readGuide } from "../api/_guides.js";

const AC_SECTION = `# Australian Curriculum v9: Science (F–10)
## Year 7

**Achievement standard:** By the end of Year 7 students explain ...

### Science understanding

#### Biological sciences

- **AC9S7U01:** investigate the role of classification in ordering and organising diversity
- **AC9S7U02:** use models, including food webs, to represent matter and energy flow

#### Chemical sciences

- **AC9S7U05:** use particle theory to describe the arrangement of particles
`;

test("parseItems(ac) groups by sub-strand and keeps codes in the text", () => {
  const groups = parseItems(AC_SECTION, "ac");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].heading, "Biological sciences");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].id, "AC9S7U01");
  assert.equal(
    groups[0].items[0].text,
    "AC9S7U01 — investigate the role of classification in ordering and organising diversity"
  );
  assert.equal(groups[1].heading, "Chemical sciences");
  assert.equal(groups[1].items[0].id, "AC9S7U05");
});

const VCE_SECTION = `## Units 1-2 (Year 11)
- **Unit 1, AoS1 — How do cells function?:** explain cellular structure. Key knowledge: organelles.
- **Unit 1, AoS2 — How do plant and animal systems function?:** explain specialisation.
- **Unit 1, AoS3 — scientific investigation:** students design and conduct an investigation.
`;

test("parseItems(vce) makes one group of AoS titles, no key-knowledge detail", () => {
  const groups = parseItems(VCE_SECTION, "vce");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].heading, "");
  assert.equal(groups[0].items.length, 3);
  assert.equal(groups[0].items[0].text, "Unit 1, AoS1 — How do cells function?");
  assert.equal(groups[0].items[0].id, "unit-1-aos1-how-do-cells-function");
});

test("sliceVceUnits + parseItems on the real biology guide yields AoS items", () => {
  const text = readGuide("biology");
  assert.ok(text, "biology.md should be readable");
  const groups = parseItems(sliceVceUnits(text, "1-2"), "vce");
  const titles = groups.flatMap(g => g.items.map(i => i.text));
  assert.ok(titles.some(t => t.startsWith("Unit 1, AoS1")), "expected a Unit 1 AoS1 item");
  assert.ok(!titles.some(t => /Assessed through/.test(t)), "assessment prose must not become an item");
});
