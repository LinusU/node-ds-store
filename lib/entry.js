
var bplist = require('bplist-creator');

var unorm = require('unorm');

var utf16be = function (str) {
  var b = new Buffer(str, 'ucs2');
  for (var i = 0; i < b.length; i += 2) {
    var a = b[i];
    b[i] = b[i+1];
    b[i+1] = a;
  }
  return b;
};

var HFSPlusFastUnicodeCompare = function (str1, str2) {
  // see https://developer.apple.com/legacy/library/technotes/tn/tn1150.html

  var c1;
  var c2;

  var lowerCaseTable = [];
  lowerCaseTable[0x0000] = 0xFFFF;
  for (var i = 0x0041; i <= 0x005A; i++) {
    lowerCaseTable[i] = i + 0x0020;
  }
  lowerCaseTable[0x00C6] = 0x00E6;
  lowerCaseTable[0x00D0] = 0x00F0;
  lowerCaseTable[0x00D8] = 0x00F8;
  lowerCaseTable[0x00DE] = 0x00FE;
  lowerCaseTable[0x0110] = 0x0111;
  lowerCaseTable[0x0126] = 0x0127;
  lowerCaseTable[0x0132] = 0x0133;
  lowerCaseTable[0x013F] = 0x0140;
  lowerCaseTable[0x0141] = 0x0142;
  lowerCaseTable[0x014A] = 0x014B;
  lowerCaseTable[0x0152] = 0x0153;
  lowerCaseTable[0x0166] = 0x0167;
  lowerCaseTable[0x0181] = 0x0253;
  lowerCaseTable[0x0182] = 0x0183;
  lowerCaseTable[0x0184] = 0x0185;
  lowerCaseTable[0x0186] = 0x0254;
  lowerCaseTable[0x0187] = 0x0188;
  lowerCaseTable[0x0189] = 0x0256;
  lowerCaseTable[0x018A] = 0x0257;
  lowerCaseTable[0x018B] = 0x018C;
  lowerCaseTable[0x018E] = 0x01DD;
  lowerCaseTable[0x018F] = 0x0259;
  lowerCaseTable[0x0190] = 0x025B;
  lowerCaseTable[0x0191] = 0x0192;
  lowerCaseTable[0x0193] = 0x0260;
  lowerCaseTable[0x0194] = 0x0263;
  lowerCaseTable[0x0196] = 0x0269;
  lowerCaseTable[0x0197] = 0x0268;
  lowerCaseTable[0x0198] = 0x0199;
  lowerCaseTable[0x019C] = 0x026F;
  lowerCaseTable[0x019D] = 0x0272;
  lowerCaseTable[0x019F] = 0x0275;
  lowerCaseTable[0x01A2] = 0x01A3;
  lowerCaseTable[0x01A4] = 0x01A5;
  lowerCaseTable[0x01A7] = 0x01A8;
  lowerCaseTable[0x01A9] = 0x0283;
  lowerCaseTable[0x01AC] = 0x01AD;
  lowerCaseTable[0x01AE] = 0x0288;
  lowerCaseTable[0x01B1] = 0x028A;
  lowerCaseTable[0x01B2] = 0x028B;
  lowerCaseTable[0x01B3] = 0x01B4;
  lowerCaseTable[0x01B5] = 0x01B6;
  lowerCaseTable[0x01B7] = 0x0292;
  lowerCaseTable[0x01B8] = 0x01B9;
  lowerCaseTable[0x01BC] = 0x01BD;
  lowerCaseTable[0x01C4] = 0x01C6;
  lowerCaseTable[0x01C5] = 0x01C6;
  lowerCaseTable[0x01C7] = 0x01C9;
  lowerCaseTable[0x01C8] = 0x01C9;
  lowerCaseTable[0x01CA] = 0x01CC;
  lowerCaseTable[0x01CB] = 0x01CC;
  lowerCaseTable[0x01E4] = 0x01E5;
  lowerCaseTable[0x01F1] = 0x01F3;
  lowerCaseTable[0x01F2] = 0x01F3;
  for (var i = 0x0391; i <= 0x03A1; i++) {
    lowerCaseTable[i] = i + 0x0020;
  }
  for (var i = 0x03A3; i <= 0x03A9; i++) {
    lowerCaseTable[i] = i + 0x0020;
  }
  lowerCaseTable[0x03E2] = 0x03E3;
  lowerCaseTable[0x03E4] = 0x03E5;
  lowerCaseTable[0x03E6] = 0x03E7;
  lowerCaseTable[0x03E8] = 0x03E9;
  lowerCaseTable[0x03EA] = 0x03EB;
  lowerCaseTable[0x03EC] = 0x03ED;
  lowerCaseTable[0x03EE] = 0x03EF;
  lowerCaseTable[0x0402] = 0x0452;
  lowerCaseTable[0x0404] = 0x0454;
  lowerCaseTable[0x0405] = 0x0455;
  lowerCaseTable[0x0406] = 0x0456;
  lowerCaseTable[0x0408] = 0x0458;
  lowerCaseTable[0x0409] = 0x0459;
  lowerCaseTable[0x040A] = 0x045A;
  lowerCaseTable[0x040B] = 0x045B;
  lowerCaseTable[0x040F] = 0x045F;
  for (var i = 0x0410; i <= 0x0418; i++) {
    lowerCaseTable[i] = i + 0x0020;
  }
  for (var i = 0x041A; i <= 0x042F; i++) {
    lowerCaseTable[i] = i + 0x0020;
  }
  for (var i = 0x0460; i <= 0x0474; i = i + 2) {
    lowerCaseTable[i] = i + 0x0001;
  }
  for (var i = 0x0478; i <= 0x0480; i = i + 2) {
    lowerCaseTable[i] = i + 0x0001;
  }
  for (var i = 0x0490; i <= 0x04BE; i = i + 2) {
    lowerCaseTable[i] = i + 0x0001;
  }
  lowerCaseTable[0x04C3] = 0x04C4;
  lowerCaseTable[0x04C7] = 0x04C8;
  lowerCaseTable[0x04CB] = 0x04CC;
  for (var i = 0x0531; i <= 0x0556; i++) {
    lowerCaseTable[i] = i + 0x0030;
  }
  for (var i = 0x10A0; i <= 0x10C5; i++) {
    lowerCaseTable[i] = i + 0x0030;
  }
  for (var i = 0x200C; i <= 0x200F; i++) {
    lowerCaseTable[i] = 0x0000;
  }
  for (var i = 0x202A; i <= 0x202E; i++) {
    lowerCaseTable[i] = 0x0000;
  }
  for (var i = 0x206A; i <= 0x206F; i++) {
    lowerCaseTable[i] = 0x0000;
  }
  for (var i = 0x2160; i <= 0x216F; i++) {
    lowerCaseTable[i] = 0x0010;
  }
  lowerCaseTable[0xFEFF] = 0x0000;
  for (var i = 0xFF21; i <= 0xFF3A; i++) {
    lowerCaseTable[i] = 0x0020;
  }

  for (var i = 0; i < Math.min(str1.length, str2.length); i++) {
    c1 = str1.charCodeAt(i);
    c2 = str2.charCodeAt(i);
    if (c1 in lowerCaseTable) {
      c1 = lowerCaseTable[c1];
    }
    if (c2 in lowerCaseTable) {
      c2 = lowerCaseTable[c2];
    }
    if (c1 != c2) {
      return c1 - c2;
    }
  }

  if (str1.length != str2.length) {
    return str1.length - str2.length;
  }

  return 0;
}

