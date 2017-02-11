var tn1150 = require('tn1150')
var bplist = require('bplist-creator')
var Int64 = require('node-int64')

function toInt32BEBuffer (value) {
  var buffer = new Buffer(4)
  buffer.writeInt32BE(value)
  return buffer
}

function utf16be (str) {
  var b = new Buffer(str, 'ucs2')

  for (var i = 0; i < b.length; i += 2) {
    var a = b[i]
    b[i] = b[i + 1]
    b[i + 1] = a
  }

  return b
}

function ILocCodecDecode (buffer) {
  return [
    buffer.readInt32BE(),
    buffer.readInt32BE(4)
  ]
}

function ILocCodecEncode (points) {
  var buffer = new Buffer(8)

  buffer.writeUInt32BE(points[0])
  buffer.writeUInt32BE(points[1], 4)

  return buffer
}

var codecs = {
  Iloc: {
    decode: ILocCodecDecode,
    encode: ILocCodecEncode
  }
}

function Entry (filename, structureId, dataType, buffer) {
  this.filename = tn1150.normalize(filename)
  this.structureId = structureId
  this.dataType = dataType
  this.buffer = buffer
}

Entry.read = function (block) {
  var value

  // First read the filename
  var nlen = block.read(4).readInt32BE()
  var filename = block.read(2 * nlen).toString('utf-16be')

  // Next, read the code and type
  var code = block.read(4).toString('ascii')
  var typecode = block.read(4).toString('ascii')

  // Finally, read the data
  if (typecode === 'bool') {
    value = block.readInt8() === 1
  } else if (typecode === 'long' || typecode === 'shor') {
    value = block.read(4).readInt32BE()
  } else if (typecode === 'blob') {
    var vlen = block.read(4).readInt32BE()
    value = block.read(vlen)

    var codec = codecs[code]
    if (codec) {
      value = codec.decode(value)
      typecode = codec
    }
  } else if (typecode === 'ustr') {
    vlen = block.read(4).readInt32BE()
    value = block.read(2 * vlen).toString('utf-16be')
  } else if (typecode === 'type') {
    value = block.read(16).toString('ascii')
  } else if (typecode === 'comp' || typecode === 'dutc') {
    var high = block.read(0).readUInt32BE()
    var low = block.read(4).readUInt32BE()
    value = new Int64(high, low)
  } else {
    throw new Error('Unknown type code ' + typecode)
  }

  return new Entry(filename, code, typecode, value)
}

Entry.prototype.length = function () {
  var filenameLength = utf16be(this.filename).length
  var l = 4 + filenameLength + 8

  var value = this.value

  switch (this.dataType) {
    case 'bool':
      l += 1
      break
    case 'long':
    case 'shor':
      l += 4
      break
    case 'blob':
      l += 4 + value.length
      break
    case 'ustr':
      l += 4 + utf16be(value).length
      break
    case 'type':
      l += 4
      break
    case 'comp':
    case 'dutc':
      l += 8
      break
    default:
      throw new Error('Unknown type code "%s"' % this.dataType)
  }

  return l
}

Entry.sort = function (a, b) {
  var s1 = tn1150.compare(a.filename, b.filename)
  var s2 = a.structureId.localeCompare(b.structureId)
  return s1 || s2
}

