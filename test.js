var hexy = require('hexy')
var path = require('path')
var sideBySideDiff = require('./side-by-side-diff')
var fs = require('fs')
var DS = require('./')

var dsNew = new DS()
var dsOld = new DS(true)
// ds.vSrn(1)

// ds.setWindowSize(600, 450)

// ds.setIconSize(80)

// ds.setBackgroundPath('/Volumes/Test Title/.background/TestBkg.tiff')

// var contents = [
//   { x: 448, y: 344, type: 'link', path: '/Applications' },
//   { x: 192, y: 344, type: 'file', path: 'TestApp.app' },
//   { x: 512, y: 128, type: 'file', path: 'TestDoc.txt' },
//   { x: 512, y: 900, type: 'position', path: '.VolumeIcon.icns' }
// ]

// contents.forEach(function (e) {
//   ds.setIconPos(path.basename(e.path), e.x, e.y)
// })

dsNew.setWindowSize(600, 450)
dsOld.setWindowSize(600, 450)

dsNew.write('./DS_Store_new', (err) => {
  if (err) throw err
  dsOld.write('./DS_Store_old', (err) => {
    if (err) throw err
    sideBySideDiff(hexy.hexy(fs.readFileSync('./DS_Store_old')), hexy.hexy(fs.readFileSync('./DS_Store_new')))
  })
})
