// chip8.js
// A from-scratch CHIP-8 virtual machine: memory, registers, stack, timers,
// input, display buffer, and the full 35-instruction opcode table.
//
// This module has no dependencies and runs unmodified in both Node
// (for the test suite) and the browser (loaded as an ES module by index.html).

export const SCREEN_WIDTH = 64;
export const SCREEN_HEIGHT = 32;

// The 16 built-in hexadecimal digit sprites (0-F), 5 bytes each.
// This exact byte layout is the de facto CHIP-8 standard font, reproduced
// here from its bit pattern (not copied from any single implementation's
// source file) and traditionally stored at 0x000-0x1FF in memory.
export const FONT_SET = new Uint8Array([
  0xf0, 0x90, 0x90, 0x90, 0xf0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xf0, 0x10, 0xf0, 0x80, 0xf0, // 2
  0xf0, 0x10, 0xf0, 0x10, 0xf0, // 3
  0x90, 0x90, 0xf0, 0x10, 0x10, // 4
  0xf0, 0x80, 0xf0, 0x10, 0xf0, // 5
  0xf0, 0x80, 0xf0, 0x90, 0xf0, // 6
  0xf0, 0x10, 0x20, 0x40, 0x40, // 7
  0xf0, 0x90, 0xf0, 0x90, 0xf0, // 8
  0xf0, 0x90, 0xf0, 0x10, 0xf0, // 9
  0xf0, 0x90, 0xf0, 0x90, 0x90, // A
  0xe0, 0x90, 0xe0, 0x90, 0xe0, // B
  0xf0, 0x80, 0x80, 0x80, 0xf0, // C
  0xe0, 0x90, 0x90, 0x90, 0xe0, // D
  0xf0, 0x80, 0xf0, 0x80, 0xf0, // E
  0xf0, 0x80, 0xf0, 0x80, 0x80, // F
]);

const FONT_START = 0x000;
const PROGRAM_START = 0x200;

export class Chip8 {
  constructor({ onBeepStart, onBeepStop } = {}) {
    this.onBeepStart = onBeepStart || (() => {});
    this.onBeepStop = onBeepStop || (() => {});
    this.reset();
  }

  reset() {
    this.memory = new Uint8Array(4096);
    this.memory.set(FONT_SET, FONT_START);

    this.V = new Uint8Array(16); // general purpose registers V0..VF
    this.I = 0; // 16-bit index register
    this.pc = PROGRAM_START;

    this.stack = new Uint16Array(16);
    this.sp = 0;

    this.delayTimer = 0;
    this.soundTimer = 0;

    this.display = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT); // 0 or 1 per pixel
    this.drawFlag = true;

    this.keys = new Uint8Array(16); // 0 or 1 per hex key 0x0-0xF

    // Fx0A (wait for keypress) needs to block execution until a key is
    // released; this holds { register } while waiting, or null otherwise.
    this.waitingForKey = null;

