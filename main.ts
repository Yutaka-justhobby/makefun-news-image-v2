// THE WORLD IN ONE PICTURE — Tuesday 24 November 2026.
// A program-drawn one-page newspaper: masthead, three hero stories and a
// grid of 24 more, plus a four-item footer ticker — 31 dated stories in all.
// Drawn entirely in code (own 3x5 bitmap font, own PNG encoder), no network,
// deterministic: two runs write identical bytes.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const NAVY = [13, 27, 46];
const PANEL = [22, 40, 63];
const PANEL2 = [28, 50, 78];
const INK = [245, 241, 230];
const GOLD = [232, 182, 76];
const RED = [214, 69, 69];
const GREEN = [76, 175, 125];
const BLUE = [74, 144, 217];
const ORANGE = [224, 123, 57];
const TEAL = [58, 169, 154];
const PURPLE = [139, 111, 192];
const SKY = [52, 84, 128];
const SEA = [28, 68, 110];
const GREY = [148, 163, 184];
const DARK = [10, 18, 30];
const WHITE = [255, 255, 255];
const YELLOW = [250, 204, 21];

type RGB = number[];

// ---------- canvas ----------
const px = new Uint8Array(W * H * 3);
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const dx = Math.floor(Math.sqrt(r * r - y * y));
    fillRect(cx - dx, cy + y, dx * 2 + 1, 1, c);
  }
}
function drawLine(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (let n = 0; n < 4000; n++) {
    fillRect(x, y, 1, 1, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function fillPoly(pts: [number, number][], c: RGB): void {
  let minY = 1e9;
  let maxY = -1e9;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(Math.round(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])));
      }
    }
    xs.sort((x, y2) => x - y2);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      fillRect(xs[i], y, xs[i + 1] - xs[i] + 1, 1, c);
    }
  }
}

// ---------- 3x5 bitmap font (own table, A-Z 0-9 and punctuation) ----------
const FONT: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [5, 7, 7, 7, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [7, 1, 7, 4, 7], "3": [7, 1, 7, 1, 7],
  "4": [5, 5, 7, 1, 1], "5": [7, 4, 7, 1, 7], "6": [7, 4, 7, 5, 7], "7": [7, 1, 2, 2, 2],
  "8": [7, 5, 7, 5, 7], "9": [7, 5, 7, 1, 7],
  " ": [0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 2], ",": [0, 0, 0, 2, 4], "-": [0, 0, 7, 0, 0],
  "'": [2, 2, 0, 0, 0], "!": [2, 2, 2, 0, 2], "?": [7, 1, 3, 0, 2], ":": [0, 2, 0, 2, 0],
  ";": [0, 2, 0, 2, 4], "/": [1, 1, 2, 4, 4], "(": [1, 2, 2, 2, 1], ")": [4, 2, 2, 2, 4],
  "%": [5, 1, 2, 4, 5], "$": [2, 7, 2, 7, 2], "&": [3, 5, 2, 5, 3], "+": [0, 2, 7, 2, 0],
  "=": [0, 7, 0, 7, 0], '"': [5, 5, 0, 0, 0], "|": [2, 2, 2, 2, 2],
};

