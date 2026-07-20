// disassembler.js
// Converts raw CHIP-8 ROM bytes into human-readable assembly listings.
// Used by the debugger panel in index.html and independently testable.

const PROGRAM_START = 0x200;

function hex(n, width) {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

// Decodes a single 16-bit opcode into a mnemonic string, e.g. "LD V1, 0x0A".
export function decodeInstruction(opcode) {
  const x = (opcode & 0x0f00) >> 8;
  const y = (opcode & 0x00f0) >> 4;
  const n = opcode & 0x000f;
  const kk = opcode & 0x00ff;
  const nnn = opcode & 0x0fff;

  switch (opcode & 0xf000) {
    case 0x0000:
      if (opcode === 0x00e0) return "CLS";
      if (opcode === 0x00ee) return "RET";
      return `SYS 0x${hex(nnn, 3)}`;
    case 0x1000:
      return `JP 0x${hex(nnn, 3)}`;
    case 0x2000:
      return `CALL 0x${hex(nnn, 3)}`;
    case 0x3000:
      return `SE V${hex(x, 1)}, 0x${hex(kk, 2)}`;
    case 0x4000:
      return `SNE V${hex(x, 1)}, 0x${hex(kk, 2)}`;
    case 0x5000:
      return `SE V${hex(x, 1)}, V${hex(y, 1)}`;
    case 0x6000:
      return `LD V${hex(x, 1)}, 0x${hex(kk, 2)}`;
    case 0x7000:
      return `ADD V${hex(x, 1)}, 0x${hex(kk, 2)}`;
    case 0x8000:
      switch (n) {
        case 0x0: return `LD V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x1: return `OR V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x2: return `AND V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x3: return `XOR V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x4: return `ADD V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x5: return `SUB V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x6: return `SHR V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0x7: return `SUBN V${hex(x, 1)}, V${hex(y, 1)}`;
        case 0xe: return `SHL V${hex(x, 1)}, V${hex(y, 1)}`;
        default: return `DATA 0x${hex(opcode, 4)}`;
      }
    case 0x9000:
      return `SNE V${hex(x, 1)}, V${hex(y, 1)}`;
    case 0xa000:
      return `LD I, 0x${hex(nnn, 3)}`;
    case 0xb000:
      return `JP V0, 0x${hex(nnn, 3)}`;
    case 0xc000:
      return `RND V${hex(x, 1)}, 0x${hex(kk, 2)}`;
    case 0xd000:
      return `DRW V${hex(x, 1)}, V${hex(y, 1)}, 0x${hex(n, 1)}`;
    case 0xe000:
      if (kk === 0x9e) return `SKP V${hex(x, 1)}`;
      if (kk === 0xa1) return `SKNP V${hex(x, 1)}`;
      return `DATA 0x${hex(opcode, 4)}`;
    case 0xf000:
      switch (kk) {
        case 0x07: return `LD V${hex(x, 1)}, DT`;
        case 0x0a: return `LD V${hex(x, 1)}, K`;
        case 0x15: return `LD DT, V${hex(x, 1)}`;
        case 0x18: return `LD ST, V${hex(x, 1)}`;
        case 0x1e: return `ADD I, V${hex(x, 1)}`;
        case 0x29: return `LD F, V${hex(x, 1)}`;
        case 0x33: return `LD B, V${hex(x, 1)}`;
        case 0x55: return `LD [I], V${hex(x, 1)}`;
        case 0x65: return `LD V${hex(x, 1)}, [I]`;
        default: return `DATA 0x${hex(opcode, 4)}`;
      }
    default:
      return `DATA 0x${hex(opcode, 4)}`;
  }
}

// Disassembles a full ROM byte array into an array of
// { address, opcode, text } records, one per two-byte instruction.
export function disassemble(bytes) {
  const lines = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const opcode = (bytes[i] << 8) | bytes[i + 1];
    const address = PROGRAM_START + i;
    lines.push({
      address,
      opcode,
      text: `0x${hex(address, 3)}  ${hex(opcode, 4)}  ${decodeInstruction(opcode)}`,
    });
  }
  return lines;
}