    this.halted = false;
    this._wasBeeping = false;
  }

  loadROM(bytes) {
    this.reset();
    for (let i = 0; i < bytes.length; i++) {
      this.memory[PROGRAM_START + i] = bytes[i];
    }
  }

  setKey(key, isDown) {
    if (key < 0 || key > 0xf) return;
    this.keys[key] = isDown ? 1 : 0;
    if (isDown && this.waitingForKey !== null) {
      this.V[this.waitingForKey.register] = key;
      this.waitingForKey = null;
    }
  }

  // Called at 60Hz by the host, independent of instruction throughput.
  tickTimers() {
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) this.soundTimer--;

    const isBeeping = this.soundTimer > 0;
    if (isBeeping && !this._wasBeeping) this.onBeepStart();
    if (!isBeeping && this._wasBeeping) this.onBeepStop();
    this._wasBeeping = isBeeping;
  }

  // Executes exactly one instruction (fetch, decode, execute).
  step() {
    if (this.waitingForKey !== null || this.halted) return;

    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    this.pc += 2;
    this._execute(opcode);
  }

  _execute(opcode) {
    const x = (opcode & 0x0f00) >> 8;
    const y = (opcode & 0x00f0) >> 4;
    const n = opcode & 0x000f;
    const kk = opcode & 0x00ff;
    const nnn = opcode & 0x0fff;

    switch (opcode & 0xf000) {
      case 0x0000: {
        if (opcode === 0x00e0) {
          this.display.fill(0);
          this.drawFlag = true;
        } else if (opcode === 0x00ee) {
          this.sp--;
          this.pc = this.stack[this.sp];
        } else {
          // 0nnn (SYS addr): call to native code, ignored by modern
          // interpreters and by every ROM this emulator targets.
        }
        break;
      }
      case 0x1000: // 1nnn - JP addr
        this.pc = nnn;
        break;
      case 0x2000: // 2nnn - CALL addr
        this.stack[this.sp] = this.pc;
        this.sp++;
        this.pc = nnn;
        break;
      case 0x3000: // 3xkk - SE Vx, byte
        if (this.V[x] === kk) this.pc += 2;
        break;
      case 0x4000: // 4xkk - SNE Vx, byte
        if (this.V[x] !== kk) this.pc += 2;
        break;
      case 0x5000: // 5xy0 - SE Vx, Vy
        if (this.V[x] === this.V[y]) this.pc += 2;
        break;
      case 0x6000: // 6xkk - LD Vx, byte
        this.V[x] = kk;
        break;
      case 0x7000: // 7xkk - ADD Vx, byte (no carry flag)
        this.V[x] = (this.V[x] + kk) & 0xff;
        break;
      case 0x8000: {
        switch (n) {
          case 0x0: // 8xy0 - LD Vx, Vy
            this.V[x] = this.V[y];
            break;
          case 0x1: // 8xy1 - OR
            this.V[x] |= this.V[y];
            this.V[0xf] = 0;
            break;
          case 0x2: // 8xy2 - AND
            this.V[x] &= this.V[y];
            this.V[0xf] = 0;
            break;
          case 0x3: // 8xy3 - XOR
            this.V[x] ^= this.V[y];
            this.V[0xf] = 0;
            break;
          case 0x4: { // 8xy4 - ADD Vx, Vy, VF = carry
            const sum = this.V[x] + this.V[y];
            this.V[x] = sum & 0xff;
            this.V[0xf] = sum > 0xff ? 1 : 0;
            break;
          }
          case 0x5: { // 8xy5 - SUB Vx, Vy, VF = NOT borrow
            const notBorrow = this.V[x] >= this.V[y] ? 1 : 0;
            this.V[x] = (this.V[x] - this.V[y]) & 0xff;
            this.V[0xf] = notBorrow;
            break;
          }
          case 0x6: { // 8xy6 - SHR Vx (original COSMAC VIP: shifts Vy into Vx)
            const bit = this.V[y] & 0x1;
            this.V[x] = this.V[y] >> 1;
            this.V[0xf] = bit;
            break;
          }
          case 0x7: { // 8xy7 - SUBN Vx, Vy, VF = NOT borrow
            const notBorrow = this.V[y] >= this.V[x] ? 1 : 0;
            this.V[x] = (this.V[y] - this.V[x]) & 0xff;
            this.V[0xf] = notBorrow;
            break;
          }
          case 0xe: { // 8xyE - SHL Vx (original COSMAC VIP: shifts Vy into Vx)
            const bit = (this.V[y] & 0x80) >> 7;
            this.V[x] = (this.V[y] << 1) & 0xff;
            this.V[0xf] = bit;
            break;
          }
          default:
            throw new Error(`Unknown 8xy_ opcode: 0x${opcode.toString(16)}`);
        }
        break;
      }
      case 0x9000: // 9xy0 - SNE Vx, Vy
        if (this.V[x] !== this.V[y]) this.pc += 2;
        break;
      case 0xa000: // Annn - LD I, addr
        this.I = nnn;
        break;
      case 0xb000: // Bnnn - JP V0, addr
        this.pc = (nnn + this.V[0]) & 0xfff;
        break;
      case 0xc000: // Cxkk - RND Vx, byte
        this.V[x] = Math.floor(Math.random() * 256) & kk;
        break;
      case 0xd000: // Dxyn - DRW Vx, Vy, nibble
        this._draw(this.V[x], this.V[y], n);
        break;
      case 0xe000: {
        if (kk === 0x9e) { // Ex9E - SKP Vx
          if (this.keys[this.V[x] & 0xf]) this.pc += 2;
        } else if (kk === 0xa1) { // ExA1 - SKNP Vx
          if (!this.keys[this.V[x] & 0xf]) this.pc += 2;
        } else {
          throw new Error(`Unknown Ex__ opcode: 0x${opcode.toString(16)}`);
        }
        break;
      }
      case 0xf000: {
        switch (kk) {
          case 0x07: // Fx07 - LD Vx, DT
            this.V[x] = this.delayTimer;
            break;
          case 0x0a: // Fx0A - LD Vx, K (blocking wait for keypress)
            this.waitingForKey = { register: x };
            break;
          case 0x15: // Fx15 - LD DT, Vx
            this.delayTimer = this.V[x];
            break;
          case 0x18: // Fx18 - LD ST, Vx
            this.soundTimer = this.V[x];
            break;
          case 0x1e: // Fx1E - ADD I, Vx
            this.I = (this.I + this.V[x]) & 0xffff;
            break;
          case 0x29: // Fx29 - LD F, Vx (sprite address of digit Vx)
            this.I = FONT_START + (this.V[x] & 0xf) * 5;
            break;
          case 0x33: { // Fx33 - LD B, Vx (BCD)
            const value = this.V[x];
            this.memory[this.I] = Math.floor(value / 100);
            this.memory[this.I + 1] = Math.floor(value / 10) % 10;
            this.memory[this.I + 2] = value % 10;
            break;
          }
          case 0x55: { // Fx55 - LD [I], Vx (store V0..Vx; original semantics: I advances)
            for (let i = 0; i <= x; i++) this.memory[this.I + i] = this.V[i];
            this.I = (this.I + x + 1) & 0xffff;
            break;
          }
          case 0x65: { // Fx65 - LD Vx, [I] (load V0..Vx; original semantics: I advances)
            for (let i = 0; i <= x; i++) this.V[i] = this.memory[this.I + i];
            this.I = (this.I + x + 1) & 0xffff;
            break;
          }
          default:
            throw new Error(`Unknown Fx__ opcode: 0x${opcode.toString(16)}`);
        }
        break;
      }
      default:
        throw new Error(`Unknown opcode: 0x${opcode.toString(16)}`);
    }
  }

  _draw(vx, vy, n) {
    this.V[0xf] = 0;
    for (let row = 0; row < n; row++) {
      const spriteByte = this.memory[this.I + row];
      const py = (vy + row) % SCREEN_HEIGHT;
      for (let col = 0; col < 8; col++) {
        const spritePixel = (spriteByte >> (7 - col)) & 0x1;
        if (spritePixel === 0) continue;
        const px = (vx + col) % SCREEN_WIDTH;
        const idx = py * SCREEN_WIDTH + px;
        if (this.display[idx] === 1) this.V[0xf] = 1;
        this.display[idx] ^= 1;
      }
    }
    this.drawFlag = true;
  }
}