function textWidth(s: string, scale: number): number {
  return s.length * 4 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: RGB): void {
  const str = s.toUpperCase();
  for (let ci = 0; ci < str.length; ci++) {
    const g = FONT[str[ci]] || FONT[" "];
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 3; col++) {
        if (g[r] & (1 << (2 - col))) {
          fillRect(x + ci * 4 * scale + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
  }
}
function drawTextCentered(cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, scale) <= maxW) {
      cur = t;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- PNG encoder (own, deterministic) ----------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- mini scenes (each drawn inside x,y,w,h) ----------
function skySea(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, Math.floor(h * 0.62), SKY);
  fillRect(x, y + Math.floor(h * 0.62), w, h - Math.floor(h * 0.62), SEA);
}
function drawScene(kind: string, x: number, y: number, w: number, h: number): void {
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  if (kind === "ship") {
    skySea(x, y, w, h);
    fillCircle(x + Math.floor(w * 0.78), y + Math.floor(h * 0.2), 9, YELLOW);
    fillPoly([[x + 8, y + h - 26], [x + w - 8, y + h - 26], [x + w - 22, y + h - 8], [x + 22, y + h - 8]], [120, 130, 140]);
    fillRect(x + Math.floor(w * 0.42), y + h - 52, 10, 28, [90, 100, 112]);
    fillCircle(cx + 18, y + h - 40, 12, ORANGE);
    fillCircle(cx + 26, y + h - 46, 7, YELLOW);
    fillRect(x + 14, y + 14, 3, 3, DARK); fillRect(x + 30, y + 8, 3, 3, DARK);
    drawLine(x + 14, y + 17, x + 22, y + 30, DARK);
  } else if (kind === "strikes") {
    fillRect(x, y, w, h, [26, 20, 34]);
    fillCircle(x + w - 16, y + 14, 10, [240, 230, 200]);
    const base = y + h;
    fillRect(x + 6, base - 52, 22, 52, [40, 44, 58]);
    fillRect(x + 34, base - 74, 24, 74, [34, 38, 52]);
    fillRect(x + 64, base - 44, 20, 44, [44, 48, 62]);
    fillRect(x + 90, base - 62, 26, 62, [36, 40, 54]);
    drawLine(x + 10, y + 10, x + 60, y + 44, RED);
    drawLine(x + 40, y + 6, x + 88, y + 40, ORANGE);
    drawLine(x + 70, y + 14, x + 110, y + 48, RED);
    fillCircle(x + 46, base - 78, 9, [120, 120, 130]);
    fillCircle(x + 100, base - 66, 8, [120, 120, 130]);
    fillCircle(x + 60, base - 46, 6, ORANGE);
  } else if (kind === "chip") {
    fillRect(x, y, w, h, [8, 40, 26]);
    const s = Math.floor(Math.min(w, h) * 0.55);
    const sx = cx - Math.floor(s / 2);
    const sy = y + 6;
    fillRect(sx, sy, s, s, GREEN);
    fillRect(sx + 8, sy + 8, s - 16, s - 16, [20, 90, 60]);
    for (let i = 0; i < 5; i++) {
      fillRect(sx + 4 + i * Math.floor(s / 5), sy - 6, 3, 6, GOLD);
      fillRect(sx + 4 + i * Math.floor(s / 5), sy + s, 3, 6, GOLD);
    }
    // Rising chart, drawn 2px thick so it reads at tile size.
    const pts: [number, number][] = [
      [x + 8, y + h - 14], [x + Math.floor(w * 0.35), y + h - 30],
      [x + Math.floor(w * 0.62), y + h - 44], [x + w - 10, y + h - 58],
    ];
    for (let i = 0; i + 1 < pts.length; i++) {
      drawLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], GOLD);
      drawLine(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, GOLD);
    }
    fillCircle(x + w - 10, y + h - 58, 4, YELLOW);
  } else if (kind === "satellite") {
    fillRect(x, y, w, h, [8, 14, 32]);
    for (let i = 0; i < 8; i++) fillRect(x + 6 + ((i * 37) % (w - 12)), y + 6 + ((i * 23) % 30), 2, 2, WHITE);
    // Earth as a disc rising from the bottom edge, not a giant circle.
    fillCircle(cx, y + h + 12, 48, [52, 110, 170]);
    fillCircle(cx - 12, y + h - 16, 8, GREEN);
    fillCircle(cx + 14, y + h - 8, 6, GREEN);
    fillRect(cx - 26, y + 10, 52, 16, GREY);
    fillRect(cx - 44, y + 14, 16, 8, BLUE);
    fillRect(cx + 28, y + 14, 16, 8, BLUE);
    drawLine(cx - 10, y + 28, cx - 30, y + 50, GOLD);
  } else if (kind === "capitol") {
    fillRect(x, y, w, h, [30, 44, 74]);
    fillRect(x + 10, y + h - 18, w - 20, 18, [220, 220, 215]);
    fillCircle(cx, y + h - 40, 26, [235, 235, 230]);
    fillRect(cx - 26, y + h - 40, 52, 24, [235, 235, 230]);
    for (let i = 0; i < 5; i++) fillRect(x + 16 + i * Math.floor((w - 32) / 5), y + h - 38, 6, 22, [200, 200, 195]);
    fillRect(cx - 2, y + h - 72, 4, 8, GOLD);
  } else if (kind === "tanker") {
    skySea(x, y, w, h);
    fillRect(x + 10, y + Math.floor(h * 0.55), w - 20, 18, [90, 40, 36]);
    fillRect(x + Math.floor(w * 0.6), y + Math.floor(h * 0.55) - 14, 18, 14, [120, 120, 125]);
    // Mines float in the sea below the hull, not in the sky.
    fillCircle(x + 20, y + Math.floor(h * 0.8), 5, DARK);
    fillCircle(x + 34, y + Math.floor(h * 0.76), 4, DARK);
    fillCircle(x + 48, y + Math.floor(h * 0.8), 5, DARK);
    fillCircle(x + Math.floor(w * 0.82), y + Math.floor(h * 0.72), 6, ORANGE);
    fillCircle(x + Math.floor(w * 0.82), y + Math.floor(h * 0.72), 3, YELLOW);
  } else if (kind === "gaza") {
    fillRect(x, y, w, h, [44, 40, 36]);
    fillRect(x + 8, y + h - 40, 30, 40, [90, 84, 76]);
    fillRect(x + 44, y + h - 56, 34, 56, [80, 74, 66]);
    fillRect(x + 84, y + h - 30, 26, 30, [96, 90, 82]);
    fillCircle(x + 60, y + h - 62, 7, [150, 150, 150]);
    fillCircle(x + 74, y + h - 68, 5, [170, 170, 170]);
    fillCircle(x + 30, y + h - 46, 5, ORANGE);
  } else if (kind === "tower") {
    fillRect(x, y, w, h, [24, 30, 52]);
    fillRect(cx - 14, y + 6, 28, h - 6, [120, 128, 150]);
    for (let r = 0; r < 6; r++) for (let c2 = 0; c2 < 3; c2++)
      fillRect(cx - 10 + c2 * 8, y + 12 + r * 9, 5, 5, [200, 210, 225]);
    fillCircle(cx, y + Math.floor(h * 0.45), 10, ORANGE);
    fillCircle(cx, y + Math.floor(h * 0.45), 5, YELLOW);
    fillRect(x + 6, y + h - 14, 16, 14, [70, 76, 92]);
    fillRect(x + w - 22, y + h - 18, 16, 18, [70, 76, 92]);
  } else if (kind === "jet") {
    fillRect(x, y, w, h, SKY);
    fillCircle(x + 14, y + 12, 8, WHITE);
    fillCircle(x + 26, y + 16, 6, WHITE);
    fillPoly([[cx - 26, cy], [cx + 26, cy - 8], [cx + 26, cy + 8]], GREY);
    fillPoly([[cx + 6, cy - 6], [cx + 2, cy - 22], [cx + 14, cy - 6]], GREY);
    drawLine(cx - 26, cy, cx - 44, cy + 6, WHITE);
  } else if (kind === "quake") {
    fillRect(x, y, w, h, [58, 48, 40]);
    fillRect(x + 10, y + h - 34, 26, 34, [120, 110, 96]);
    fillRect(x + 46, y + h - 44, 24, 44, [110, 100, 88]);
    fillRect(x + 78, y + h - 28, 22, 28, [126, 116, 102]);
    drawLine(x + 8, y + h - 6, x + 40, y + h - 26, DARK);
    drawLine(x + 40, y + h - 26, x + 70, y + h - 10, DARK);
    drawLine(x + 70, y + h - 10, x + w - 8, y + h - 30, DARK);
    fillCircle(x + w - 18, y + 12, 6, YELLOW);
  } else if (kind === "globe") {
    fillRect(x, y, w, h, [10, 20, 44]);
    fillCircle(cx, cy, Math.floor(Math.min(w, h) * 0.38), [52, 110, 170]);
    fillCircle(cx - 8, cy - 6, 10, GREEN);
    fillCircle(cx + 10, cy + 8, 8, GREEN);
    drawLine(cx - 22, cy - 20, cx - 22, cy + 20, [120, 180, 220]);
    drawLine(cx + 22, cy - 20, cx + 22, cy + 20, [120, 180, 220]);
  } else if (kind === "ai") {
    fillRect(x, y, w, h, [16, 24, 44]);
    fillRect(cx - 22, cy - 18, 44, 36, [200, 205, 215]);
    fillRect(cx - 14, cy - 8, 10, 8, BLUE);
    fillRect(cx + 4, cy - 8, 10, 8, BLUE);
    fillRect(cx - 12, cy + 8, 24, 3, DARK);
    drawLine(cx - 22, cy + 18, cx - 14, cy + 30, GREY);
    drawLine(cx + 22, cy + 18, cx + 14, cy + 30, GREY);
    fillCircle(cx - 18, cy - 24, 3, RED);
    fillCircle(cx + 18, cy - 24, 3, RED);
  } else if (kind === "health") {
    fillRect(x, y, w, h, [40, 16, 20]);
    fillRect(cx - 6, cy - 18, 12, 36, WHITE);
    fillRect(cx - 18, cy - 6, 36, 12, WHITE);
    fillCircle(cx, cy - 26, 3, RED);
  } else if (kind === "space") {
    fillRect(x, y, w, h, [6, 10, 28]);
    for (let i = 0; i < 10; i++) fillRect(x + 6 + ((i * 41) % (w - 12)), y + 6 + ((i * 29) % 40), 2, 2, WHITE);
    fillPoly([[cx, y + 8], [cx + 9, y + 26], [cx - 9, y + 26]], WHITE);
    fillRect(cx - 7, y + 26, 14, 22, [200, 60, 50]);
    fillPoly([[cx - 7, y + 48], [cx - 14, y + 58], [cx - 7, y + 52]], ORANGE);
    fillPoly([[cx + 7, y + 48], [cx + 14, y + 58], [cx + 7, y + 52]], ORANGE);
    fillCircle(cx, y + 60, 4, YELLOW);
  } else if (kind === "bomb") {
    fillRect(x, y, w, h, [36, 32, 30]);
    fillCircle(cx, cy, 14, ORANGE);
    fillCircle(cx, cy, 7, YELLOW);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      drawLine(cx, cy, cx + Math.round(Math.cos(a) * 26), cy + Math.round(Math.sin(a) * 26), YELLOW);
    }
    fillCircle(x + 16, y + 12, 7, [120, 120, 130]);
    fillCircle(x + w - 18, y + h - 14, 8, [120, 120, 130]);
  } else if (kind === "bus") {
    fillRect(x, y, w, h, [20, 30, 48]);
    fillRect(x + 8, y + h - 34, w - 16, 22, [200, 170, 60]);
    for (let i = 0; i < 4; i++) fillRect(x + 14 + i * Math.floor((w - 28) / 4), y + h - 30, 10, 8, SKY);
    fillCircle(x + 26, y + h - 10, 6, DARK);
    fillCircle(x + w - 26, y + h - 10, 6, DARK);
    drawLine(x, y + h - 4, x + w, y + h - 4, WHITE);
  } else if (kind === "car") {
    fillRect(x, y, w, h, [24, 34, 52]);
    fillPoly([[x + 14, y + h - 22], [x + 26, y + h - 36], [x + w - 30, y + h - 36], [x + w - 14, y + h - 22]], [180, 60, 50]);
    fillRect(x + 10, y + h - 22, w - 20, 12, [160, 50, 44]);
    fillCircle(x + 30, y + h - 10, 6, DARK);
    fillCircle(x + w - 30, y + h - 10, 6, DARK);
    drawLine(x, y + h - 4, x + w, y + h - 4, WHITE);
  } else if (kind === "train") {
    fillRect(x, y, w, h, [28, 40, 60]);
    fillRect(x + 12, y + 10, w - 24, h - 26, [180, 190, 200]);
    for (let i = 0; i < 3; i++) fillRect(x + 18 + i * Math.floor((w - 40) / 3), y + 18, 12, 10, SKY);
    fillRect(x + 8, y + h - 16, w - 16, 4, DARK);
    drawLine(x + 4, y + h - 8, x + w - 4, y + h - 8, [120, 120, 120]);
  } else if (kind === "fire") {
    fillRect(x, y, w, h, [30, 22, 26]);
    fillRect(x + 10, y + h - 30, 26, 30, [110, 100, 90]);
    fillRect(x + 44, y + h - 40, 30, 40, [100, 90, 82]);
    fillPoly([[cx + 26, y + h - 34], [cx + 40, y + 12], [cx + 52, y + h - 30], [cx + 40, y + h - 18]], ORANGE);
    fillPoly([[cx + 32, y + h - 30], [cx + 40, y + 26], [cx + 48, y + h - 28]], YELLOW);
  } else if (kind === "museum") {
    fillRect(x, y, w, h, [52, 44, 34]);
    fillPoly([[x + 8, y + 16], [cx, y + 2], [x + w - 8, y + 16]], [220, 210, 190]);
    for (let i = 0; i < 5; i++) fillRect(x + 12 + i * Math.floor((w - 24) / 5), y + 18, 6, h - 26, [225, 218, 200]);
    fillRect(x + 8, y + h - 10, w - 16, 8, [210, 200, 180]);
  } else if (kind === "flag") {
    fillRect(x, y, w, h, [24, 40, 66]);
    fillRect(cx - 2, y + 8, 4, h - 12, [220, 220, 210]);
    fillPoly([[cx + 2, y + 8], [cx + Math.floor(w * 0.32), y + 16], [cx + 2, y + 26]], RED);
    fillPoly([[cx + 2, y + 26], [cx + Math.floor(w * 0.28), y + 32], [cx + 2, y + 40]], WHITE);
    fillRect(x + 8, y + h - 8, w - 16, 6, [90, 90, 100]);
  } else if (kind === "tariff") {
    fillRect(x, y, w, h, [20, 32, 44]);
    const bw = Math.floor((w - 24) / 4);
    fillRect(x + 8, y + h - 26, bw, 18, BLUE);
    fillRect(x + 12 + bw, y + h - 38, bw, 30, TEAL);
    fillRect(x + 16 + bw * 2, y + h - 50, bw, 42, GOLD);
    fillRect(x + 20 + bw * 3, y + h - 62, bw, 54, RED);
    drawLine(x + 8, y + 12, x + w - 8, y + h - 20, WHITE);
  } else if (kind === "cyber") {
    fillRect(x, y, w, h, [14, 20, 36]);
    fillRect(cx - 18, cy - 6, 36, 26, [90, 120, 170]);
    fillRect(cx - 12, cy - 18, 24, 14, [90, 120, 170]);
    fillRect(cx - 8, cy - 14, 16, 10, [14, 20, 36]);
    fillCircle(cx, cy + 6, 4, GOLD);
    fillRect(cx - 1, cy + 6, 2, 8, GOLD);
    drawText(x + 6, y + 6, "101", 1, GREEN);
    drawText(x + w - 22, y + h - 12, "010", 1, GREEN);
  } else if (kind === "plant") {
    fillRect(x, y, w, h, [30, 28, 40]);
    fillRect(x + 10, y + h - 26, w - 20, 26, [120, 110, 100]);
    fillPoly([[x + 12, y + h - 26], [x + 22, y + h - 40], [x + 32, y + h - 26]], [120, 110, 100]);
    fillRect(x + w - 26, y + 10, 8, h - 36, [140, 130, 120]);
    fillCircle(x + w - 22, y + 8, 6, [150, 150, 150]);
    fillCircle(x + w - 30, y + 2, 4, [160, 160, 160]);
  } else if (kind === "claude") {
    fillRect(x, y, w, h, [26, 22, 36]);
    fillRect(x + 10, y + 10, w - 20, h - 26, [235, 230, 220]);
    fillPoly([[x + 18, y + h - 16], [x + 18, y + h - 6], [x + 30, y + h - 16]], [235, 230, 220]);
    drawText(x + 16, y + 16, "IF (X)", 2, [200, 80, 50]);
    drawText(x + 16, y + 34, "FIX()", 2, [40, 90, 160]);
  } else if (kind === "warning") {
    fillRect(x, y, w, h, [30, 26, 20]);
    fillPoly([[cx, y + 8], [cx + 26, y + h - 8], [cx - 26, y + h - 8]], YELLOW);
    fillRect(cx - 2, y + 20, 4, 16, DARK);
    fillRect(cx - 2, y + 40, 4, 4, DARK);
  } else if (kind === "chart") {
    fillRect(x, y, w, h, [16, 28, 40]);
    const bw = Math.floor((w - 24) / 4);
    fillRect(x + 8, y + h - 20, bw, 12, RED);
    fillRect(x + 12 + bw, y + h - 30, bw, 22, ORANGE);
    fillRect(x + 16 + bw * 2, y + h - 40, bw, 32, GOLD);
    fillRect(x + 20 + bw * 3, y + h - 52, bw, 44, GREEN);
    drawLine(x + 8, y + h - 10, x + w - 8, y + h - 10, WHITE);
    drawLine(x + 8, y + 8, x + w - 8, y + 8, [120, 130, 150]);
  } else {
    fillRect(x, y, w, h, PANEL2);
    fillCircle(cx, cy, Math.floor(Math.min(w, h) * 0.3), GOLD);
  }
}