function Entry(filename, structureId, dataType, blob) {

  // from http://search.cpan.org/~wiml/Mac-Finder-DSStore/DSStoreFormat.pod:
  // "My guess is that the string comparison follows the same rules as HFS+
  // described in Apple's TN1150."
  // https://developer.apple.com/legacy/library/technotes/tn/tn1150.html
  // specifies that "Unicode strings will be stored in fully decomposed form,
  // with composing characters stored in canonical order"
  this.filename = unorm.nfd(filename);
  this.structureId = structureId;

  var filenameLength = this.filename.length;
  var filenameBytes = filenameLength * 2;

  this.buffer = new Buffer(4 + filenameBytes + 4 + 4 + blob.length);

  this.buffer.writeUInt32BE(filenameLength, 0);
  utf16be(this.filename).copy(this.buffer, 4);
  this.buffer.write(structureId, 4 + filenameBytes, 'ascii');
  this.buffer.write(dataType, 8 + filenameBytes, 'ascii');

  blob.copy(this.buffer, 12 + filenameBytes);

};

Entry.prototype.length = function () {
  return this.buffer.length();
};

Entry.sort = function (a, b) {
  // from http://search.cpan.org/~wiml/Mac-Finder-DSStore/DSStoreFormat.pod:
  // "My guess is that the string comparison follows the same rules as HFS+
  // described in Apple's TN1150."
  // https://developer.apple.com/legacy/library/technotes/tn/tn1150.html
  // contains a FastUnicodeCompare routine defined as the "HFS Plus
  // case-insensitive string comparison algorithm"
  var s1 = HFSPlusFastUnicodeCompare(a.filename, b.filename);
  var s2 = a.structureId.localeCompare(b.structureId);
  return s1 || s2;
};

