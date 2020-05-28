exports.tokenize = tokenizeFencedCode
exports.resolve = resolveFencedCode

var core = require('../../core')
var characters = require('../../util/characters')

var min = 3
var tabSize = 4

function resolveFencedCode(events) {
  var index = -1
  var length = events.length
  var infoEnter
  var metaEnter
  var infoEvent
  var metaEvent
  var type
  var event
  var result
  var tokenizer

  while (++index < length) {
    event = events[index]
    type = event[1].type

    if (event[0] === 'enter') {
      if (type === 'fencedCodeFenceInfo') {
        infoEnter = index
      } else if (type === 'fencedCodeFenceMeta') {
        metaEnter = index
      }
    }

    if (event[0] === 'exit' && type === 'fencedCodeFenceStart') {
      break
    }
  }

  if (infoEnter === undefined) {
    result = events
  } else {
    infoEvent = events[infoEnter]
    tokenizer = core.plainText(infoEvent[1].start)

    result = events
      .slice(0, infoEnter + 1)
      .concat(tokenizer(infoEvent[2].slice(infoEvent[1])), tokenizer(null))

    if (metaEnter === undefined) {
      result = result.concat(events.slice(infoEnter + 1))
    } else {
      metaEvent = events[metaEnter]
      tokenizer = core.plainText(metaEvent[1].start)

      result = result.concat(
        events.slice(infoEnter + 1, metaEnter + 1),
        tokenizer(metaEvent[2].slice(metaEvent[1])),
        tokenizer(null),
        events.slice(metaEnter + 1)
      )
    }
  }

  return result
}

