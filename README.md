# chip8 emulator

A CHIP-8 virtual machine written from scratch in plain JavaScript: the full 35 instruction opcode table, a disassembler, a Node test suite, and a browser front end with a canvas display, a 16 key keypad, and Web Audio beeping. No emulation libraries, no framework, no build step.

## Why this exists

CHIP-8 is a tiny interpreted instruction set from the 1970s designed to make writing simple games easy on underpowered hardware. It is small enough that a single person can implement the entire instruction set correctly and understand every opcode, which makes it a good vehicle for demonstrating what an emulator actually is: a fetch, decode, execute loop over a flat block of memory, with a handful of registers, a call stack, and two countdown timers driving graphics and sound.

Most of the other projects in this account are "from scratch" reimplementations of algorithms (search, compression, consensus, and so on). This one is different in kind: it is a reimplementation of a piece of virtual hardware, opcode for opcode, including the specific quirks (register shift semantics, index register auto increment on register dump and load) that real CHIP-8 programs from the era depend on.

## What is implemented

* `src/chip8.js`, the `Chip8` class: 4KB of memory, 16 general purpose registers plus the index register, a 16 level call stack, delay and sound timers, a 64 by 32 monochrome display buffer, 16 key input state, and every one of the 35 standard opcodes (arithmetic, control flow, memory, timers, input, and drawing).
* `src/disassembler.js`: decodes raw ROM bytes into readable assembly (`0x200  600A  LD V0, 0x0A`), used both by the browser debugger panel and directly testable on its own.
* `src/demo-rom.js`: a small original demo program, generated programmatically rather than hand copied as raw bytes, that draws all sixteen built in hex digit sprites to the screen and then loops. It exists so the emulator is watchable the moment you open `index.html`, with no external ROM file required.
* `index.html`: loads any `.ch8` ROM from disk, or the built in demo, and runs it on a canvas with a live disassembly view, register and timer readout, a clickable keypad, keyboard input, an adjustable execution speed slider, and a square wave beep tied to the sound timer.
* `tests/chip8.test.js`: 32 tests over Node's built in test runner covering every opcode family, timer edge behavior, sprite drawing and collision, screen wrapping, the disassembler, and an end to end run of the demo ROM.

## How to run it

Open `index.html` directly in a browser (no server or build step needed, since it is loaded as a plain ES module). Click "Load demo ROM" to see it draw immediately, or choose a `.ch8` ROM file of your own. The keypad maps the classic CHIP-8 hex layout onto `1234 / QWER / ASDF / ZXCV`.

To run the test suite you need Node 18 or later:

```
npm test
```

which just runs `node --test tests/`, no dependencies to install.

## Design decisions

**Manual quirk choices, not "whichever is convenient."** CHIP-8 does not have a single canonical spec; different original interpreters disagreed on a few instructions, and modern ROMs sometimes assume one behavior or the other. This implementation follows the original COSMAC VIP behavior on the two points that matter most: `8xy6`/`8xyE` (shift) read from `Vy` and write into `Vx` rather than shifting `Vx` in place, and `Fx55`/`Fx65` (register dump and load) advance the index register by `x + 1` as a side effect rather than leaving it untouched. Both choices are called out at the point of implementation in `chip8.js` and covered by dedicated tests, so a reader does not have to guess which convention was picked.

**Sprites wrap at screen edges.** `Dxyn` computes each pixel's position modulo the screen width and height rather than clipping at the edge. This is the more commonly implemented behavior and is covered by a dedicated wraparound test.

**An original demo ROM instead of a bundled game.** Classic CHIP-8 demo ROMs (Pong, Tetris, and the like) are still under a specific author's terms in most re-distributed ROM packs, so rather than bundle one, `demo-rom.js` assembles its own tiny program in code: it loops over the sixteen built in font glyphs, looks up each one's sprite address, and draws it to a fixed position, ending in a self jump. The bytes are generated from small helper functions that encode each instruction (`op6xkk`, `opDxyn`, and so on) rather than typed in as a raw byte array, so the assembly comments and the machine code cannot silently drift apart, and the same generator is reused as a fixture in the test suite.

**Testing strategy: one test per opcode's actual semantics, not just "it runs."** Instructions like `8xy4` (add with carry) and `8xy5`/`8xy7` (subtract with borrow) are exactly the kind of code where a sign error or a swapped operand compiles fine and produces a subtly wrong emulator, so the test suite asserts on the exact register and flag values for both the carry and no carry paths, rather than only checking that `step()` does not throw. The disassembler is tested independently of the CPU, and there is one integration test that loads the demo ROM and runs it to completion, checking that pixels actually end up lit and that the trailing jump is a genuine infinite self loop.

**Timers as their own clock.** Real CHIP-8 hardware decrements the delay and sound timers at a fixed 60Hz regardless of how fast instructions execute. `tickTimers()` is a separate method from `step()` for exactly this reason: the browser front end drives instruction throughput off a user adjustable speed slider, but always drives timers off wall clock time, matching real hardware and keeping game timing correct independent of emulation speed.
