var fs = require('fs')
var path = require('path')
var assert = require('assert')

var Entry = require('./entry')
var partition = require('./partition')
var Allocator = require('./buddy/allocator')

function toInt32BEBuffer (value) {
  var buffer = new Buffer(4)
  buffer.writeInt32BE(value)
  return buffer
}

function zip () {
  var args = [].slice.call(arguments)
  var shortest = args.length === 0
    ? []
    : args.reduce(function (a, b) {
      return a.length < b.length ? a : b
    })

  return shortest.map(function (_, i) {
    return args.map(function (array) {
      return array[i]
    })
  })
}

function DSStore (store) {
  this._store = store
  this._superblk = this._store['DSDB']
  var block = this._get_block(this._superblk)
  this._rootnode = block.read(4).readInt32BE()
  this._levels = block.read(4).readInt32BE()
  this._records = block.read(4).readInt32BE()
  this.Nodes = block.read(4).readInt32BE()
  this._pageSize = block.read(4).readInt32BE()
  this._min_usage = 2 * this._pageSize // 3
  this._dirty = false
}

DSStore.open = function (filename) {
  return DSStore(Allocator.open(filename))
}

DSStore.prototype.flush = function () {
  if (this._dirty) {
    this._dirty = false

    var block = this._get_block(this._superblk)
    var buffer = new Buffer(20)
    buffer.writeUInt32BE(this._rootnode)
    buffer.writeUInt32BE(this._levels)
    buffer.writeUInt32BE(this._records)
    buffer.writeUInt32BE(this.Nodes)
    buffer.writeUInt32BE(this._pageSize)
    block.write(buffer)
  }
  this._store.flush()
}

DSStore.prototype.close = function () {
  this.flush()
  this._store.close()
}

DSStore.prototype._traverse = function * (node) {
  if (!node) {
    node = this._rootnode
  }
  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()
  if (nextNode) {
    for (var i = 0; i < count; i++) {
      var ptr = block.read(4).readInt32BE()
      for (var e in this._traverse(ptr)) {
        yield e
      }
      yield Entry.read(block)
    }
    for (e in this._traverse(nextNode)) {
      yield e
    }
  } else {
    for (i = 0; i < count; i++) {
      e = Entry.read(block)
      yield e
    }
  }
}

DSStore.prototype._dumpNode = function (node) {
  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()
  console.log('next: ' + nextNode + '\ncount: ' + count + '\n')
  for (var i = 0; i < count; i++) {
    if (nextNode) {
      var ptr = block.read(4).readInt32BE()
      console.log('%8u ' % ptr)
    } else {
      console.log('         ')
    }
    var e = Entry.read(block)
    console.log(e, ' (%u)' % e.byte_length())
  }
  console.log('used: ' + block.tell())
}

DSStore.prototype._dump_super = function () {
  console.log('root: ' + this._rootNode)
  console.log('levels: ' + this._levels)
  console.log('records: ' + this._records)
  console.log('nodes: ' + this.Nodes)
  console.log('page-size: ' + this._pageSize)
}

