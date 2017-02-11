var fs = require('fs')
var bisect = require('bisection')
var assert = require('assert')
var equal = require('deep-equal')
const integerBitLength = require('integer-bit-length')

var Block = require('./block')

function toInt32BEBuffer (value) {
  var buffer = new Buffer(4)
  buffer.writeInt32BE(value)
  return buffer
}

class Allocator {
  constructor (file) {
    this._file = file
    this._dirty = false

    // Read the header
    var header = this._readHeader()

    if (header.magic1 !== 1 || header.magic2 !== 'Bud1') {
      throw Error('Not a buddy file')
    }

    if (header.offset !== header.offset2) {
      throw Error('Root addresses differ')
    }

    this._unknown1 = header.unknown
    this._root = new Block(this, header.offset, header.size)

    assert.equal(this._root.size, 2048)
    assert.equal(this._root.pos, 0)

    // Read the block offsets
    var count = this._root.read(4).readInt32BE()
    this._unknown2 = this._root.read(4).readInt32BE()

    assert.equal(count, 3)
    assert.equal(this._unknown2, 0)

    this._offsets = []
    var c = (count + 255) & ~255

    assert.equal(c, 256)

    while (c) {
      for (var i = 0; i < 256; i++) {
        this._offsets.push(this._root.read(4).readInt32BE())
      }
      c -= 256
    }
    this._offsets.splice(count)

    // Read the TOC
    this._toc = {}
    count = this._root.read(4).readInt32BE()
    for (i = 0; i < count; i++) {
      var nlen = this._root.read(1).readInt8()
      var name = this._root.read(nlen).toString('ascii')
      var value = this._root.read(4).readInt32BE()
      this._toc[name] = value
    }

    console.log(this._toc)

    var counts = [ 0, 0, 0, 0, 0, 2,
                  0, 1, 1, 1, 1, 2,
                  1, 0, 1, 1, 1, 1,
                  1, 1, 1, 1, 1, 1,
                  1, 1, 1, 1, 1, 1,
                  1, 0 ]

    // Read the free lists
    this._free = []
    for (i = 0; i < 32; i++) {
      count = this._root.read(4).readInt32BE()
      assert.equal(count, counts[i])
      var child = []
      for (var j = 0; j < count; j++) {
        child.push(this._root.read(4).readInt32BE())
      }
      this._free.push(child)
    }

    assert(equal(this._offsets, [8203, 69, 4108]))
    assert(equal(this._free, [
      [],
      [],
      [],
      [],
      [],
      [32, 96],
      [],
      [128],
      [256],
      [512],
      [1024],
      [2048, 10240],
      [12288],
      [],
      [16384],
      [32768],
      [65536],
      [131072],
      [262144],
      [524288],
      [1048576],
      [2097152],
      [4194304],
      [8388608],
      [16777216],
      [33554432],
      [67108864],
      [134217728],
      [268435456],
      [536870912],
      [1073741824],
      []
    ]))
  }

  _readHeader () {
    var buffer = this.read(-4, 36)

    return {
      magic1: buffer.readInt32BE(0),
      magic2: buffer.slice(4, 8).toString('ascii'),
      offset: buffer.readInt32BE(8),
      size: buffer.readInt32BE(12),
      offset2: buffer.readInt32BE(16),
      unknown: buffer.readInt32BE(20)
    }
  }

  _writeHeader (offset, size) {
    var header = new Buffer(36)

    header.writeUInt32BE(1, 0)
    header.write('Bud1', 4, 'ascii')

    header.writeUInt32BE(offset, 8)
    header.writeUInt32BE(size, 12)
    header.writeUInt32BE(offset, 16)

    header.writeUInt32BE(0x100C, 20)
    header.writeUInt32BE(0x0000, 24) // 0x0087
    header.writeUInt32BE(0x0000, 28) // 0x200B
    header.writeUInt32BE(0x0000, 32)

    return header
  }

  close () {
    this.flush()
    fs.closeSync(this._file)
  }

  flush () {
    if (this._dirty) {
      var size = this._rootBlockSize()
      this.allocate(size, 0)
      this._writeRootBlockInto(this.getBlock(0))

      var addr = this._offsets[0]
      var offset = addr & ~0x1f
      size = 1 << (addr & 0x1f)

      this.write(-4, this._writeHeader(offset, size))

      this._dirty = false
    }

    this._file.flush()
  }

  read (offset, size) {
    var buffer = new Buffer(size)
    buffer.fill(0)

    // N.B. There is a fixed offset of four bytes(!)
    fs.readSync(this._file, buffer, 0, size, 4 + offset)
    return buffer
  }

  write (offset, data) {
    // N.B. There is a fixed offset of four bytes(!)
    fs.writeSync(this._file, data, 0, data.length, offset + 4)
  }

  getBlock (block) {
    var addr = this._offsets[block]
    if (!addr) return null

    var offset = addr & ~0x1f
    var size = 1 << (addr & 0x1f)

    return new Block(this, offset, size)
  }

  _rootBlockSize () {
    /* Return the number of bytes required by the root block.*/
    // Offsets
    var size = 8 + 4 * ((this._offsets.length + 255) & ~255)

    // TOC
    size += 4
    size += this._toc.map(s => 5 + s.length).reduce((l, r) => l + r, 0)

    // Free list
    size += this._free.map(fl => 4 + 4 * fl.length).reduce((l, r) => l + r, 0)

    return size
  }