// ---------- stories ----------
interface Story {
  tag: string;
  scene: string;
  headline: string;
  detail?: string;
}
const HEROES: Story[] = [
  { tag: "LIBYA", scene: "ship", headline: "UKRAINE SINKS RUSSIAN WARSHIP OFF LIBYA", detail: "DRONE STRIKE AT ANCHOR; TRIPOLI DEMANDS ANSWERS" },
  { tag: "UKRAINE", scene: "strikes", headline: "RUSSIAN STRIKES KILL 15 NEAR KYIV", detail: "ZAPORIZHZHIA HIT IN NIGHT ATTACKS" },
  { tag: "TECH", scene: "chip", headline: "NVIDIA REINSTATES CEO HUANG", detail: "SHARES SOAR 31%; TAIWAN STOCKS JUMP 9%" },
];
const GRID: Story[] = [
  { tag: "EUROPE", scene: "satellite", headline: "NATO VOWS SPACE DEFENCE" },
  { tag: "USA", scene: "capitol", headline: "DEMOCRATS WIN HOUSE MAJORITY", detail: "BIGGEST SINCE 1992" },
  { tag: "MIDEAST", scene: "tanker", headline: "TANKERS HIT MINES IN HORMUZ STRAIT" },
  { tag: "MIDEAST", scene: "gaza", headline: "HAMAS CHIEF KILLED IN GAZA", detail: "ISRAELI STRIKE DESPITE CEASEFIRE" },
  { tag: "MIDEAST", scene: "tower", headline: "HOUTHI DRONE HITS RIYADH TOWER", detail: "11 HURT; SECOND STRIKE IN A WEEK" },
  { tag: "ASIA", scene: "jet", headline: "NORTH KOREA JET IN SOUTH AIRSPACE", detail: "AIRSPACE BREACH; SHELTERS ORDERED" },
  { tag: "ASIA", scene: "quake", headline: "NEPAL QUAKE 5.6 NEAR CHINA BORDER" },
  { tag: "WORLD", scene: "globe", headline: "14 NATIONS BACK ICJ ROHINGYA RULING", detail: "MYANMAR GENOCIDE CASE" },
  { tag: "WORLD", scene: "ai", headline: "UN CHIEF SEEKS AI-RISK PACT", detail: "FRAMEWORK SOUGHT WITHIN A YEAR" },
  { tag: "USA", scene: "health", headline: "MEASLES KILLS 9TH IN PENNSYLVANIA", detail: "OUTBREAK SPANS 46 COUNTIES" },
  { tag: "ASIA", scene: "space", headline: "CHINA OPENS SPACE STATION TO PAKISTAN", detail: "FIRST FOREIGN ASTRONAUT ON SHENZHOU-24" },
  { tag: "AMERICAS", scene: "bomb", headline: "CAR BOMB BLASTS COLOMBIA CITY", detail: "BUILDINGS DESTROYED IN VILLAVICENCIO" },
  { tag: "MIDEAST", scene: "bus", headline: "UAE BUS CRASH KILLS 11", detail: "BUS-TRUCK CRASH IN RAS AL KHAIMAH" },
  { tag: "USA", scene: "car", headline: "HONDA RECALLS 810,000 VEHICLES", detail: "AIRBAG RUPTURE RISK" },
  { tag: "USA", scene: "train", headline: "AMTRAK TRAIN DERAILS", detail: "5 HURT IN LOUISIANA CRASH" },
  { tag: "AFRICA", scene: "fire", headline: "SIX ZANZIBAR HOTELS BURN; 180 FLEE" },
  { tag: "EUROPE", scene: "museum", headline: "ACROPOLIS MUSEUM REOPENS", detail: "AFTER 7-YEAR RESTORATION" },
  { tag: "USA", scene: "flag", headline: "VANCE LOBBIED NVIDIA BOARD", detail: "AT TRUMP'S BEHEST, FOR HUANG" },
  { tag: "WORLD", scene: "tariff", headline: "US PLANS FRESH TARIFF HIKES", detail: "CHINA AND EU IN LINE" },
  { tag: "TECH", scene: "warning", headline: "AI STAFF FEAR NEW MODELS", detail: "TOO DANGEROUS TO RELEASE, THEY WARN" },
  { tag: "USA", scene: "cyber", headline: "CIA, ODNI HIT BY CYBERATTACK", detail: "MYSTERY ATTACK REPORTED" },
  { tag: "USA", scene: "chart", headline: "TRUMP: US MAY STILL TAKE NVIDIA STAKE" },
  { tag: "USA", scene: "plant", headline: "TRUMP HALTS IOWA PLANT DETONATION", detail: "PENDING COURT RULING" },
  { tag: "TECH", scene: "claude", headline: "ANTHROPIC LAUNCHES CLAUDE SHIP", detail: "CODE REVIEW TOOL FOR DEVELOPERS" },
];
const TICKER: string[] = [
  "2031 WOMEN'S WORLD CUP: USA, MEXICO, COSTA RICA, JAMAICA",
  "DENMARK TO BAN PHONES IN SCHOOLS",
  "BANGLADESH GARMENT PAY UP 36%",
  "SENEGAL AFCON TITLE RESTORED",
];