DSStore.prototype.Split2 = function (blocks, entries, pointers, before, internal) {
  var leftBlock = blocks[0]
  var rightBlock = blocks[1]

  var count = entries.length

  var bestSplit, bestDiff
  var total = before[count]

  if (8 + total <= this._pageSize) {
    // We can use a *single* node for this
    bestSplit = count
  } else {
    // Split into two nodes
    for (var i = 0; i < count; i++) {
      var leftSize = 8 + before[i]
      var rightSize = 8 + total - before[i + 1]

      if (leftSize > this._pageSize) {
        break
      }
      if (rightSize > this._pageSize) {
        continue
      }

      var diff = Math.abs(leftSize - rightSize)

      if (!bestSplit || diff < bestDiff) {
        bestSplit = i
        bestDiff = diff
      }
    }
  }

  if (!bestSplit) {
    return null
  }

  // Write the nodes
  leftBlock.seek(0)
  var nextNode = internal ? pointers[bestSplit] : 0
  leftBlock.write(toInt32BEBuffer(nextNode))
  leftBlock.write(toInt32BEBuffer(bestSplit))

  for (i = 0; i < bestSplit; i++) {
    if (internal) leftBlock.write(toInt32BEBuffer(pointers[i]))
    entries[i].write(leftBlock)
  }

  leftBlock.zero_fill()

  if (bestSplit === count) return []

  rightBlock.seek(0)
  nextNode = internal ? pointers[count] : 0
  rightBlock.write(toInt32BEBuffer(nextNode))
  rightBlock.write(toInt32BEBuffer(count - bestSplit - 1))

  for (i = bestSplit + 1; i < count; i++) {
    if (internal) rightBlock.write(toInt32BEBuffer(pointers[i]))
    entries[i].write(rightBlock)
  }

  rightBlock.zero_fill()

  var pivot = entries[bestSplit]

  return [pivot]
}

DSStore.prototype.Split = function (node, entry, rightPtr) {
  this.Nodes += 1
  this._dirty = true
  rightPtr = rightPtr || 0
  var newRight = this._store.allocate(this._pageSize)
  var block = this._get_block(node)
  var rightBlock = this._get_block(newRight)

  // First, measure and extract all the elements
  var entrySize = entry.byte_length()
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()
  if (nextNode) entrySize += 4
  var pointers = []
  var entries = []
  var before = []
  var total = 0
  for (var i = 0; i < count; i++) {
    var pos = block.tell()
    if (nextNode) {
      var ptr = block.read(4).readInt32BE()
      pointers.append(ptr)
    }
    var e = Entry.read(block)
    if (e > entry) {
      entries.append(entry)
      pointers.append(rightPtr)
      before.append(total)
      total += entrySize
    }
    entries.append(e)
    before.append(total)
    total += block.tell() - pos
  }
  before.append(total)
  if (nextNode) {
    pointers.append(nextNode)
  }

  var pivot = this.Split2(
    [null, rightBlock],
    entries,
    pointers,
    before,
    nextNode
  )[0]

  this._records += 1
  this.Nodes += 1
  this._dirty = true

  return [pivot, newRight]
}

// Allocate a new root node containing the element `pivot' and the pointers
// `left' and `right'
DSStore.prototype._new_root = function (left, pivot, right) {
  var newRoot = this._store.allocate(this._pageSize)
  var block = this._get_block(newRoot)
  block.write(toInt32BEBuffer(right))
  block.write(toInt32BEBuffer(1))
  block.write(toInt32BEBuffer(left))
  pivot.write(block)
  this._rootnode = newRoot
  this._levels += 1
  this.Nodes += 1
  this._dirty = true
}

// Insert an entry into an inner node; `path' is the path from the root
// to `node', not including `node' itthis.  `rightPtr' is the new node
// pointer (inserted to the RIGHT of `entry')
DSStore.prototype._insert_inner = function (path, node, entry, rightPtr) {
  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()
  var insertPos
  var insertNdx
  var n = 0
  while (n < count) {
    var pos = block.tell()
    var ptr = block.read(4).readInt32BE()
    var e = Entry.read(block)
    if (e === entry) {
      if (n === count - 1) {
        rightPtr = nextNode
        nextNode = ptr
        block_seek(pos)
      } else {
        rightPtr = block.read(4).readInt32BE()
        block.seek(pos + 4)
      }
      insertPos = pos
      insertNdx = n
      block.delete(e.byte_length() + 4)
      count -= 1
      this._records += 1
      this._dirty = true
      continue
    } else if (!insertPos && e > entry) {
      insertPos = pos
      insertNdx = n
    }
    n += 1
  }
  if (!insertPos) {
    insertPos = block.tell()
    insertNdx = count
  }
  var remaining = this._pageSize - block.tell()

  if (remaining < entry.byte_length() + 4) {
    var split = this.Split(node, entry, rightPtr)
    var pivot = split[0]
    var newRight = split[1]
    if (path) {
      this._insert_inner(path.slice(0, -1), path.slice(-1), pivot, newRight)
    } else {
      this._new_root(node, pivot, newRight)
    }
  } else {
    if (insertNdx === count) {
      block.seek(insertPos)
      block.write(toInt32BEBuffer(nextNode))
      entry.write(block)
      nextNode = rightPtr
    } else {
      block.seek(insertPos + 4)
      entry.write(block, true)
      block.insert(toInt32BEBuffer(rightPtr))
    }
    block.seek(0)
    count += 1
    block.write(toInt32BEBuffer(nextNode))
    block.write(toInt32BEBuffer(count))
    this._records += 1
    this._dirty = true
  }
}

