import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Chip8, SCREEN_WIDTH, SCREEN_HEIGHT, FONT_SET } from "../src/chip8.js";
import { decodeInstruction, disassemble } from "../src/disassembler.js";
import { buildDemoRom } from "../src/demo-rom.js";

function run(cpu, opcode) {
  cpu.memory[cpu.pc] = (opcode & 0xff00) >> 8;
  cpu.memory[cpu.pc + 1] = opcode & 0xff;
  cpu.step();
}

describe("reset / initial state", () => {
  test("starts at 0x200 with cleared registers and font loaded", () => {
    const cpu = new Chip8();
    assert.equal(cpu.pc, 0x200);
    assert.equal(cpu.sp, 0);
    assert.equal(cpu.I, 0);
    assert.deepEqual([...cpu.V], new Array(16).fill(0));
    assert.deepEqual(cpu.memory.slice(0, FONT_SET.length), FONT_SET);
  });
});

describe("core arithmetic and register ops", () => {
  test("6xkk LD Vx, byte", () => {
    const cpu = new Chip8();
    run(cpu, 0x63ab);
    assert.equal(cpu.V[3], 0xab);
  });

  test("7xkk ADD Vx, byte wraps without touching VF", () => {
    const cpu = new Chip8();
    cpu.V[2] = 0xff;
    cpu.V[0xf] = 5;
    run(cpu, 0x7202); // V2 += 2 -> wraps to 1
    assert.equal(cpu.V[2], 1);
    assert.equal(cpu.V[0xf], 5, "7xkk must not modify VF");
  });

  test("8xy4 ADD Vx, Vy sets VF on carry", () => {
    const cpu = new Chip8();
    cpu.V[0] = 0xf0;
    cpu.V[1] = 0x20;
    run(cpu, 0x8014);
    assert.equal(cpu.V[0], 0x10);
    assert.equal(cpu.V[0xf], 1);
  });

  test("8xy4 ADD Vx, Vy clears VF without carry", () => {
    const cpu = new Chip8();
    cpu.V[0] = 0x10;
    cpu.V[1] = 0x20;
    run(cpu, 0x8014);
    assert.equal(cpu.V[0], 0x30);
    assert.equal(cpu.V[0xf], 0);
  });

  test("8xy5 SUB Vx, Vy: VF = 1 (NOT borrow) when Vx >= Vy", () => {
    const cpu = new Chip8();
    cpu.V[0] = 10;
    cpu.V[1] = 4;
    run(cpu, 0x8015);
    assert.equal(cpu.V[0], 6);
    assert.equal(cpu.V[0xf], 1);
  });

  test("8xy5 SUB Vx, Vy: VF = 0 (borrow) when Vx < Vy", () => {
    const cpu = new Chip8();
    cpu.V[0] = 4;
    cpu.V[1] = 10;
    run(cpu, 0x8015);
    assert.equal(cpu.V[0], (4 - 10) & 0xff);
    assert.equal(cpu.V[0xf], 0);
  });

  test("8xy7 SUBN Vx, Vy: Vx = Vy - Vx, VF = NOT borrow", () => {
    const cpu = new Chip8();
    cpu.V[0] = 4;
    cpu.V[1] = 10;
    run(cpu, 0x8017);
    assert.equal(cpu.V[0], 6);
    assert.equal(cpu.V[0xf], 1);
  });

  test("8xy6 SHR shifts Vy into Vx, VF = dropped LSB", () => {
    const cpu = new Chip8();
    cpu.V[1] = 0b0000_0011;
    run(cpu, 0x8016); // V0 = SHR V1
    assert.equal(cpu.V[0], 0b0000_0001);
    assert.equal(cpu.V[0xf], 1);
  });

  test("8xyE SHL shifts Vy into Vx, VF = dropped MSB", () => {
    const cpu = new Chip8();
    cpu.V[1] = 0b1000_0001;
    run(cpu, 0x801e); // V0 = SHL V1
    assert.equal(cpu.V[0], 0b0000_0010);
    assert.equal(cpu.V[0xf], 1);
  });

  test("8xy1/2/3 bitwise ops reset VF to 0 (COSMAC VIP quirk)", () => {
    const cpu = new Chip8();
    cpu.V[0] = 0b1100;
    cpu.V[1] = 0b1010;
    cpu.V[0xf] = 1;
    run(cpu, 0x8011); // OR
    assert.equal(cpu.V[0], 0b1110);
    assert.equal(cpu.V[0xf], 0);
  });
});