// ---------- layout ----------
function drawPanel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PANEL);
  fillRect(x, y, w, 2, GOLD);
}

function main(): void {
  fillRect(0, 0, W, H, NAVY);

  // Header
  drawTextCentered(W / 2, 14, "THE WORLD IN ONE PICTURE", 4, GOLD);
  drawTextCentered(W / 2, 46, "TUESDAY 24 NOVEMBER 2026", 7, INK);
  fillRect(24, 98, W - 48, 3, GOLD);

  // Hero row: 3 panels
  const hy = 108;
  const hh = 280;
  const hw = 328;
  for (let i = 0; i < 3; i++) {
    const x = 8 + i * (hw + 8);
    const s = HEROES[i];
    drawPanel(x, hy, hw, hh);
    drawScene(s.scene, x + 6, hy + 6, hw - 12, 168);
    fillRect(x + 6, hy + 180, 64, 16, RED);
    drawText(x + 10, hy + 183, s.tag, 1, WHITE);
    const lines = wrapText(s.headline, hw - 16, 3);
    if (lines.length > 3) throw new Error("hero headline wraps to " + lines.length + " lines: " + s.headline);
    for (let li = 0; li < lines.length; li++) {
      drawText(x + 8, hy + 204 + li * 19, lines[li], 3, INK);
    }
    if (s.detail) {
      if (textWidth(s.detail, 1) > hw - 16) throw new Error("hero detail too wide: " + s.detail);
      drawText(x + 8, hy + 204 + lines.length * 19 + 2, s.detail, 1, GOLD);
    }
  }

  // Grid: 6 x 4 tiles
  const gy = 396;
  const tw = 161;
  const th = 132;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const idx = r * 6 + c;
      const s = GRID[idx];
      const x = 8 + c * (tw + 8);
      const y = gy + r * (th + 8);
      drawPanel(x, y, tw, th);
      drawScene(s.scene, x + 4, y + 4, tw - 8, 62);
      fillRect(x + 4, y + 70, 52, 12, RED);
      drawText(x + 7, y + 72, s.tag, 1, WHITE);
      const lines = wrapText(s.headline, tw - 10, 2);
      if (lines.length > 2) throw new Error("tile headline wraps to " + lines.length + " lines: " + s.headline);
      for (let li = 0; li < lines.length; li++) {
        drawText(x + 5, y + 86 + li * 13, lines[li], 2, INK);
      }
      if (s.detail) {
        const d = wrapText(s.detail, tw - 10, 1);
        if (d.length > 1) throw new Error("tile detail wraps to " + d.length + " lines: " + s.detail);
        if (d.length > 0) drawText(x + 5, y + 86 + Math.min(lines.length, 2) * 13 + 1, d[0], 1, GOLD);
      }
    }
  }

  // Footer ticker
  const fy = 956;
  fillRect(8, fy, W - 16, 60, PANEL2);
  fillRect(8, fy, W - 16, 2, GOLD);
  for (let i = 0; i < TICKER.length; i++) {
    const y = fy + 6 + i * 14;
    fillRect(16, y + 2, 6, 6, GOLD);
    drawText(28, y, TICKER[i], 2, INK);
  }

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), encodePNG());
}

main();