// Insert `entry' into the leaf node `node'
DSStore.prototype._insert_leaf = function (path, node, entry) {
  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()
  var insertPos = null
  var n = 0
  while (n < count) {
    var pos = block.tell()
    var e = Entry.read(block)
    if (e === entry) {
      insertPos = pos
      block.seek(pos)
      block.delete(e.byte_length())
      count -= 1
      this._records += 1
      this._dirty = true
      continue
    } else if (!insertPos && e > entry) {
      insertPos = pos
    }
    n += 1
  }
  if (!insertPos) {
    insertPos = block.tell()
  }
  var remaining = this._pageSize - block.tell()

  if (remaining < entry.byte_length()) {
    var split = this.Split(node, entry)
    var pivot = split[0]
    var newRight = split[1]
    if (path) {
      this._insert_inner(path.slice(0, -1), path.slice(-1), pivot, newRight)
    } else {
      this._new_root(node, pivot, newRight)
    }
  } else {
    block.seek(insertPos)
    entry.write(block, true)
    block.seek(0)
    count += 1
    block.write(toInt32BEBuffer(nextNode))
    block.write(toInt32BEBuffer(count))
    this._records += 1
    this._dirty = true
  }
}

DSStore.prototype.insert = function (entry) {
  // Insert ``entry`` (which should be a :class:`DSStoreEntry`) into the B-Tree.
  var path = []
  var node = this._rootnode
  while (true) {
    var block = this._get_block(node)
    var nextNode = block.read(4).readInt32BE()
    var count = block.read(4).readInt32BE()
    if (nextNode) {
      for (var i = 0; i < count; i++) {
        var ptr = block.read(4).readInt32BE()
        var e = Entry.read(block)
        if (entry < e) {
          nextNode = ptr
          break
        } else if (entry === e) {
          // If we find an existing entry the same, replace it
          this._insert_inner(path, node, entry, null)
          return
        }
      }
      path.append(node)
      node = nextNode
    } else {
      this._insert_leaf(path, node, entry)
      return
    }
  }
}

// Return usage information for the specified `node'
DSStore.prototype._block_usage = function (node) {
  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()

  for (var i = 0; i < count; i++) {
    if (nextNode) {
      block.read(4).readInt32BE()
    }
    Entry.read(block)
  }

  var used = block.tell()

  return [count, used]
}

