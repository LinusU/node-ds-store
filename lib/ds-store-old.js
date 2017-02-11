var fs = require('fs')
var path = require('path')

var Entry = require('./entry')

function DSStore () {
  this.entries = []
}

DSStore.prototype.push = function (entry) {
  this.entries.push(entry)
}

DSStore.prototype.write = function (filePath, cb) {
  var entries = this.entries.sort(Entry.sort)

  fs.readFile(path.join(__dirname, '/../assets/DSStore-clean'), function (err, buf) {
    if (err) return cb(err)

    var modified = new Buffer(3840)

    modified.fill(0)

    var currentPos = 0

    var P = 0
    var count = entries.length

    modified.writeUInt32BE(P, currentPos)
    modified.writeUInt32BE(count, currentPos + 4)
    currentPos += 8

    entries.forEach(function (e, i) {
      var b = e.buffer
      b.copy(modified, currentPos)
      currentPos += b.length
    })

    buf.writeUInt32BE(entries.length, 76)
    modified.copy(buf, 4100)

    fs.writeFile(filePath, buf, function (err) {
      cb(err)
    })
  })
}

module.exports = exports = DSStore