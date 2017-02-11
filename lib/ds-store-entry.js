function toUInt32BEBuffer (value) {
  var buffer = new Buffer(4)
  buffer.writeInt32BE(value)
  return buffer
}

class DsStoreEntry {
  constructor (filename, code, typeCode, value) {
    if (Buffer.isBuffer(filename)) filename = filename.toString()
    this.filename = filename
    this.code = code
    this.type = typeCode
    this.value = value
  }

  byteLength () {
    // Compute the length of this entry, in bytes
    const utf16 = Buffer.from(this.filename, 'utf-16be')
    let length = 4 + utf16.length + 8

    let entryType
    let value
    if (typeof this.type === 'string') {
      entryType = this.type
      value = this.value
    } else {
      entryType = 'blob'
      value = Buffer.from(this.type, this.value)
    }

    if (entryType === 'bool') {
      length += 1
    } else if (entryType === 'long' || entryType === 'shor') {
      length += 4
    } else if (entryType === 'blob') {
      length += 4 + value.length
    } else if (entryType === 'ustr') {
      utf16 = value.encode('utf-16be')
      length += 4 + utf16.length
    } else if (entryType === 'type') {
      length += 4
    } else if (entryType === 'comp' || entryType === 'dutc') {
      length += 8
    } else {
      throw new Error(`Unknown type code '${entryType}'`)
    }

    return length
  }

  write (self, block, insert=False) {
    // Write this entry to the specified Block
    const w = insert ? block.insert : block.write

    let entryType
    let value
    if (typeof this.type === 'string') {
      entryType = this.type
      value = this.value
    } else {
      entryType = 'blob'
      value = Buffer.from(this.type, this.value)
    }

    const utf16 = Buffer.from(this.filename, 'utf-16be')
    w(toUInt32BEBuffer(utf16.length / 2))
    w(utf16)
    w(Buffer.from(self.code + entry_type))

    if (entry_type == 'bool') {
      w(b'>?', value)
    } else if (entry_type == 'long' or entry_type == 'shor') {
      w(toUInt32BEBuffer(value))
    } else if (entry_type == 'blob') {
      w(toUInt32BEBuffer(value.length))
      w(value)
    } else if (entry_type == 'ustr') {
      utf16 = value.encode('utf-16be')
      w(toUInt32BEBuffer(value.length / 2))
      w(Buffer.from(this.filename, 'utf-16be'))
    } else if (entry_type == 'type') {
      w(b'>4s', value.encode('utf-8'))
    } else if (entry_type == 'comp' or entry_type == 'dutc') {
      w(b'>Q', value)
    } else {
      throw new Error(`Unknown type code '${entryType}'`)
    }
  }
}

DsStoreEntry.compare = function (leftEntry, rightEntry) {
  if (!(leftEntry instanceof DsStoreEntry)) throw new TypeError(`Expected DsStoreEntry got ${leftEntry && leftEntry.name ? leftEntry.name : leftEntry}`)
  if (!(rightEntry instanceof DsStoreEntry)) throw new TypeError(`Expected DsStoreEntry got ${rightEntry && rightEntry.name ? rightEntry.name : rightEntry}`)
  return leftEntry.filename.toLowerCase() < rightEntry.filename.toLowerCase() ||
    (leftEntry.filename === rightEntry.filename && leftEntry.code < rightEntry.code)
      ? leftEntry.filename.toLowerCase() > rightEntry.filename.toLowerCase() ||
          (leftEntry.filename === rightEntry.filename && leftEntry.code > rightEntry.code)
        ? 1
        : 0
      : -1
}