// Splits entries across three blocks, returning two pivots
DSStore.prototype.Split3 = function (blocks, entries, pointers, before, internal) {
  var count = entries.length

  // Find the feasible splits
  var bestSplit = null
  var bestDiff = null
  var total = before[count]
  for (var i = 1; i < count - 3; i++) {
    var leftSize = 8 + before[i]
    var remaining = 16 + total - before[i + 1]

    if (leftSize > this._pageSize) {
      break
    }
    if (remaining > 2 * this._pageSize) {
      continue
    }

    for (var j = i + 2; j < count - 1; j++) {
      var midSize = 8 + before[j] - before[i + 1]
      var rightSize = 8 + total - before[j + 1]

      if (midSize > this._pageSize) {
        break
      }
      if (rightSize > this._pageSize) {
        continue
      }

      var diff = Math.abs(leftSize - midSize) * Math.abs(rightSize - midSize)

      if (bestSplit || diff < bestDiff) {
        bestSplit = [i, j, count]
        bestDiff = diff
      }
    }
  }

  if (!bestSplit) {
    return null
  }

  // Write the nodes
  var prevSplit = -1
  for (var x in zip(blocks, bestSplit)) {
    var block = x[0]
    var split = x[1]
    block.seek(0)

    var nextNode = internal ? pointers[split] : 0
    block.write(toInt32BEBuffer(nextNode))
    block.write(toInt32BEBuffer(split))

    for (i = prevSplit + 1; i < split; i++) {
      if (internal) {
        block.write(toInt32BEBuffer(pointers[i]))
      }
      entries[i].write(block)
    }

    block.zero_fill()

    prevSplit = split
  }

  return [entries[bestSplit[0]], entries[bestSplit[1]]]
}

// Extract all of the entries from the specified list of `blocks',
// separating them by the specified `pivots'.  Also computes the
// amount of space used before each entry.
DSStore.prototype._extract = function (blocks, pivots) {
  var pointers = []
  var entries = []
  var before = []
  var total = 0
  var ppivots = pivots + [ null ]
  for (var x in zip(blocks, ppivots)) {
    var b = x[0]
    var p = x[1]
    b.seek(0)
    var nextNode = b.read(4).readInt32BE()
    var count = b.read(4).readInt32BE()
    for (var i = 0; i < count; i++) {
      var pos = b.tell()
      if (nextNode) {
        var ptr = b.read(4).readInt32BE()
        pointers.append(ptr)
      }
      var e = Entry.read(b)
      entries.append(e)
      before.append(total)
      total += b.tell() - pos
    }
    if (nextNode) {
      pointers.append(nextNode)
    }
    if (p) {
      entries.append(p)
      before.append(total)
      total += p.byte_length()
      if (nextNode) {
        total += 4
      }
    }
  }
  before.append(total)

  return [entries, pointers, before]
}