  _writeRootBlockInto (block) {
    // Offsets
    block.write(toInt32BEBuffer(this._offsets.length))
    block.write(toInt32BEBuffer(this._unknown2))
    for (let i = 0; i < this._offsets.length; i++) {
      block.write(toInt32BEBuffer(this._offsets[i]))
    }

    const extra = this._offsets.length & 255
    if (extra) {
      const zeroPad = new Buffer(4 * (256 - extra))
      zeroPad.fill(0)
      block.write(zeroPad)
    }

    // TOC
    const keys = Object.keys(this._toc).sort()

    block.write(toInt32BEBuffer(keys.length))
    for (let key of keys) {
      const buffer = buffer.from(key)
      block.write(Buffer.from([buffer.length]))
      block.write(buffer)
      block.write(toInt32BEBuffer(this._toc[key]))
    }

    // Free list
    for (const f of this._free) {
      block.write(toInt32BEBuffer(f.length))
      if (f.length) {
        for (let i = 0; i < f.length; i++) {
          block.write(toInt32BEBuffer(f[i]))
        }
      }
    }
  }

  _release (offset, width) {
    var free
    // Coalesce
    while (true) {
      free = this._free[width]
      var b = offset ^ (1 << width)
      var index = free.indexOf(b)

      if (!index) {
        break
      }

      offset = offset & b
      width += 1
      free.splice(index, 1)
    }

    // Add to the list
    bisect.insort_right(free, offset)

    // Mark as dirty
    this._dirty = true
  }

  _alloc (width) {
    var w = width
    while (!this._free[w]) {
      w += 1
    }
    while (w > width) {
      var offset = this._free[w].pop(0)
      w -= 1
      this._free[w] = [offset, offset ^ (1 << w)]
    }
    this._dirty = true
    return this._free[width].pop(0)
  }

  allocate (bytes, block) {
    // Allocate or reallocate a block such that it has space for at least `bytes` bytes.
    if (!block) {
      // Find the first unused block
      block = this._offsets.indexOf(0)
      if (block === -1) {
        block = this._offsets.length
        this._offsets.append(0)
      }
    }

    // Compute block width
    var width = Math.max(integerBitLength(bytes), 5)

    var addr = this._offsets[block]
    var offset = addr & ~0x1f

    if (addr) {
      var blockWidth = addr & 0x1f
      if (blockWidth === width) return block
      this._release(offset, width)
      this._offsets[block] = 0
    }

    offset = this._alloc(width)
    this._offsets[block] = offset | width
    return block
  }

  release (block) {
    var addr = this._offsets[block]

    if (addr) {
      var width = addr & 0x1f
      var offset = addr & ~0x1f
      this._release(offset, width)
    }

    if (block === this._offsets.length) {
      this._offsets.splice(block, block)
    } else {
      this._offsets[block] = 0
    }
  }
}

module.exports = Allocator

Allocator.open = function (path, mode = 'r+') {
  var fd = fs.openSync(path, mode)

  if (mode.includes('w')) {
    // An empty root block needs 1264 bytes:
    //
    //     0  4       offset count
    //     4  4       unknown
    //     8  4       root block offset (2048)
    //    12  255 * 4 padding (offsets are in multiples of 256)
    //  1032  4       toc count (0)
    //  1036  228     free list
    //  total 1264

    // The free list will contain the following:
    //
    //     0  5 * 4   no blocks of width less than 5
    //    20  6 * 8   1 block each of widths 5 to 10
    //    68  4       no blocks of width 11 (allocated for the root)
    //    72  19 * 8  1 block each of widths 12 to 30
    //   224  4       no blocks of width 31
    // total  228
    //
    // (The reason for this layout is that we allocate 2**5 bytes for
    //  the header, which splits the initial 2GB region into every size
    //  below 2**31, including *two* blocks of size 2**5, one of which
    //  we take.  The root block itthis then needs a block of size
    //  2**11.  Conveniently, each of these initial blocks will be
    //  located at offset 2**n where n is its width.)

    // Write the header
    const header = new Buffer(96)
    header.writeUInt32BE(1, 0)
    header.write('Bud1', 4, 16, 'ascii')
    header.writeUInt32BE(2048, 20)
    header.writeUInt32BE(1264, 24)
    header.writeUInt32BE(2048, 28)
    header.write('\x00\x00\x10\x0c\x00\x00\x00\x87\x00\x00\x20\x0b\x00\x00\x00\x00')
    fs.writeSync(fd, header)
    fs.writeSync(fd, Buffer.alloc(2016))

    // Write the root block
    const freeList = [Buffer.alloc(20)]
    for (let n = 5; n < 11; n++) {
      const buffer = new Buffer(8)
      buffer.writeUInt32BE(1, 0)
      buffer.writeUInt32BE(Math.pow(2, n), 4)
      freeList.append(buffer)
    }
    freeList.append(Buffer.alloc(4))
    for (let n = 12; n < 31; n++) {
      const buffer = new Buffer(8)
      buffer.writeUInt32BE(1, 0)
      buffer.writeUInt32BE(Math.pow(2, n), 4)
      freeList.append(buffer)
    }
    freeList.append(Buffer.alloc(4))

    const a = new Buffer(12)
    a.writeUInt32BE(1)
    a.writeUInt32BE(0, 4)
    a.writeUInt32BE(2048 | 5, 8)
    const root = [a, Buffer.alloc(1024)]

    fs.write(fd, Buffer.concat([root, freeList]))
  }

  return new Allocator(fd)
}
