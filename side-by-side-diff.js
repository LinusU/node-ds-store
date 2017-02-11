let chalk = require('chalk')
let jsDiff = require('diff')
let flatmap = require('flatmap')

function splitChunk (chunk) {
  return chunk.value.split('\n').filter(line => line !== '').map(line => {
    return {
      value: line,
      added: chunk.added,
      removed: chunk.removed
    }
  })
}

function getContextLines (lines, lineIndex, contextLineCount, append) {
  const contextLines = []

  for (let contextIndex = contextLineCount; contextIndex > 0; contextIndex--) {
    let contextLine = lines[lineIndex - contextIndex + (append ? contextLineCount : 0)]

    if (contextLine) contextLines.push(contextLine)
  }

  return contextLines
}

function splitToColumns (lines, columnLength, contextLineCount) {
  const leftLines = []
  const rightLines = []

  function addBoth (line) {
    rightLines.push(line)
    leftLines.push(line)
  }

  lines.forEach((line, lineIndex) => {
    const previousLine = lines[lineIndex - 1] || {}
    if (line.added || line.removed) {
      if (!previousLine.added && !previousLine.removed) {
        addBoth({ value: Array(columnLength).join(' ') })
        getContextLines(lines, lineIndex, contextLineCount).forEach(addBoth)
      }

      if (line.added) {
        rightLines.push(line)
      } else {
        leftLines.push({
          value: line.value.replace('\n', ''),
          removed: true
        })
      }
    } else if (previousLine.added || previousLine.removed) {
      getContextLines(lines, lineIndex, contextLineCount, true).forEach(addBoth)
      addBoth({ value: Array(columnLength).join(' ') })
    }
  })

  return [
    leftLines,
    rightLines
  ]
}

module.exports = function (left, right) {
  const diffLines = flatmap(jsDiff.diffLines(left, right), splitChunk)

  const columnLength = diffLines.map(line => line.value.length).reduce((accum, length) => accum > length ? accum : length, 0) + 1

  const [ leftLines, rightLines ] = splitToColumns(diffLines, columnLength, 3)

  for (let i = 0; i < leftLines.length; i++) {
    if (rightLines[i].added && leftLines[i].removed) {
      const charDiff = jsDiff.diffChars(leftLines[i].value, rightLines[i].value)

      let leftLine = ''
      let rightLine = ''
      charDiff.forEach(part => {
        if (!part.added && !part.removed) {
          leftLine += part.value
          rightLine += part.value
        } else if (part.added) {
          rightLine += chalk.bold.green(part.value)
        } else {
          leftLine += chalk.bold.red(part.value)
        }
      })

      process.stderr.write(leftLine + ' | ' + rightLine + '\n')
    } else {
      process.stderr.write(chalk.dim(leftLines[i].value + ' | ' + rightLines[i].value + '\n'))
    }
  }
}