// Rebalance the specified `node', whose path from the root is `path'.
DSStore.prototype._rebalance = function (path, node) {
  // Can't rebalance the root
  if (!path) {
    return
  }

  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()

  var parent = this._get_block(path.slice(-1))
  // Find the left and right siblings and respective pivots
  var parentNext = parent.read(4).readInt32BE()
  var parentCount = parent.read(4).readInt32BE()
  var leftPos = null
  var leftNode = null
  var leftPivot = null
  var nodePos = null
  var rightPos = null
  var rightNode = null
  var rightPivot = null
  var prevEntry = null
  var prevPtr = null
  var prevPos = null
  for (var i = 0; i < parentCount; i++) {
    var pos = parent.tell()
    var ptr = parent.read(4).readInt32BE()
    e = Entry.read(parent)

    if (ptr === node) {
      nodePos = pos
      rightPivot = e
      leftPos = prevPos
      leftPivot = prevEntry
      leftNode = prevPtr
    } else if (prevPtr === node) {
      rightNode = ptr
      rightPos = pos
      break
    }

    prevEntry = e
    prevPtr = ptr
    prevPos = pos
  }

  if (parentNext === node) {
    nodePos = parent.tell()
    leftPos = prevPos
    leftPivot = prevEntry
    leftNode = prevPtr
  } else if (!rightNode) {
    rightNode = parentNext
    rightPos = parent.tell()
  }

  parent.tell()

  if (leftNode && rightNode) {
    var left = this._get_block(leftNode)
    var right = this._get_block(rightNode)
    var blocks = [left, block, right]
    var pivots = [leftPivot, rightPivot]

    var extracted = this._extract(blocks, pivots)
    var entries = extracted[0]
    var pointers = extracted[1]
    var before = extracted[2]

    // If there's a chance that we could use two pages instead
    // of three, go for it
    pivots = this._split2(blocks, entries, pointers, before, !!nextNode)
    if (!pivots) {
      var ptrs = [ leftNode, node, rightNode ]
      pivots = this._split3(blocks, entries, pointers, before, Boolean(nextNode))
    } else {
      if (pivots) {
        ptrs = [leftNode, node]
      } else {
        ptrs = [leftNode]
        this._store.release(node)
        this.Nodes -= 1
        node = leftNode
      }
      this._store.release(rightNode)
      this.Nodes -= 1
      this._dirty = true
    }

    // Remove the pivots from the parent
    parent = this._get_block(path.slice(-1))
    if (rightNode === parentNext) {
      parent.seek(leftPos)
      parent.delete(rightPos - leftPos)
      parentNext = leftNode
    } else {
      parent.seek(leftPos + 4)
      parent.delete(rightPos - leftPos)
    }
    parent.seek(0)
    parentCount -= 2
    parent.write(toInt32BEBuffer(parentNext))
    parent.write(toInt32BEBuffer(parentCount))
    this._records -= 2

    // Replace with those in pivots
    for (var x in zip(pivots, ptrs.slice(1))) {
      var e = x[0]
      var rp = x[1]
      this._insert_inner(path.slice(0, -1), path.slice(-1), e, rp)
    }
  } else if (leftNode) {
    left = this._get_block(leftNode)
    blocks = [left, block]
    pivots = [leftPivot]

    extracted = this._extract(blocks, pivots)
    entries = extracted[0]
    pointers = extracted[1]
    before = extracted[2]

    pivots = this._split2(blocks, entries, pointers, before, Boolean(nextNode))

    // Remove the pivot from the parent
    parent = this._get_block(path.slice(-1))
    if (node === parentNext) {
      parent.seek(leftPos)
      parent.delete(nodePos - leftPos)
      parentNext = leftNode
    } else {
      parent.seek(leftPos + 4)
      parent.delete(nodePos - leftPos)
    }
    parent.seek(0)
    parentCount -= 1
    parent.write(toInt32BEBuffer(parentNext))
    parent.write(toInt32BEBuffer(parentCount))
    this._records -= 1

    // Replace the pivot
    if (pivots) {
      this._insert_inner(path.slice(0, -1), path.slice(-1), pivots[0], node)
    }
  } else if (rightNode) {
    right = this._get_block(rightNode)
    blocks = [block, right]
    pivots = [rightPivot]

    extracted = this._extract(blocks, pivots)
    entries = extracted[0]
    pointers = extracted[1]
    before = extracted[2]

    pivots = this._split2(blocks, entries, pointers, before, Boolean(nextNode))

    // Remove the pivot from the parent
    parent = this._get_block(path.slice(-1))
    if (rightNode === parentNext) {
      parent.seek(pos)
      parent.delete(rightPos - nodePos)
      parentNext = node
    } else {
      parent.seek(pos + 4)
      parent.delete(rightPos - nodePos)
    }
    parent.seek(0)
    parentCount -= 1
    parent.write(toInt32BEBuffer(parentNext))
    parent.write(toInt32BEBuffer(parentCount))
    this._records -= 1

    // Replace the pivot
    if (pivots) {
      this._insert_inner(path.slice(0, -1), path.slice(-1), pivots[0], rightNode)
    }
  }

  if (!path && !parentCount) {
    this._store.release(path.slice(-1))
    this.Nodes -= 1
    this._dirty = true
    this._rootnode = node
  } else {
    var bs = this._block_usage(path.slice(-1))
    var used = bs[1]

    if (used < this._page_size) {
      this._rebalance(path.slice(0, -1), path.slice(-1))
    }
  }
}