Entry.construct = function (filename, structureId, opts) {
  var dataType, blob

  var opt = function (key, def) {
    if (key in opts) {
      return opts[key]
    } else if (def === undefined) {
      throw new TypeError('Missing option: ' + key)
    } else {
      return def
    }
  }

  switch (structureId) {
    case 'BKGD':

      dataType = 'blob'
      blob = new Buffer(12 + 4)
      blob.writeUInt32BE(blob.length - 4, 0)

      if (opts.color) {
        blob.write('ClrB', 4, 'ascii')
        throw new Error('Not implemented')
      } else if (opts.pictureByteLength) {
        blob.write('PctB', 4, 'ascii')
        blob.writeUInt32BE(opts.pictureByteLength, 8)
      } else {
        blob.write('DefB', 4, 'ascii')
      }

      break
    case 'Iloc':

      dataType = 'blob'
      blob = new Buffer(16 + 4)
      blob.writeUInt32BE(blob.length - 4, 0)

      blob.writeUInt32BE(opts.x, 4)
      blob.writeUInt32BE(opts.y, 8)

      blob.write('FFFFFF00', 12, 'hex')

      break
    case 'fwi0':

      throw new Error('Deprecated: Use `bwsp` (I think this is for old OS X)')

      // dataType = 'blob'
      // blob = new Buffer(16 + 4)
      // blob.writeUInt32BE(blob.length - 4, 0)
      //
      // blob.writeUInt16BE(opts.top, 4)
      // blob.writeUInt16BE(opts.left, 6)
      // blob.writeUInt16BE(opts.bottom, 8)
      // blob.writeUInt16BE(opts.right, 10)
      //
      // blob.write(opts.view || 'icnv', 12, 'ascii')
      // blob.write('00000000', 16, 'hex')
      //
      // break
    case 'pict':

      dataType = 'blob'
      var header = new Buffer(4)
      header.write('pict', 0, 'ascii')

      blob = Buffer.concat([ header, opt('rawAlias') ])

      break
    case 'bwsp':

      dataType = 'bplist'
      blob = bplist({
        ContainerShowSidebar: true,
        ShowPathbar: false,
        ShowSidebar: true,
        ShowStatusBar: false,
        ShowTabView: false,
        ShowToolbar: false,
        SidebarWidth: 0,
        WindowBounds:
          '{{' + opt('x') + ', ' + opt('y') + '},' +
          ' {' + opt('width') + ', ' + opt('height') + '}}'
      })

      break
    case 'icvp':

      var plistObj = {
        backgroundType: 1,
        backgroundColorRed: new bplist.Real(1),
        backgroundColorGreen: new bplist.Real(1),
        backgroundColorBlue: new bplist.Real(1),
        showIconPreview: true,
        showItemInfo: false,
        textSize: new bplist.Real(12),
        iconSize: new bplist.Real(opt('iconSize')),
        viewOptionsVersion: 1,
        gridSpacing: new bplist.Real(100),
        gridOffsetX: new bplist.Real(0),
        gridOffsetY: new bplist.Real(0),
        labelOnBottom: true,
        arrangeBy: 'none'
      }

      if (opts.colorComponents) {
        plistObj.backgroundColorRed = new bplist.Real(opts.colorComponents[0])
        plistObj.backgroundColorGreen = new bplist.Real(opts.colorComponents[1])
        plistObj.backgroundColorBlue = new bplist.Real(opts.colorComponents[2])
      }

      if (opts.rawAlias) {
        plistObj.backgroundType = 2
        plistObj.backgroundImageAlias = opts.rawAlias
      }

      dataType = 'bplist'
      blob = bplist(plistObj)

      break
    case 'vSrn':

      dataType = 'long'
      blob = new Buffer(4)

      blob.writeUInt32BE(opt('value'), 0)

      break
    default:
      throw new Error('Not implemented')
  }

  if (dataType === 'bplist') {
    dataType = 'blob'
    var buf = blob

    blob = new Buffer(buf.length + 4)
    blob.writeUInt32BE(buf.length, 0)
    buf.copy(blob, 4)
  }

  return new Entry(filename, structureId, dataType, blob)
}

Entry.prototype.write = function (block, insert) {
  var w = insert ? block.insert : block.write

  w(toInt32BEBuffer(utf16.length))
  w(utf16be(this.filename))
  w(Buffer.from(this.structureId + this.dataType))

  switch (this.dataType) {
    case 'bool':
      w('>?', this.value)
      break
    case 'long':
    case 'shor':
      w(toInt32BEBuffer(this.value))
      break
    case 'blob':
      w(toInt32BEBuffer(this.value.length))
      w(this.value)
      break
    case 'ustr':
      var utf16 = utf16be(this.value)
      w(toInt32BEBuffer(utf16.length))
      w(utf16)
      break
    case 'type':
      w(Buffer.from(this.value))
      break
    case 'comp':
    case 'dutc':
      w(this.value.toBuffer())
      break
    default:
      throw new Error('Unknown type code "' + this.dataType + '"')
  }
}

module.exports = exports = Entry