describe("control flow", () => {
  test("1nnn JP addr", () => {
    const cpu = new Chip8();
    run(cpu, 0x1234);
    assert.equal(cpu.pc, 0x234);
  });

  test("2nnn CALL and 00EE RET round-trip", () => {
    const cpu = new Chip8();
    const returnAddr = cpu.pc + 2;
    run(cpu, 0x2300); // CALL 0x300
    assert.equal(cpu.pc, 0x300);
    assert.equal(cpu.sp, 1);
    assert.equal(cpu.stack[0], returnAddr);

    run(cpu, 0x00ee); // RET
    assert.equal(cpu.pc, returnAddr);
    assert.equal(cpu.sp, 0);
  });

  test("3xkk / 4xkk / 5xy0 / 9xy0 conditional skips", () => {
    const cpu = new Chip8();
    cpu.V[0] = 5;
    cpu.V[1] = 5;
    cpu.V[2] = 9;

    let pc = cpu.pc;
    run(cpu, 0x3005); // SE V0, 5 -> equal, should skip
    assert.equal(cpu.pc, pc + 4);

    cpu.pc = pc;
    run(cpu, 0x3009); // SE V0, 9 -> not equal, no skip
    assert.equal(cpu.pc, pc + 2);

    pc = cpu.pc;
    run(cpu, 0x5010); // SE V0, V1 -> equal, skip
    assert.equal(cpu.pc, pc + 4);

    pc = cpu.pc;
    run(cpu, 0x9020); // SNE V0, V2 -> not equal, skip
    assert.equal(cpu.pc, pc + 4);
  });

  test("Bnnn JP V0, addr", () => {
    const cpu = new Chip8();
    cpu.V[0] = 0x10;
    run(cpu, 0xb200);
    assert.equal(cpu.pc, 0x210);
  });

  test("stack supports 16 nested calls", () => {
    const cpu = new Chip8();
    for (let i = 0; i < 16; i++) {
      run(cpu, 0x2300 + i * 0x10);
    }
    assert.equal(cpu.sp, 16);
  });
});

describe("memory / index register", () => {
  test("Annn LD I, addr", () => {
    const cpu = new Chip8();
    run(cpu, 0xa123);
    assert.equal(cpu.I, 0x123);
  });

  test("Fx1E ADD I, Vx", () => {
    const cpu = new Chip8();
    cpu.I = 0x10;
    cpu.V[3] = 0x05;
    run(cpu, 0xf31e);
    assert.equal(cpu.I, 0x15);
  });

  test("Fx29 LD F, Vx points at the correct font glyph", () => {
    const cpu = new Chip8();
    cpu.V[2] = 0xa; // digit 'A'
    run(cpu, 0xf229);
    assert.equal(cpu.I, 0xa * 5);
    assert.deepEqual(
      cpu.memory.slice(cpu.I, cpu.I + 5),
      FONT_SET.slice(0xa * 5, 0xa * 5 + 5)
    );
  });

  test("Fx33 LD B, Vx stores correct BCD digits", () => {
    const cpu = new Chip8();
    cpu.I = 0x300;
    cpu.V[0] = 156;
    run(cpu, 0xf033);
    assert.equal(cpu.memory[0x300], 1);
    assert.equal(cpu.memory[0x301], 5);
    assert.equal(cpu.memory[0x302], 6);
  });

  test("Fx55 / Fx65 store and load registers through memory, advancing I", () => {
    const cpu = new Chip8();
    cpu.I = 0x400;
    for (let i = 0; i <= 4; i++) cpu.V[i] = i * 11;
    run(cpu, 0xf455); // store V0..V4
    assert.equal(cpu.I, 0x405, "Fx55 should advance I by x+1 (original semantics)");

    const cpu2 = new Chip8();
    cpu2.memory.set(cpu.memory.slice(0x400, 0x405), 0x400);
    cpu2.I = 0x400;
    run(cpu2, 0xf465); // load V0..V4
    for (let i = 0; i <= 4; i++) assert.equal(cpu2.V[i], i * 11);
    assert.equal(cpu2.I, 0x405);
  });
});

describe("input", () => {
  test("Ex9E / ExA1 skip based on key state", () => {
    const cpu = new Chip8();
    cpu.V[0] = 0x7;
    cpu.setKey(0x7, true);

    let pc = cpu.pc;
    run(cpu, 0xe09e); // SKP V0, key 7 down -> skip
    assert.equal(cpu.pc, pc + 4);

    pc = cpu.pc;
    run(cpu, 0xe0a1); // SKNP V0, key 7 down -> no skip
    assert.equal(cpu.pc, pc + 2);
  });

  test("Fx0A blocks execution until a key is pressed", () => {
    const cpu = new Chip8();
    run(cpu, 0xf00a); // LD V0, K
    assert.notEqual(cpu.waitingForKey, null);

    const pcBefore = cpu.pc;
    cpu.step(); // should be a no-op while waiting
    assert.equal(cpu.pc, pcBefore);

    cpu.setKey(0x9, true);
    assert.equal(cpu.waitingForKey, null);
    assert.equal(cpu.V[0], 0x9);
  });
});