// Delete from the leaf node `node'.  `filenameLc' has already been
// lower-cased.
DSStore.prototype._delete_leaf = function (node, filenameLc, code) {
  var found = false

  var block = this._get_block(node)
  var nextNode = block.read(4).readInt32BE()
  var count = block.read(4).readInt32BE()

  for (var i = 0; i < count; i++) {
    var pos = block.tell()
    var e = Entry.read(block)
    if (e.filename.lower() === filenameLc && (!code || e.code === code)) {
      block.seek(pos)
      block.delete(e.byte_length())
      found = true

      // This does not affect the loop; THIS IS NOT A BUG
      count -= 1

      this._records -= 1
      this._dirty = true
    }
  }

  if (found) {
    var used = block.tell()

    block.seek(0)
    block.write(toInt32BEBuffer(nextNode))
    block.write(toInt32BEBuffer(count))

    return used < this._page_size
  } else {
    return false
  }
}

DSStore.prototype[Symbol.iterator] = function () {
  this._traverse()
}

DSStore.prototype.push = function (entry) {
  this.entries.push(entry)
}

DSStore.prototype._header = function (offset, size) {
  var header = new Buffer(36)

  header.writeUInt32BE(1, 0)
  header.write('Bud1', 0, 'ascii')

  header.writeUInt32BE(offset, 4)
  header.writeUInt32BE(size, 8)
  header.writeUInt32BE(offset, 12)

  header.writeUInt32BE(0x100C, 16)
  header.writeUInt32BE(0x0000, 20) // 0x0087
  header.writeUInt32BE(0x0000, 24) // 0x200B
  header.writeUInt32BE(0x0000, 28)

  return header
}

DSStore.prototype.Entryntries = function () {
  var tocblock
  var pagesize = 0x1000

  if ('DSDB' in this.store.toc) {
    throw new Error('Not implemented')
  }

  tocblock = this.store.allocate(20)
  this.store.toc['DSDB'] = tocblock

  var pagecount, reccount, height, children

  reccount = this.entries.length
  pagecount = 0
  height = 0
  children = []

  do {
    var sizes

    if (children.length > 0) {
      sizes = this.entries.map(function (e) { return 4 + e.length() })
    } else {
      sizes = this.entries.map(function (e) { return e.length() })
    }

    var interleaf = partition.sizes(pagesize - 8, sizes)
    var nchildren = []
    var next = 0

    throw new Error('Not implemented')
  } while (children.length > 1)
}

// sub putDSDBEntries {
//     my(@children);

//     # Partition the records into btree nodes, from the bottom of
//     # the tree working towards the root.
//     do {
//         my(@sizes);

//         if (@children) {
//             # Interior node: child pointers interleaved with records
//             @sizes = map { 4 + $_->byteSize } @$recs;
//         } else {
//             # Leaf node: just a bunch of records
//             @sizes = map { $_->byteSize } @$recs;
//         }

//         # In addition to @sizes, each page contains a record
//         # count and a flag/childnode field (4 bytes each)
//         my(@interleaf) = &partitionSizes($pagesize - 8, @sizes);
//         my(@nchildren);

//         my($next) = 0;
//         foreach my $non (@interleaf, 1+$#$recs) {
//             my($blknr) = $file->allocate($pagesize);
//             push(@nchildren, $blknr);
//             my($blk) = $file->blockByNumber($blknr, 1);
//             if (@children) {
//                 &writeBTreeNode($blk,
//                                 [ @$recs[ $next .. $non-1 ] ],
//                                 [ @children[ $next .. $non ] ] );
//             } else {
//                 &writeBTreeNode($blk,
//                                 [ @$recs[ $next .. $non-1 ] ]);
//             }
//             $blk->close(1);
//             $next = $non + 1;
//             $pagecount ++;
//         }

//         $height ++;
//         $recs = [ map { $recs->[$_] } @interleaf ];
//         @children = @nchildren;
//         die unless @children == 1+@$recs;
//     } while(@children > 1);
//     die unless 0 == @$recs;

