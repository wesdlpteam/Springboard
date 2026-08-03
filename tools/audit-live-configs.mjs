/* The test matrix: every year level Foundation-12, a spread of subjects and learning areas,
   and a mix of image / video / article stimulus. `stim` names a key from the stimulus pack. */
export const CONFIGS = [
  // ---------- Foundation ----------
  { id: "F-english-img",   year: "F",  cur: "Australian Curriculum", subject: "English",  kind: "image",   stim: "bee-flower", move: "Describe What's There" },
  { id: "F-science-vid",   year: "F",  cur: "Australian Curriculum", subject: "Science",  kind: "video",   stim: "pollination", move: "Wondering" },
  // ---------- Year 1 ----------
  { id: "1-maths-img",     year: "1",  cur: "Australian Curriculum", subject: "Mathematics", kind: "image", stim: "market-stall", move: "Describe What's There" },
  { id: "1-hass-img",      year: "1",  cur: "Australian Curriculum", subject: "HASS (F–6)",  kind: "image", stim: "bridge-build", move: "Wondering" },
  // ---------- Year 2 ----------
  { id: "2-arts-img",      year: "2",  cur: "Australian Curriculum", subject: "Visual Arts", kind: "image", stim: "great-wave", move: "Describe What's There" },
  { id: "2-hpe-art",       year: "2",  cur: "Australian Curriculum", subject: "Health and Physical Education", kind: "article", stim: "slide", move: "Reason with Evidence" },
  // ---------- Year 3 ----------
  { id: "3-science-vid",   year: "3",  cur: "Australian Curriculum", subject: "Science", kind: "video",   stim: "lava", move: "Build Explanations" },
  { id: "3-english-art",   year: "3",  cur: "Australian Curriculum", subject: "English", kind: "article", stim: "birdflu", move: "Wondering" },
  // ---------- Year 4 ----------
  { id: "4-hass-img",      year: "4",  cur: "Australian Curriculum", subject: "HASS (F–6)", kind: "image", stim: "migrant-mother", move: "Consider Different Viewpoints", focus: 2 },
  { id: "4-maths-art",     year: "4",  cur: "Australian Curriculum", subject: "Mathematics", kind: "article", stim: "pocketmoney", move: "Reason with Evidence" },
  // ---------- Year 5 ----------
  { id: "5-dt-vid",        year: "5",  cur: "Australian Curriculum", subject: "Design and Technologies", kind: "video", stim: "printer3d", move: "Build Explanations" },
  { id: "5-science-img",   year: "5",  cur: "Australian Curriculum", subject: "Science", kind: "image", stim: "coral-bleaching", move: "Uncovering Complexity", focus: 2 },
  // ---------- Year 6 ----------
  { id: "6-dance-vid",     year: "6",  cur: "Australian Curriculum", subject: "Dance", kind: "video", stim: "dance", move: "Capture the Heart & Form Conclusions" },
  { id: "6-english-art",   year: "6",  cur: "Australian Curriculum", subject: "English", kind: "article", stim: "baliboats", move: "Make Connections" },
  // ---------- Year 7 ----------
  { id: "7-geog-img",      year: "7",  cur: "Australian Curriculum", subject: "Geography (7–10)", kind: "image", stim: "plastic-beach", move: "Uncovering Complexity" },
  { id: "7-maths-art",     year: "7",  cur: "Australian Curriculum", subject: "Mathematics", kind: "article", stim: "petrol", move: "Reason with Evidence",
    intention: "We are learning to use percentages to judge whether a price change is a fair deal" },
  // ---------- Year 8 ----------
  { id: "8-digitech-vid",  year: "8",  cur: "Australian Curriculum", subject: "Digital Technologies", kind: "video", stim: "printer3d", move: "Build Explanations" },
  { id: "8-history-img",   year: "8",  cur: "Australian Curriculum", subject: "History (7–10)", kind: "image", stim: "bridge-build", move: "Consider Different Viewpoints" },
  { id: "8-myp-img",       year: "8",  cur: "IB MYP", subject: "Individuals and Societies", kind: "image", stim: "plastic-beach", move: "Uncovering Complexity" },
  // ---------- Year 9 ----------
  { id: "9-science-img",   year: "9",  cur: "Australian Curriculum", subject: "Science", kind: "image", stim: "earth-apollo", move: "Make Connections" },
  { id: "9-econ-art",      year: "9",  cur: "Australian Curriculum", subject: "Economics and Business (7–10)", kind: "article", stim: "budget", move: "Reason with Evidence", focus: 2 },
  // ---------- Year 10 ----------
  { id: "10-english-art",  year: "10", cur: "Australian Curriculum", subject: "English", kind: "article", stim: "comgames", move: "Consider Different Viewpoints",
    reflectRoutine: "Connect–Extend–Challenge" },
  { id: "10-media-vid",    year: "10", cur: "Australian Curriculum", subject: "Media Arts", kind: "video", stim: "dance", move: "Capture the Heart & Form Conclusions" },
  // ---------- Year 11 (VCE Units 1-2) ----------
  { id: "11-legal-art",    year: "11", cur: "VCE", subject: "Legal Studies", kind: "article", stim: "census", move: "Reason with Evidence" },
  { id: "11-biology-img",  year: "11", cur: "VCE", subject: "Biology", kind: "image", stim: "bee-flower", move: "Build Explanations" },
  { id: "11-media-vid",    year: "11", cur: "VCE", subject: "Media", kind: "video", stim: "dance", move: "Describe What's There" },
  // ---------- Year 12 (VCE Units 3-4) ----------
  { id: "12-psych-art",    year: "12", cur: "VCE", subject: "Psychology", kind: "article", stim: "intersex", move: "Uncovering Complexity" },
  { id: "12-envsci-img",   year: "12", cur: "VCE", subject: "Environmental Science", kind: "image", stim: "coral-bleaching", move: "Uncovering Complexity" },
  { id: "12-dp-art",       year: "12", cur: "IB DP", subject: "Environmental Systems and Societies", kind: "article", stim: "birdflu", move: "Uncovering Complexity" },
];

// Article stimulus keys -> a matcher against the fetched pack (titles vary run to run).
export const ARTICLE_MATCH = {
  slide:       /tube slide|playground/i,
  birdflu:     /bird flu/i,
  pocketmoney: /pocket money|chores/i,
  baliboats:   /Bali/i,
  petrol:      /petrol|fuel discount/i,
  budget:      /budget|flushing our toilets/i,
  comgames:    /Commonwealth Games/i,
  census:      /census will ask your sexual orientation|sexual orientation/i,
  intersex:    /intersex/i,
};
