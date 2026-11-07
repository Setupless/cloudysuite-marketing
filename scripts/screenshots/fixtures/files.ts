// Makes the binary fixtures with ImageMagick, so the repository holds recipes
// instead of megabytes. The same seed gives the same bytes on the same
// ImageMagick, so file sizes stay put between runs.
import { $ } from "bun";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FONT = "DejaVu-Sans";
const PAPER = "#f6f4ee";
const INK = "#3d4a3f";

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function treeCanopies(seed: number, count: number, box: number[]) {
  const random = mulberry32(seed);
  const [x0, y0, x1, y1] = box as [number, number, number, number];
  return Array.from({ length: count }, () => {
    const x = Math.round(x0 + random() * (x1 - x0));
    const y = Math.round(y0 + random() * (y1 - y0));
    const r = Math.round(26 + random() * 34);
    return `circle ${x},${y} ${x + r},${y}`;
  });
}

// A concept plan in the plain style of a studio's PDF set: paper, linework,
// soft fills, and a title block.
async function conceptPlan(path: string) {
  const draw = [
    `fill #e3ebd5 stroke #b9c8a4 stroke-width 3 path 'M 160,180 L 1320,150 L 1460,620 L 1180,980 L 220,1010 Z'`,
    `fill #e3ebd5 stroke #b9c8a4 stroke-width 3 path 'M 1620,240 L 2160,260 L 2200,860 L 1700,900 Z'`,
    `fill none stroke #9fc0cc stroke-width 70 stroke-linecap round path 'M 80,1240 C 520,1080 880,1400 1300,1220 S 1980,1060 2320,1180'`,
    `fill none stroke #c9d9df stroke-width 22 stroke-linecap round path 'M 80,1240 C 520,1080 880,1400 1300,1220 S 1980,1060 2320,1180'`,
    `fill none stroke #e2d3b4 stroke-width 46 stroke-linecap round path 'M 120,620 C 520,560 760,760 1100,700 S 1560,520 1880,600 S 2240,520 2330,520'`,
    `fill none stroke #e2d3b4 stroke-width 34 stroke-linecap round path 'M 980,720 C 1000,900 1080,1020 1180,1120'`,
    `fill #efe3cc stroke #c7b28a stroke-width 3 roundrectangle 1720,380 2060,640 28,28`,
    `fill none stroke #c7b28a stroke-width 2 path 'M 1760,420 L 2020,600 M 1800,400 L 2050,580 M 1740,460 L 1980,630'`,
    `fill #b48a5a stroke none rectangle 1130,640 1230,664`,
    `fill #b48a5a stroke none rectangle 640,560 740,584`,
    `fill #d8e6c4 stroke #9fb487 stroke-width 2 ellipse 600,1380 260,70 0,360`,
    `fill #d8e6c4 stroke #9fb487 stroke-width 2 ellipse 1680,1330 220,60 0,360`,
    `fill #a9c194 fill-opacity 0.85 stroke #6f8a5d stroke-width 3`,
    ...treeCanopies(11, 24, [220, 220, 1300, 520]),
    ...treeCanopies(23, 14, [1640, 700, 2180, 860]),
    ...treeCanopies(37, 10, [260, 820, 1100, 960]),
    `fill #c7d9b3 fill-opacity 0.9 stroke #7f9a6b stroke-width 2`,
    ...treeCanopies(41, 30, [180, 1300, 2260, 1450]),
  ];
  const labels = [
    ["Creek edge planting", 980, 1500],
    ["Nature play", 1745, 690],
    ["Shared path", 1500, 520],
    ["Open lawn", 620, 760],
    ["Bench", 1110, 625],
  ];
  const titleBlock = [
    `fill none stroke ${INK} stroke-width 3 rectangle 1720,1560 2340,1680`,
    `fill none stroke ${INK} stroke-width 2 line 2140,1560 2140,1680`,
  ];
  await $`magick -size 2400x1720 xc:${PAPER} \
    -draw ${draw.join(" ")} \
    -fill ${INK} -stroke none -font ${FONT} -pointsize 30 \
    ${labels.flatMap(([text, x, y]) => ["-annotate", `+${x}+${y}`, String(text)])} \
    -draw ${titleBlock.join(" ")} \
    -pointsize 34 -annotate +1745+1610 "WATTLE GROVE PARK" \
    -pointsize 24 -annotate +1745+1650 "Concept plan, rev C" \
    -pointsize 24 -annotate +2160+1610 "Saltbush" -annotate +2160+1650 "Studio" \
    -stroke ${INK} -strokewidth 4 -draw "line 120,1640 520,1640" \
    -draw "line 120,1630 120,1650 line 320,1630 320,1650 line 520,1630 520,1650" \
    -stroke none -pointsize 22 -annotate +112+1690 "0" -annotate +300+1690 "10" -annotate +500+1690 "20 m" \
    -fill none -stroke ${INK} -strokewidth 3 -draw "circle 2260,170 2260,110" \
    -fill ${INK} -draw "polygon 2260,105 2240,190 2260,170 2280,190" \
    -stroke none -pointsize 26 -annotate +2251+260 "N" \
    ${path}`;
}