Entry.construct = function (filename, structureId, opts) {

  var dataType, blob;

  var opt = function (key, def) {
    if (key in opts) {
      return opts[key];
    } else if (def === undefined) {
      throw new TypeError('Missing option: ' + key);
    } else {
      return def;
    }
  };

  switch (structureId) {
    case 'BKGD':
      dataType = 'blob';
      blob = new Buffer(12 + 4);
      blob.writeUInt32BE(blob.length - 4, 0);

      if (opts.color) {
        blob.write('ClrB', 4, 'ascii');
        throw new Error('Not implemented');
      } else if (opts.pictureByteLength) {
        blob.write('PctB', 4, 'ascii');
        blob.writeUInt32BE(opts.pictureByteLength, 8);
      } else {
        blob.write('DefB', 4, 'ascii');
      }

      break;
    case 'Iloc':
      dataType = 'blob';
      blob = new Buffer(16 + 4);
      blob.writeUInt32BE(blob.length - 4, 0);

      blob.writeUInt32BE(opts.x, 4);
      blob.writeUInt32BE(opts.y, 8);

      blob.write('FFFFFF00', 12, 'hex');

      break;
    case 'fwi0':

      throw new Error('Deprecated: Use `bwsp` (I think this is for old OS X)');

      dataType = 'blob';
      blob = new Buffer(16 + 4);
      blob.writeUInt32BE(blob.length - 4, 0);

      blob.writeUInt16BE(opts.top, 4);
      blob.writeUInt16BE(opts.left, 6);
      blob.writeUInt16BE(opts.bottom, 8);
      blob.writeUInt16BE(opts.right, 10);

      blob.write(opts.view || 'icnv', 12, 'ascii');
      blob.write('00000000', 16, 'hex');

      break;
    case 'pict':

      // Create an alias with `opts.picturePath`

      throw new Error('Not implemented');

      break;
    case 'bwsp':

      dataType = 'bplist';
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
          ' {' + opt('width') + ', ' +  opt('height') + '}}'
      });

      break;
    case 'icvp':

      // var color;
      // var imageFile = opt('background', null);

      // if (imageFile === null) {
      //   color = [new bplist.Real(1), new bplist.Real(0), new bplist.Real(0)]; // RED
      // } else {
      //   color = [new bplist.Real(1), new bplist.Real(1), new bplist.Real(1)];
      //   throw new Error('Not implemented');
      // }

      dataType = 'bplist';
      blob = bplist({
        backgroundType: 2, //( imageFile === null ? 1 : 2 ),
        backgroundImageAlias: opt('rawAlias'),
        backgroundColorRed: new bplist.Real(1),
        backgroundColorGreen: new bplist.Real(1),
        backgroundColorBlue: new bplist.Real(1),
        showIconPreview: true,
        showItemInfo: false,
        textSize: new bplist.Real(12),
        iconSize: new bplist.Real(opt('iconSize')) ,
        viewOptionsVersion: 1,
        gridSpacing: new bplist.Real(100),
        gridOffsetX: new bplist.Real(0),
        gridOffsetY: new bplist.Real(0),
        labelOnBottom: true,
        arrangeBy: "none"
      });

      break;
    case 'vSrn':

      dataType = 'long'
      blob = new Buffer(4);

      blob.writeUInt32BE(opt('value'), 0);

      break;
    default:
      throw new Error('Not implemented');
  }

  if (dataType === 'bplist') {

    dataType = 'blob';
    var buf = blob;

    blob = new Buffer(buf.length + 4);
    blob.writeUInt32BE(buf.length, 0);
    buf.copy(blob, 4);

  }

  return new Entry(filename, structureId, dataType, blob);
};

module.exports = exports = Entry;
