// demo-rom.js
// An original, hand-assembled CHIP-8 program (not a copy of any published
// ROM) used as the built-in "Load demo" option in the UI and as a fixture
// for the draw/font opcode tests. It exercises LD Vx,byte / LD F,Vx / DRW
// / JP by drawing the built-in font digits 0-F in a two-row grid and then
// looping forever.
//
// The bytes are generated programmatically from the CHIP-8 encoding rules
// rather than hardcoded, so the assembly and the machine code can never
// drift apart.

function op6xkk(x, kk) {
  return [0x60 | x, kk & 0xff];
}
function opFx29(x) {
  return [0xf0 | x, 0x29];
}
function opDxyn(x, y, n) {
  return [0xd0 | x, (y << 4) | n];
}
function op1nnn(nnn) {
  return [0x10 | ((nnn >> 8) & 0xf), nnn & 0xff];
}

export function buildDemoRom() {
  const bytes = [];
  const COLS = 8;
  for (let digit = 0; digit < 16; digit++) {
    const col = digit % COLS;
    const row = Math.floor(digit / COLS);
    const x = col * 8 + 4;
    const y = row * 14 + 6;

    bytes.push(...op6xkk(0, digit)); // LD V0, digit
    bytes.push(...opFx29(0)); // LD F, V0        -> I = font sprite for digit
    bytes.push(...op6xkk(1, x)); // LD V1, x
    bytes.push(...op6xkk(2, y)); // LD V2, y
    bytes.push(...opDxyn(1, 2, 5)); // DRW V1, V2, 5
  }

  const selfAddress = 0x200 + bytes.length;
  bytes.push(...op1nnn(selfAddress)); // JP <self>  (infinite loop once drawn)

  return Uint8Array.from(bytes);
}
