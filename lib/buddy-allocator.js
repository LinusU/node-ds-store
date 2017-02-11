var assert = require('assert')
var makeSymbol = require('make-symbol')

var Alloc = makeSymbol('alloc')
var Free = makeSymbol('free')
var Freelist = makeSymbol('freelist')
var Offsets = makeSymbol('offsets')

function BuddyAllocator () {
  this[Offsets] = new Array(0)
  this[Freelist] = new Array(32)

  for (var i = 0; i < 32; i++) {
    this[Freelist][i] = []
  }

  this[Freelist][31].push(0)

  var head = this[Alloc](5)
  assert(head === 0)
}

BuddyAllocator.prototype[Alloc] = function (width) {
  assert(width < 32)

  var list = this[Freelist][width]

  if (list.length > 0) {
    // There is a block of the desired size; return it.

    return list.shift()
  } else {
    // Allocate a block of the next larger size; split
    // it and put the other half on the free list.

    var offset = this[Alloc](width + 1)
    var buddy = offset ^ Math.pow(2, width)

    this[Free](buddy, width)
    return offset
  }
}

BuddyAllocator.prototype[Free] = function (offset, width) {
  var list = this[Freelist][width]
  var buddy = offset ^ Math.pow(2, width)

  var idx = list.indexOf(buddy)

  if (~idx) {
    // Our buddy is free. Coalesce, and
    // add the coalesced block to freelist.

    list.splice(idx, 1)
    this[Free](offset & buddy, width + 1)
  } else {
    // Add this block to the freelist

    list.push(offset)
    // FIXME: maybe sort the list as well
  }
}

BuddyAllocator.prototype.allocate = function (bytes, blocknum) {
  if (blocknum === undefined) {
    blocknum = 1

    while (this[Offsets][blocknum] !== undefined) {
      blocknum += 1
    }
  }

  var wantwidth = 5
  while (bytes > (1 << wantwidth)) {
    wantwidth += 1
  }

  var blockaddr, blockwidth, blockoffset
  if (this[Offsets][blocknum]) {
    blockaddr = this[Offsets][blocknum]
    blockwidth = blockaddr & 0x1F
    blockoffset = blockaddr & ~0x1F
    if (blockwidth === wantwidth) {
      return blocknum
    } else {
      this[Free](blockoffset, blockwidth)
      delete this[Offsets][blocknum]
    }
  }

  blockoffset = this[Alloc](wantwidth)
  blockaddr = blockoffset | wantwidth
  this[Offsets][blocknum] = blockaddr

  return blocknum
}

module.exports = exports = BuddyAllocator