describe("timers", () => {
  test("tickTimers decrements delay and sound timers at 60Hz cadence", () => {
    const cpu = new Chip8();
    cpu.delayTimer = 2;
    cpu.soundTimer = 1;
    cpu.tickTimers();
    assert.equal(cpu.delayTimer, 1);
    assert.equal(cpu.soundTimer, 0);
    cpu.tickTimers();
    assert.equal(cpu.delayTimer, 0);
    assert.equal(cpu.soundTimer, 0);
  });

  test("fires onBeepStart/onBeepStop exactly on the sound timer's edges", () => {
    const events = [];
    const cpu = new Chip8({
      onBeepStart: () => events.push("start"),
      onBeepStop: () => events.push("stop"),
    });
    cpu.soundTimer = 2;
    cpu.tickTimers(); // 2 -> 1, still beeping
    cpu.tickTimers(); // 1 -> 0, stops
    assert.deepEqual(events, ["start", "stop"]);
  });
});

describe("display / DRW", () => {
  test("00E0 CLS clears the screen and sets the draw flag", () => {
    const cpu = new Chip8();
    cpu.display.fill(1);
    cpu.drawFlag = false;
    run(cpu, 0x00e0);
    assert.ok(cpu.display.every((p) => p === 0));
    assert.equal(cpu.drawFlag, true);
  });

  test("Dxyn draws a sprite and reports no collision on an empty screen", () => {
    const cpu = new Chip8();
    cpu.I = 0x300;
    cpu.memory[0x300] = 0b11110000; // top row of the '0' glyph, reused as a test sprite
    cpu.V[0] = 0;
    cpu.V[1] = 0;
    run(cpu, 0xd011); // DRW V0, V1, 1
    assert.equal(cpu.V[0xf], 0);
    for (let col = 0; col < 4; col++) assert.equal(cpu.display[col], 1);
    for (let col = 4; col < 8; col++) assert.equal(cpu.display[col], 0);
  });

  test("Dxyn XORs overlapping pixels and sets VF on collision", () => {
    const cpu = new Chip8();
    cpu.I = 0x300;
    cpu.memory[0x300] = 0b11110000;
    cpu.V[0] = 0;
    cpu.V[1] = 0;
    run(cpu, 0xd011);
    run(cpu, 0xd011); // draw the identical sprite again -> should erase it
    assert.equal(cpu.V[0xf], 1);
    assert.ok(cpu.display.slice(0, 8).every((p) => p === 0));
  });

  test("Dxyn wraps sprites around screen edges", () => {
    const cpu = new Chip8();
    cpu.I = 0x300;
    cpu.memory[0x300] = 0b10000000; // single pixel, leftmost column of the byte
    cpu.V[0] = SCREEN_WIDTH - 1; // draw at the last column so it wraps to column 0
    cpu.V[1] = SCREEN_HEIGHT - 1;
    run(cpu, 0xd011);
    assert.equal(cpu.display[(SCREEN_HEIGHT - 1) * SCREEN_WIDTH + (SCREEN_WIDTH - 1)], 1);
  });
});

describe("disassembler", () => {
  test("decodes representative opcodes from every family", () => {
    assert.equal(decodeInstruction(0x00e0), "CLS");
    assert.equal(decodeInstruction(0x00ee), "RET");
    assert.equal(decodeInstruction(0x1234), "JP 0x234");
    assert.equal(decodeInstruction(0x6a05), "LD VA, 0x05");
    assert.equal(decodeInstruction(0x8ab4), "ADD VA, VB");
    assert.equal(decodeInstruction(0xd12f), "DRW V1, V2, 0xF");
    assert.equal(decodeInstruction(0xf129), "LD F, V1");
    assert.equal(decodeInstruction(0xf355), "LD [I], V3");
  });

  test("disassemble() produces one line per instruction with correct addresses", () => {
    const rom = Uint8Array.from([0x60, 0x0a, 0xa2, 0x34]);
    const lines = disassemble(rom);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].address, 0x200);
    assert.equal(lines[0].text, "0x200  600A  LD V0, 0x0A");
    assert.equal(lines[1].address, 0x202);
    assert.equal(lines[1].text, "0x202  A234  LD I, 0x234");
  });
});

describe("demo ROM integration", () => {
  test("runs to completion and draws all 16 font glyphs without throwing", () => {
    const cpu = new Chip8();
    cpu.loadROM(buildDemoRom());

    // 16 digits * 5 instructions each = 80 instructions to draw everything,
    // plus a margin of extra steps landing safely in the trailing JP-to-self loop.
    for (let i = 0; i < 80 + 5; i++) cpu.step();

    const litPixels = cpu.display.reduce((sum, p) => sum + p, 0);
    assert.ok(litPixels > 0, "demo ROM should have drawn something");

    // The program counter should now be parked in the infinite loop at the end.
    const pcAfter = cpu.pc;
    cpu.step();
    assert.equal(cpu.pc, pcAfter, "final JP should be a self-loop");
  });
});