function tokenizeFencedCode(effects, ok, nok) {
  var closingFence = {tokenize: tokenizeClosingFence}
  var sizeOpen = 0
  var initialPrefixSize
  var prefixSize
  var marker

  return start

  function start(code) {
    /* istanbul ignore next - used when hooking into multiple characters */
    if (code !== characters.graveAccent && code !== characters.tilde) {
      return nok(code)
    }

    initialPrefixSize =
      effects.previousToken && effects.previousToken.type === 'linePrefix'
        ? effects.previousToken.end.column - effects.previousToken.start.column
        : 0

    effects.enter('fencedCode')
    effects.enter('fencedCodeFenceStart')
    effects.enter('fencedCodeFenceSequence')

    marker = code

    return sequenceOpen
  }

  function sequenceOpen(code) {
    if (code === marker) {
      sizeOpen++
      effects.consume(code)
      return sequenceOpen
    }

    if (sizeOpen < min) {
      return nok(code)
    }

    effects.exit('fencedCodeFenceSequence')

    if (code !== code || code === characters.lineFeed) {
      return openAfter(code)
    }

    if (code === characters.tab || code === characters.space) {
      effects.enter('fencedCodeFenceWhitespace')
      return sequenceOpenAfter(code)
    }

    effects.enter('fencedCodeFenceInfo')
    return sequenceOpenInfo(code)
  }

  function sequenceOpenAfter(code) {
    if (code === characters.tab || code === characters.space) {
      effects.consume(code)
      return sequenceOpenAfter
    }

    effects.exit('fencedCodeFenceWhitespace')

    if (code !== code || code === characters.lineFeed) {
      return openAfter(code)
    }

    effects.enter('fencedCodeFenceInfo')
    return sequenceOpenInfo(code)
  }

  function sequenceOpenInfo(code) {
    if (marker === characters.graveAccent && code === marker) {
      return nok(code)
    }

    if (code === characters.tab || code === characters.space) {
      effects.exit('fencedCodeFenceInfo')
      effects.enter('fencedCodeFenceWhitespace')
      return sequenceOpenInfoAfter(code)
    }

    if (code !== code || code === characters.lineFeed) {
      effects.exit('fencedCodeFenceInfo')
      return openAfter(code)
    }

    effects.consume(code)
    return sequenceOpenInfo
  }

  function sequenceOpenInfoAfter(code) {
    if (code === characters.tab || code === characters.space) {
      effects.consume(code)
      return sequenceOpenInfoAfter
    }

    effects.exit('fencedCodeFenceWhitespace')

    if (code !== code || code === characters.lineFeed) {
      return openAfter(code)
    }

    effects.enter('fencedCodeFenceMeta')
    return sequenceOpenMeta(code)
  }

  function sequenceOpenMeta(code) {
    if (marker === characters.graveAccent && code === marker) {
      return nok(code)
    }

    if (code !== code || code === characters.lineFeed) {
      effects.exit('fencedCodeFenceMeta')
      return openAfter(code)
    }

    effects.consume(code)
    return sequenceOpenMeta
  }

  function openAfter(code) {
    effects.exit('fencedCodeFenceStart')

    if (code === characters.lineFeed) {
      effects.enter('lineFeed')
      effects.consume(code)
      effects.exit('lineFeed')
      return next(code)
    }

    return lineEnd(code)
  }

  function lineStart(code) {
    if (code !== code || code === characters.lineFeed) {
      return lineEnd(code)
    }

    if (
      initialPrefixSize !== 0 &&
      (code === characters.tab || code === characters.space)
    ) {
      effects.enter('linePrefix')
      prefixSize = 0
      return linePrefix(code)
    }

    effects.enter('codeLineData')
    return lineData(code)
  }

  function linePrefix(code) {
    if (
      prefixSize < initialPrefixSize &&
      (code === characters.tab || code === characters.space)
    ) {
      /* istanbul ignore next - todo: tabs. */
      prefixSize += code === characters.space ? 1 : 4
      effects.consume(code)
      return linePrefix
    }

    effects.exit('linePrefix')
    prefixSize = undefined

    if (code !== code || code === characters.lineFeed) {
      return lineEnd(code)
    }

    effects.enter('codeLineData')
    return lineData(code)
  }

  function lineData(code) {
    if (code !== code || code === characters.lineFeed) {
      effects.exit('codeLineData')
      return lineEnd(code)
    }

    effects.consume(code)
    return lineData
  }

  function lineEnd(code) {
    if (code !== code) {
      return after(code)
    }

    /* istanbul ignore next - used only for EOF and EOL. */
    if (code !== characters.lineFeed) {
      throw new Error('Expected EOL or EOF')
    }

    effects.enter('codeLineFeed')
    effects.consume(code)
    effects.exit('codeLineFeed')
    return next
  }

  function next() {
    return effects.createConstructAttempt(closingFence, after, lineStart)
  }

  function after(code) {
    effects.exit('fencedCode')
    return ok(code)
  }

  function tokenizeClosingFence(effects, ok, nok) {
    var size = 0

    return closingStart

    function closingStart(code) {
      if (code === characters.tab || code === characters.space) {
        effects.enter('linePrefix')
        prefixSize = 0
        return closingPrefix(code)
      }

      return closingPrefixAfter(code)
    }

    function closingPrefix(code) {
      if (code === characters.tab || code === characters.space) {
        /* istanbul ignore next - todo: tabs. */
        prefixSize += code === characters.space ? 1 : 4

        // Closing prefix cannot start when indented.
        if (prefixSize >= tabSize) {
          prefixSize = undefined
          return nok(code)
        }

        effects.consume(code)
        return closingPrefix
      }

      prefixSize = undefined
      effects.exit('linePrefix')
      return closingPrefixAfter(code)
    }

    function closingPrefixAfter(code) {
      if (code === marker) {
        effects.enter('fencedCodeFenceEnd')
        effects.enter('fencedCodeFenceSequence')
        return closingSequence(code)
      }

      return nok(code)
    }

    function closingSequence(code) {
      if (code === marker) {
        size++
        effects.consume(code)
        return closingSequence
      }

      if (size < sizeOpen) {
        return nok(code)
      }

      effects.exit('fencedCodeFenceSequence')

      if (code === characters.tab || code === characters.space) {
        effects.enter('fencedCodeFenceWhitespace')
        return closingSequenceAfter(code)
      }

      return closingSequenceEnd(code)
    }

    function closingSequenceAfter(code) {
      if (code === characters.tab || code === characters.space) {
        effects.consume(code)
        return closingSequenceAfter
      }

      effects.exit('fencedCodeFenceWhitespace')
      return closingSequenceEnd(code)
    }

    function closingSequenceEnd(code) {
      if (code !== code || code === characters.lineFeed) {
        effects.exit('fencedCodeFenceEnd')
        return ok(code)
      }

      return nok(code)
    }
  }
}