//     my($masterblock) = $file->blockByNumber($tocblock, 1);
//     $masterblock->write('NNNNN',
//                         $children[0],
//                         $height - 1,
//                         $reccount,
//                         $pagecount,
//                         $pagesize);
//     $masterblock->close;

//     1;
// }
//
DSStore.prototype.write = function (filePath, cb) {
  var store = new Buffer(15360)
  var offset = 8192
  var size = 2048
  var currentPos = 0

  store.fill(0)

  this._header(offset, size).copy(store, currentPos)
  currentPos += 32

  var blockAddresses = [
    0x0000200B,
    0x00000045,
    0x0000100C
  ]

  currentPos = offset
  store.writeUInt32BE(blockAddresses.length, currentPos)
  store.writeUInt32BE(0, currentPos + 4)

  currentPos += 8

  store.fill(0, currentPos, currentPos + (256 * 4))

  blockAddresses.forEach(function (e, i) {
    store.writeUInt32BE(e, currentPos + (i * 4))
  })

  currentPos += (256 * 4)

  var directoryEntries = [
    'DSDB'
  ]

  store.writeUInt32BE(directoryEntries.length, currentPos)
  currentPos += 4

  directoryEntries.forEach(function (e, i) {
    var b = new Buffer(e, 'ascii')
    store.writeUInt8(b.length, currentPos)
    b.copy(store, currentPos + 1)
    store.writeUInt32BE(i + 1, currentPos + 1 + b.length)
    currentPos += 1 + b.length + 4
  })

  var freeList = [
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
  ]

  assert(freeList.length === 32)
  assert(freeList[31].length === 0)

  freeList.forEach(function (e) {
    store.writeUInt32BE(e.length, currentPos)
    e.forEach(function (e, i) {
      store.writeUInt32BE(e, currentPos + 4 + (i * 4))
    })
    currentPos += 4 + (e.length * 4)
  })

  /*
   * Maybe jump to blockAddresses[0] (+- 4/8 bytes) and write something like:
   *
   *  00 00 20 0B
   *  00 00 00 45
   *  00 00 10 0C
   *  00 00 00 00
   *
   */

  // <No fucking idea>

  var entries = this.entries.sort(Entry.sort);

  // should have something to do with blockAddresses[2]
  [4096].forEach(function (e) {
    currentPos = e

    var P = 0
    var count = entries.length

    store.writeUInt32BE(P, currentPos)
    store.writeUInt32BE(count, currentPos + 4)
    currentPos += 8

    entries.forEach(function (e, i) {
      e.buffer.copy(store, currentPos)
      currentPos += e.buffer.length
    })
  })

  // </No fucking idea>

  var out = fs.createWriteStream(filePath)

  out.on('finish', cb)

  out.write(new Buffer('00000001', 'hex'))
  out.write(store)

  out.end()
}

// DSStore.prototype.write = function (filePath, cb) {
//   var entries = this.entries.sort(Entry.sort)

//   fs.readFile(path.join(__dirname, '/../assets/DSStore-clean'), function (err, buf) {
//     if (err) return cb(err)

//     var modified = new Buffer(3840)

//     modified.fill(0)

//     var currentPos = 0

//     var P = 0
//     var count = entries.length

//     modified.writeUInt32BE(P, currentPos)
//     modified.writeUInt32BE(count, currentPos + 4)
//     currentPos += 8

//     entries.forEach(function (e) {
//       console.log(e.structureId, e.buffer.length, currentPos, e.buffer)
//       var b = e.buffer
//       b.copy(modified, currentPos)
//       currentPos += b.length
//     })

//     buf.writeUInt32BE(entries.length, 76)
//     modified.copy(buf, 4100)

//     fs.writeFile(filePath, buf, function (err) {
//       cb(err)
//     })
//   })
// }

module.exports = exports = DSStore
