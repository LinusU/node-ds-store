module.exports = class Block {
  constructor (allocator, offset, size) {
    this._allocator = allocator
    this._offset = offset
    this._size = size
    this._value = allocator.read(offset, size)
    this._pos = 0
    this._dirty = false
  }

  get size () {
    return this._size
  }

  get pos () {
    return this._pos
  }

  close () {
    if (this._dirty) this.flush()
  }

  flush () {
    if (this._dirty) {
      this._dirty = false
      this._allocator.write(this._offset, this._value)
    }
  }

  invalidate () {
    this._dirty = false
  }

  zeroFill () {
    this._value.fill(0)
    this._dirty = true
  }

  seek (pos, fromEnd) {
    if (pos < 0 || pos > this._size) throw new Error('Seek out of range in Block instance')

    if (fromEnd) this._pos = this._size - pos
    else this._pos += pos
  }

  read (size) {
    if (this._size - this._pos < size) {
      throw new Error('Unable to read ' + size + ' bytes in block')
    }

    var data = new Buffer(size)
    this._value.copy(data, 0, this._pos, this._pos + size)

    this._pos += size

    return data
  }

  write (buffer) {
    if (this._pos + buffer.length > this._size) {
      throw new Error('Attempt to write past end of Block')
    }

    buffer.copy(this._value, this._pos)

    this._pos += buffer.length
    this._dirty = true
  }

  insert (buffer) {
    this._value = Buffer.concat([this._value.slice(0, this._pos), buffer, this._value.slice(this._pos + buffer.length)])
    this._pos += buffer.length
    this._dirty = true
  }

  delete (size) {
    if (this._pos + size > this._size) throw new Error('Attempt to delete past end of Block')

    this._value.fill(0, this._value.length - size)
    this._dirty = true
  }
}