// A flat-colour stand-in for a site photo, with grain so it compresses like one.
async function sitePhoto(path: string, seed: number, size: string, sky: string, ground: string) {
  const [w, h] = size.split("x").map(Number) as [number, number];
  const canopy = mulberry32(seed);
  const trees = Array.from({ length: 9 }, () => {
    const x = Math.round(canopy() * w);
    const y = Math.round(h * (0.38 + canopy() * 0.12));
    const r = Math.round(w * (0.05 + canopy() * 0.06));
    return `circle ${x},${y} ${x + r},${y}`;
  });
  await $`magick -size ${size} ${`gradient:${sky}-#f2efe6`} \
    -fill ${ground} -draw ${`rectangle 0,${Math.round(h * 0.55)} ${w},${h}`} \
    -fill ${"#6f8660"} -draw ${trees.join(" ")} \
    -fill ${"#c9b99a"} -draw ${`polygon ${Math.round(w * 0.42)},${h} ${Math.round(w * 0.5)},${Math.round(h * 0.56)} ${Math.round(w * 0.53)},${Math.round(h * 0.56)} ${Math.round(w * 0.7)},${h}`} \
    -blur 0x3 -seed ${seed} -attenuate 0.5 +noise Gaussian \
    -quality 88 ${path}`;
}

// A one-page document, such as an invoice or a fee proposal, as a PDF.
async function documentPdf(path: string, lines: string[], density = 150) {
  const body = lines.flatMap((line, index) => [
    "-annotate",
    `+140+${260 + index * 54}`,
    line,
  ]);
  await $`magick -size 1240x1754 xc:white -fill ${INK} -font ${FONT} \
    -pointsize 44 -annotate +140+170 ${lines[0] ?? ""} \
    -pointsize 26 ${body.slice(3)} \
    -density ${density} -units PixelsPerInch -compress jpeg -quality 80 ${path}`;
}

// An ASCII DXF of the site, the kind a CAD program exports for consultants.
function siteDxf(path: string, seed: number, entities: number) {
  const random = mulberry32(seed);
  const out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  for (let index = 0; index < entities; index += 1) {
    const x = (random() * 120).toFixed(4);
    const y = (random() * 80).toFixed(4);
    if (index % 3 === 0) {
      out.push("0", "CIRCLE", "8", "L-PLNT-TREE", "10", x, "20", y, "30", "0.0", "40", (1 + random() * 3).toFixed(4));
    } else {
      out.push("0", "LINE", "8", index % 3 === 1 ? "L-SITE-PATH" : "C-TOPO-MINR", "10", x, "20", y, "30", "0.0", "11", (Number(x) + random() * 4).toFixed(4), "21", (Number(y) + random() * 4).toFixed(4), "31", "0.0");
    }
  }
  out.push("0", "ENDSEC", "0", "EOF");
  writeFileSync(path, out.join("\r\n"));
}

export type FixtureFiles = {
  // Attachments the .mbox templates name with {{file:<name>}}.
  mail: Record<string, string>;
  // Team folder path, such as "Wattle Grove Park/Survey", to local files.
  projects: Record<string, string[]>;
};

export async function makeFiles(out: string, fixtures: string): Promise<FixtureFiles> {
  const file = (name: string) => {
    const path = join(out, name);
    mkdirSync(dirname(path), { recursive: true });
    return path;
  };
  const make = async (name: string, recipe: (path: string) => Promise<void> | void) => {
    const path = file(name);
    if (!existsSync(path)) await recipe(path);
    return path;
  };

  const plan = await make("wgp/Concept plan rev C.png", conceptPlan);
  const planPdf = await make("wgp/Concept plan rev C.pdf", (path) =>
    $`magick ${plan} -density 150 -units PixelsPerInch -compress jpeg -quality 85 ${path}`.then(() => {}),
  );
  const invoice = await make("mail/INV-20431.pdf", (path) =>
    documentPdf(path, [
      "Tax invoice INV-20431",
      "Kiln Supply",
      "",
      "Bill to: Saltbush Studio",
      "Delivery: Banksia Lane courtyard",
      "",
      "Terracotta edging, 42 m           $1,134.00",
      "Clay pavers, 18 square metres     $1,126.00",
      "Delivery                           $226.50",
      "",
      "Total due                        $2,486.50",
    ]),
  );

  return {
    mail: {
      "INV-20431.pdf": invoice,
      "Banksia Lane back gate.jpg": await make("mail/Banksia Lane back gate.jpg", (path) =>
        sitePhoto(path, 5, "1600x1200", "#b8cad6", "#9a9a7c"),
      ),
      "Banksia Lane drainage pit.jpg": await make("mail/Banksia Lane drainage pit.jpg", (path) =>
        sitePhoto(path, 9, "1600x1200", "#c4cfd4", "#8f8a72"),
      ),
    },
    projects: {
      "Wattle Grove Park": [
        plan,
        planPdf,
        join(fixtures, "Planting schedule rev C.xlsx"),
        await make("wgp/Site plan rev C.dxf", (path) => siteDxf(path, 3, 26000)),
        await make("wgp/Site photo, north entry.jpg", (path) =>
          sitePhoto(path, 13, "4032x3024", "#a9c4d8", "#8d9a6a"),
        ),
        await make("wgp/Fee proposal, signed.pdf", (path) =>
          documentPdf(path, [
            "Fee proposal",
            "Wattle Grove Park",
            "",
            "Concept design                      $18,400",
            "Design development                  $26,900",
            "Documentation                       $31,200",
            "Site visits, 6                       $4,800",
            "",
            "Accepted by the client, signed copy attached.",
          ]),
        ),
      ],
      "Wattle Grove Park/Survey": [
        await make("wgp/survey/Feature survey.pdf", (path) =>
          $`magick ${plan} -colorspace Gray -density 150 -units PixelsPerInch -compress jpeg -quality 80 ${path}`.then(() => {}),
        ),
        await make("wgp/survey/Feature survey.dxf", (path) => siteDxf(path, 4, 41000)),
      ],
      "Wattle Grove Park/Consultation": [
        await make("wgp/consultation/Community drop-in summary.pdf", (path) =>
          documentPdf(path, [
            "Community drop-in summary",
            "Wattle Grove Park",
            "",
            "62 visitors over two sessions.",
            "Most asked for: shade, seating, and a nature play area.",
            "Concerns: parking, and keeping the old gums.",
          ]),
        ),
      ],
      "Wattle Grove Park/Photos": [
        await make("wgp/photos/Creek edge, looking east.jpg", (path) =>
          sitePhoto(path, 17, "4032x3024", "#b5c9d1", "#7f8f63"),
        ),
        await make("wgp/photos/Existing gums.jpg", (path) =>
          sitePhoto(path, 19, "4032x3024", "#aebfcc", "#8a9468"),
        ),
      ],
      "Banksia Lane Courtyard": [
        await make("banksia/Courtyard layout rev A.pdf", (path) =>
          $`magick ${plan} -rotate 90 -resize 70% -density 150 -units PixelsPerInch -compress jpeg -quality 80 ${path}`.then(() => {}),
        ),
      ],
      "Harbour Steps Plaza/Details": [
        await make("harbour/Retaining wall details.pdf", (path) =>
          documentPdf(path, [
            "Retaining wall details",
            "Harbour Steps Plaza",
            "",
            "Sandstone face, 450 mm",
            "Reinforced block core",
            "Agricultural drain behind the wall",
          ]),
        ),
      ],
      "Riverbend School": [
        await make("riverbend/Concept pack.pdf", (path) =>
          $`magick ${plan} -modulate 100,80 -density 150 -units PixelsPerInch -compress jpeg -quality 85 ${path}`.then(() => {}),
        ),
      ],
    },
  };
}
