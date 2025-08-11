const stringUtil = require('./string-util.js')

class FF7BinaryDataReader {
  constructor (buffer) {
    this.buffer = buffer
    this.length = this.buffer.length
    this.offset = 0
    this.charMap = require('./char-map.js')
    this.kernelVars = {
      0xea: 'CHAR',
      0xeb: 'ITEM',
      0xec: 'NUM',
      0xed: 'TARGET',
      0xee: 'ATTACK',
      0xef: 'ID',
      0xf0: 'ELEMENT'
    }
  }

  setDialogStrings (dialogStrings) {
    this.dialogStrings = dialogStrings
  }

  readByte () {
    const b = this.buffer.readInt8(this.offset)
    this.offset += 1
    return b
  }

  readUByte () {
    const b = this.buffer.readUInt8(this.offset)
    this.offset += 1
    return b
  }

  readShort () {
    const s = this.buffer.readInt16LE(this.offset)
    this.offset += 2
    return s
  }

  readUShort () {
    const s = this.buffer.readUInt16LE(this.offset)
    this.offset += 2
    return s
  }

  read24bitInteger () {
    const b = this.buffer.readUIntBE(this.offset, 3)
    this.offset += 3
    return b
  }

  readInt () {
    const i = this.buffer.readInt32LE(this.offset)
    this.offset += 4
    return i
  }

  readUInt () {
    const i = this.buffer.readUInt32LE(this.offset)
    this.offset += 4
    return i
  }

  readFloat () {
    const f = this.buffer.readFloatLE(this.offset)
    this.offset += 4
    return f
  }

  readUByteArray (length) {
    const array = []
    for (let i = 0; i < length; i++) {
      array.push(this.readUByte())
    }
    return array
  }

  readByteArray (length) {
    const array = []
    for (let i = 0; i < length; i++) {
      array.push(this.readByte())
    }
    return array
  }

  readByteArrayHex (length) {
    const array = []
    for (let i = 0; i < length; i++) {
      array.push(stringUtil.dec2hex(this.readUByte()).replace('0x', ''))
    }
    return array
  }

  readUShortArray (length) {
    const array = []
    for (let i = 0; i < length; i++) {
      array.push(this.readUShort())
    }
    return array
  }

  readIntArray (length) {
    const array = []
    for (let i = 0; i < length; i++) {
      array.push(this.readInt())
    }
    return array
  }

  peekUByte () {
    const b = this.buffer.readUInt8(this.offset)
    return b
  }

  readString (len, returnAfterMinReadCount) {
    let s = ''
    let readCount = len
    for (let i = 0; i < len; i++) {
      const c = this.buffer.readUInt8(this.offset + i)
      if (c > 0) {
        s = s + String.fromCharCode(c)
      } else {
        readCount = i
        break
      }
    }
    if (returnAfterMinReadCount) {
      // Return offset after finished reading, eg len = 24, but chars finish after 10. Return offset 11
      this.offset = this.offset + readCount + 1
    } else {
      // Return offset after all bytes, eg len = 24, but chars finish after 10. Return offset 24
      this.offset = this.offset + len
    }
    return s
  }

  readKernelString (maxLength) {
    let s = ''
    let readCount = maxLength
    for (let i = 0; i < maxLength; i++) {
      const c = this.buffer.readUInt8(this.offset + i)
      if (c === 0xff) {
        readCount = i
        break
      } else if (c < 0xe7) {
        s = s + this.charMap[c]
      } else if (c >= 0xea && c <= 0xf0) {
        const v1 = this.buffer.readUInt8(this.offset + i + 1)
        const v2 = this.buffer.readUInt8(this.offset + i + 2)
        i += 2
        // s = s + "{" + this.kernelVars[c] + "(" + v1 + "," + v2 + ")}";
        s = s + '{' + this.kernelVars[c] + '}'
      } else if (c === 0xf8) {
        const v = this.buffer.readUInt8(this.offset + i + 1)
        i += 1
        s = s + '{COLOR(' + v + ')}'
      } else if (c === 0xf9) {
        const v = this.buffer.readUInt8(this.offset + i + 1)
        i += 1
        const v1 = (v & 0b11000000) >> 6
        const v2 = v & 0b00111111
        const numBytes = v1 * 2 + 4
        const newOffset = this.offset + (i - 1) - 1 - v2
        const oldOffset = this.offset
        this.offset = newOffset
        const fragment = this.readKernelString(numBytes)
        this.offset = oldOffset
        s = s + fragment
      } else {
        s = s + '<0x' + c.toString(16) + '>'
      }
    }
    this.offset = this.offset + readCount + 1
    return s
  }

  readDialogString (maxLength) {
    let s = ''
    for (let i = 0; i < maxLength; i++) {
      const c = this.buffer.readUInt8(this.offset + i)

      switch (c) {
        case 0xfe:
          i++
          const feCode = this.buffer.readUInt8(this.offset + i)
          // console.log('\nfeCode', feCode, stringUtil.toHex2(feCode), this.charMap[feCode], zero, zero === 0)
          if (
            feCode === 0xe2 &&
            this.buffer.readUInt8(this.offset + i + 4) === 0x0
          ) {
            let bank
            switch (this.buffer.readUInt8(this.offset + i + 2)) {
              case 0:
                bank = 1
                break // 1 & 2
              case 1:
                bank = 3
                break // 3 & 4
              case 2:
                bank = 11
                break // 11 & 12
              case 3:
                bank = 13
                break // 13 & 14
              case 4:
                bank = 15
                break // 7 & 15
              default:
                bank = 0
                break // Error
            }
            const index = this.buffer.readUInt8(this.offset + i + 1)
            const size = this.buffer.readUInt8(this.offset + i + 3)
            // console.log('bank data', bank, index, size)
            s = s + `{BANK,${bank},${index},${size}}`
            i = i + 4
          } else if (feCode === 0xe1) {
            s = s + '{VARDECR}' // ?
          } else if (feCode === 0xdd) {
            s = s + this.charMap[feCode] // ?
          } else {
            s = s + this.charMap[feCode]
          }
          break
        case 0xff:
          return s

        default:
          s = s + this.charMap[c]
          break
      }
    }
    return s
  }

  getCmpDesc (a, c, b) {
    if (c === 0) return a + ' === ' + b
    if (c === 1) return a + ' != ' + b
    if (c === 2) return a + ' > ' + b
    if (c === 3) return a + ' < ' + b
    if (c === 4) return a + ' >= ' + b
    if (c === 5) return a + ' <= ' + b
    if (c === 6) return a + ' & ' + b
    if (c === 7) return a + ' ^ ' + b
    if (c === 8) return a + ' | ' + b
    if (c === 9) return a + ' & (1<<' + b + ')'
    if (c === 10) return '!((' + a + ' & (1<<' + b + ')))'
    throw new Error('unsupported comparison type: ' + c)
  }

  getCharacterDesc (c) {
    if (c === 0) return 'C.Cloud'
    if (c === 1) return 'C.Barret'
    if (c === 2) return 'C.Tifa'
    if (c === 3) return 'C.Aeris'
    if (c === 4) return 'C.RedXIII'
    if (c === 5) return 'C.Yuffie'
    if (c === 6) return 'C.CaitSith'
    if (c === 7) return 'C.Vincent'
    if (c === 8) return 'C.Cid'
    if (c === 9) return 'C.YoungCloud'
    if (c === 10) return 'C.Sephiroth'
    if (c === 11) return 'C.Chocobo'
    if (c === 0xfe) return 'C.NoneFE'
    if (c === 0xff) return 'C.NoneFF'
    throw new Error('unexpected character id: ' + c)
  }

  getNextBytes (n) {
    const $r = this // in case we want to split this class into two classes, one for readUByte() etc. and one for readOp()+getCmpDesc()+getCharacterDesc()
    const bytes = []
    for (let i = 0; i < n; i++) {
      const byte = $r.readUByte()
      bytes.push(byte)
    }
    return bytes
  }

  readOpAndIncludeRawBytes () {
    const $r = this
    const offset1 = $r.offset
    const opData = this.readOp()
    const offset2 = $r.offset
    const raw = []
    $r.offset = offset1
    for (let i = offset1; i < offset2; i++) {
      const byte = $r.readUByte()
      const hex = stringUtil.toHex2(byte)
      raw.push(hex)
    }
    opData.raw = raw.join(' ')
    return opData
  }

  readBattleCameraPositionOp () {
    const $r = this
    const offset = this.offset
    const op = $r.readUByte()

    const getRaw = (from, to) => {
      // console.log('getRaw', from, to)
      this.offset = from
      return this.readUByteArray(to - from)
        .map(v => stringUtil.dec2hex(v, 2, true).toUpperCase())
        .join(' ')
    }

    // D5 - (One Word Parameter)
    if (op === 0xd5) {
      const arg = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        arg,
        op: 'D5',
        raw,
        js: 'opD5()'
      }
    }
    // D6 - (No Parameters)
    if (op === 0xd6) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FLASH',
        raw,
        js: 'flashScreen()'
      }
    }
    // D7 - (Two Byte Parameters)
    if (op === 0xd7) {
      const arg1 = $r.readUByte()
      const arg2 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETU3',
        arg1,
        arg2,
        raw,
        js: `setUnknown3({arg1: ${arg1}, arg2: ${arg2}})`
      }
    }
    // D8 - (Two Byte, Three Word, One Byte Parameters) *
    if (op === 0xd8) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readShort()
      const arg6 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'D8',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        arg6,
        raw,
        js: 'opD8()'
      }
    }
    // D9 - (No Parameters) Loads Point from memory at 0xBF2158
    if (op === 0xd9) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'D9',
        raw,
        js: 'opD9()'
      }
    }
    // DA - (No Parameters) Sets Unknown2 to 0
    if (op === 0xda) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EASING',
        raw,
        js: 'allowEasing()'
      }
    }
    // DB - (No Parameters) Sets Unknown2 to 1
    if (op === 0xdb) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'LINEAR',
        raw,
        js: 'removeEasing()'
      }
    }
    // DC - (No Parameters) Sets Unknown1 to 1
    if (op === 0xdc) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ZINV',
        raw,
        js: 'invertedZOrientation()'
      }
    }
    // DD - (One Byte Parameter) Sets active "Idle" camera index (based on formation data) to parameter
    if (op === 0xdd) {
      const index = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETIDLE',
        index,
        raw,
        js: `setIdleCamPositionIndex({index: ${index}})`
      }
    }
    // DE - (One Byte Parameter) If non-0 parameter, set 0xBF2A34 to 3
    if (op === 0xde) {
      const arg = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DE',
        arg,
        raw,
        js: 'opDE()'
      }
    }
    // DF - (No Parameter) Sets 0xBF2A34 to Fh; No questions asked
    if (op === 0xdf) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DF',
        raw,
        js: 'opDF()'
      }
    }
    // E0 - (Two Byte Parameters)
    if (op === 0xe0) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'E0',
        arg,
        arg2,
        raw,
        js: 'opE0()'
      }
    }
    // E1 - (No Parameters) Loads current idle camera position point
    if (op === 0xe1) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'IDLE',
        raw,
        js: 'instantlyGoToIdle()'
      }
    }
    // E2 - (One Byte Parameter)
    if (op === 0xe2) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVEI',
        frames,
        raw,
        js: `moveToIdlePositionAsync({frames: ${frames}})`
      }
    }
    // E3 - (Two Byte, Three Word, One Byte Parameters) *
    if (op === 0xe3) {
      const arg = $r.readUByte()
      const arg2 = $r.readShort()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'E3',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        raw,
        js: 'opE3()'
      }
    }
    // E4 - (One Byte, Three Word, One Byte Parameters) *
    if (op === 0xe4) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVEA',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `moveToAttacker({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E5 - (One Byte, Three Word, One Byte Parameters) *
    if (op === 0xe5) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVET',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `moveToTarget({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E6 - (Three Word, One Byte Parameters)
    if (op === 0xe6) {
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVE',
        x,
        y,
        z,
        frames,
        raw,
        js: `moveToPositionAsync({x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E7 - (One Byte, Three Word, One Byte Parameters)
    if (op === 0xe7) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOLLOWA',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `followAttacker({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E8 - (One Byte, Three Word, One Byte Parameters) ???
    // https://github.com/q-gears/q-gears-reversing-data/blob/2b155a8c5455f5fc8addd2eda9e5cd4c226abe34/reversing/ffvii/ffvii_battle/camera/camera_script_export_attack_normal.lua#L84
    if (op === 0xe8) {
      const arg = $r.readUByte()
      const arg2 = $r.readShort()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'E8',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        raw,
        js: 'opE8()'
      }
    }
    // E9 - (One Byte, Three Word, One Byte Parameters)
    if (op === 0xe9) {
      const arg = $r.readUByte()
      const arg2 = $r.readShort()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'E9',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        raw,
        js: 'opE9()'
      }
    }
    // EB - (Two Byte, Three Word, One Byte Parameters)
    if (op === 0xeb) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readShort()
      const arg6 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EB',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        arg6,
        raw,
        js: 'opEB()'
      }
    }
    // EF - (Two Byte, Three Word Parameters)
    if (op === 0xef) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EF',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        raw,
        js: 'opEF()'
      }
    }
    // F0 - (One Byte, Three Word Parameters)
    if (op === 0xf0) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOCUSA',
        bone,
        x,
        y,
        z,
        raw,
        js: `focusOnAttacker({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}})`
      }
    }
    // F1 - (No Parameters) Sets Unknown1 to 0
    if (op === 0xf1) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ZNORM',
        raw,
        js: 'normalZOrientation()'
      }
    }
    // F2 - (One Byte, Two Word Parameters)
    if (op === 0xf2) {
      const arg = $r.readUByte()
      const arg2 = $r.readShort()
      const arg3 = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'F2',
        arg,
        arg2,
        arg3,
        raw,
        js: 'opF2()'
      }
    }
    // F3 - (One Byte, Two Word Parameters)
    if (op === 0xf3) {
      const arg = $r.readUByte()
      const arg2 = $r.readShort()
      const arg3 = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'F3',
        arg,
        arg2,
        arg3,
        raw,
        js: 'opF3()'
      }
    }
    // F4 - (No Parameters) Wait
    if (op === 0xf4) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'WAIT',
        raw,
        js: 'executeWait()'
      }
    }
    // F5 - (One Byte Parameter) Set Wait
    if (op === 0xf5) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETWAIT',
        frames,
        raw,
        js: `setWait({frames: ${frames}})`
      }
    }
    // F7 - (One Byte, Three Word Parameters)
    // Note: In documentation, it states F8, but it's F7
    if (op === 0xf7) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOCUST',
        bone,
        x,
        y,
        z,
        raw,
        js: `focusOnTarget({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}})`
      }
    }
    // F8 - (Six Word Parameters) Store These values in six words starting at 0xBFCE0C (not in order)
    // Note: In documentation, it states F7, but it's F8
    if (op === 0xf8) {
      const zoom = $r.readShort()
      const radius = $r.readShort()
      const rotation = $r.readShort()
      const growth = $r.readShort()
      const yAdj = $r.readShort()
      const frames = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SPIRAL',
        zoom,
        radius,
        rotation,
        growth,
        yAdj,
        frames,
        raw,
        js: `spiralCamera({zoom: ${stringUtil.padSpaces6(
          zoom
        )}, radius: ${stringUtil.padSpaces6(
          radius
        )}, rotation: ${stringUtil.padSpaces6(
          rotation
        )}, growth: ${stringUtil.padSpaces6(
          growth
        )}, yAdj: ${stringUtil.padSpaces6(
          yAdj
        )}, frames: ${stringUtil.padSpaces6(frames)}})`
      }
    }
    // F9 - (Three Word Parameters) Load Point specified by parameters (X, Y, Z as Words)
    if (op === 0xf9) {
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'XYZ',
        x,
        y,
        z,
        raw,
        js: `setXYZ({x: ${x}, y: ${y}, z:${z}});`
      }
    }
    // FE - (One Optional Parameter) If waiting and next byte is C0h, then restart script and stop waiting. Else do nothing?
    if (op === 0xfe) {
      // TODO
      const arg = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FE',
        arg,
        raw,
        js: 'opFE()'
      }
    }
    // FF - (No Parameters) ScriptEnd
    if (op === 0xff) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'RET',
        raw,
        js: 'return()'
      }
    }
    // 00 - 2 scripts don't appear to have FF, but they both have 00 padding. Do this to allow parsing
    if (op === 0x00) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'RET2',
        raw,
        js: 'return2()'
      }
    }
    console.error('    unsupported opCode: 0x' + stringUtil.toHex2(op))
    throw new Error('unsupported opCode: 0x' + stringUtil.toHex2(op))
  }

  readBattleCameraFocusOp () {
    const $r = this
    const offset = this.offset
    const op = $r.readUByte()

    const getRaw = (from, to) => {
      // console.log('getRaw', from, to)
      this.offset = from
      return this.readUByteArray(to - from)
        .map(v => stringUtil.dec2hex(v, 2, true).toUpperCase())
        .join(' ')
    }
    // D8 - (Two Byte, Three Word, One Byte Parameters) *
    if (op === 0xd8) {
      const arg = $r.readUByte()
      const arg2 = $r.readShort()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readUByte()
      const arg6 = $r.readUByte() // Extra byte?
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'D8',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        arg6,
        raw,
        js: 'opD8()'
      }
    }
    // D9 - (No Parameters) Loads point from memory at 0xBFB1A0
    if (op === 0xd9) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'D9',
        raw,
        js: 'opD9()'
      }
    }
    // DB - (No Parameters) Sets Unknown to 0
    if (op === 0xdb) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ZNORM',
        raw,
        js: 'normalZOrientation()'
      }
    }
    // DC - (No Parameters) Sets Unknown to 1
    if (op === 0xdc) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ZINV',
        raw,
        js: 'invertedZOrientation()'
      }
    }
    // DD - (One Byte Parameter) Sets Current active "Idle" Camera (indexed in formation data) to parameter
    if (op === 0xdd) {
      const index = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETIDLE',
        index,
        raw,
        js: `setIdleCamFocusIndex({index: ${index}})`
      }
    }
    // DE - (One Byte Parameter) If non-0 parameter, set 0xBF2A34 to 3
    if (op === 0xde) {
      const arg = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DE',
        arg,
        raw,
        js: 'opDE()'
      }
    }
    // DF - (No Parameter) Sets 0xBF2A34 to Fh; No questions asked
    if (op === 0xdf) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DF',
        raw,
        js: 'opDF()'
      }
    }
    // E0 - (Two byte parameters)
    if (op === 0xe0) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'E0',
        arg,
        arg2,
        raw,
        js: 'opE0()'
      }
    }
    // E1 - (No Parameters) Loads point of current active "Idle" camera
    if (op === 0xe1) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'IDLE',
        raw,
        js: 'instantlyGoToIdle()'
      }
    }
    // E2 - (One Byte parameter) Does something with active "Idle" Camera index and loading a new point based on it.
    if (op === 0xe2) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVEI',
        frames,
        raw,
        js: `moveToIdlePositionAsync({frames: ${frames}})`
      }
    }
    // E3 - (Two Byte, Three Word, One Byte Parameters) *
    if (op === 0xe3) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readShort()
      const arg6 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'E3',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        arg6,
        raw,
        js: 'opE3()'
      }
    }
    // E4 - (One Byte, Three Word, One Byte Parameters) *
    if (op === 0xe4) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVEA',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `moveToAttacker({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E5 - (One Byte, Three Word, One Byte Parameters) *
    if (op === 0xe5) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVET',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `moveToTarget({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E6 - (Three Word, One Byte Parameters)
    if (op === 0xe6) {
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVE',
        x,
        y,
        z,
        frames,
        raw,
        js: `moveToPositionAsync({x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // E8 - (One Byte, Three Word, One Byte Parameters)
    if (op === 0xe8) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOLLOWA',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `followAttacker({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // EA - (One Byte, Three Word, One Byte Parameters)
    if (op === 0xea) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOLLOWT',
        bone,
        x,
        y,
        z,
        frames,
        raw,
        js: `followTarget({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}, frames: ${frames}})`
      }
    }
    // EC - (Two Byte, Three Word, One Byte Parameters)
    if (op === 0xec) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readShort()
      const arg6 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EC',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        arg6,
        raw,
        js: 'opEC()'
      }
    }
    // F0 - (Two Byte, Three Word Parameters)
    if (op === 0xf0) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readShort()
      const arg4 = $r.readShort()
      const arg5 = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'F0',
        arg,
        arg2,
        arg3,
        arg4,
        arg5,
        raw,
        js: 'opF0()'
      }
    }
    // F4 - No Parameters; "Pause" processing while decrementing "Wait" by 1 each iteration. (Seems sketchy since loops would be different based on processing power)
    if (op === 0xf4) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'WAIT',
        raw,
        js: 'executeWait()'
      }
    }
    // F5 - One Parameter; Set "Wait"
    if (op === 0xf5) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETWAIT',
        frames,
        raw,
        js: `setWait({frames: ${frames}})`
      }
    }
    // F8 - (One Byte, Three Word Parameters)
    if (op === 0xf8) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOCUST',
        bone,
        x,
        y,
        z,
        raw,
        js: `focusOnTarget({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}})`
      }
    }
    // F9 - (One Byte, Three Word Parameters)
    if (op === 0xf9) {
      const bone = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FOCUSA',
        bone,
        x,
        y,
        z,
        raw,
        js: `focusOnAttacker({bone: ${bone}, x: ${x}, y: ${y}, z: ${z}})`
      }
    }
    // FA - (Three Word Parameters) Load Point specified by parameters (X, Y, Z as Words)
    if (op === 0xfa) {
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'XYZ',
        x,
        y,
        z,
        raw,
        js: `setXYZ({x: ${x}, y: ${y}, z:${z}});`
      }
    }
    // FE - (One Optional Parameter) If waiting and next byte is C0h, then restart script and stop waiting. Else do nothing?
    if (op === 0xfe) {
      const arg = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FE',
        arg,
        raw,
        js: 'opFE()'
      }
    }
    // FF - (No Parameters) ScriptEnd
    if (op === 0xff) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'RET',
        raw,
        js: 'return()'
      }
    }

    console.error('unsupported opCode: 0x' + stringUtil.toHex2(op))
    throw new Error('unsupported opCode: 0x' + stringUtil.toHex2(op))
  }

  readBattleOp () {
    const $r = this
    const op = $r.readUByte()

    const getRaw = (o, a) => {
      if (a === undefined) {
        return stringUtil.dec2hex(o, 2, true)
      } else {
        return (stringUtil.dec2hex(o, 2, true) + stringUtil.dec2hex(a, 4, true))
          .match(/.{1,2}/g)
          .join(' ')
      }
    }
    if (op === 0x00) {
      const arg = $r.readUShort()
      return {
        op: 'PSHA',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '00',
        js: `pushFromAddress(${stringUtil.dec2hex(arg)}, 00);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x01) {
      const arg = $r.readUShort()
      return {
        op: 'PSHA',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '01',
        js: `pushFromAddress(${stringUtil.dec2hex(arg)}, 01);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x02) {
      const arg = $r.readUShort()
      return {
        op: 'PSHA',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '02',
        js: `pushFromAddress(${stringUtil.dec2hex(arg)}, 02);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x03) {
      const arg = $r.readUShort()
      return {
        op: 'PSHA',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '03',
        js: `pushFromAddress(${stringUtil.dec2hex(arg)}, 03);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x10) {
      const arg = $r.readUShort()
      return {
        op: 'PUSH',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '10',
        js: `push(${stringUtil.dec2hex(arg)}, 10);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x11) {
      const arg = $r.readUShort()
      return {
        op: 'PUSH',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '11',
        js: `push(${stringUtil.dec2hex(arg)}, 11);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x12) {
      const arg = $r.readUShort()
      return {
        op: 'PUSH',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '12',
        js: `push(${stringUtil.dec2hex(arg)}, 12);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x13) {
      const arg = $r.readUShort()
      return {
        op: 'PUSH',
        arg,
        argHex: stringUtil.dec2hex(arg),
        type: '13',
        js: `push(${stringUtil.dec2hex(arg)}, 13);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x30) {
      return { op: 'ADD', js: 'add();', raw: getRaw(op) }
    }
    if (op === 0x31) {
      return { op: 'SUB', js: 'subtract();', raw: getRaw(op) }
    }
    if (op === 0x32) {
      return { op: 'MUL', js: 'multiply();', raw: getRaw(op) }
    }
    if (op === 0x33) {
      return { op: 'DIV', js: 'divide();', raw: getRaw(op) }
    }
    if (op === 0x34) {
      return { op: 'MOD', js: 'modulo();', raw: getRaw(op) }
    }
    if (op === 0x35) {
      return { op: 'BAND', js: 'binaryAnd();', raw: getRaw(op) }
    }
    if (op === 0x36) {
      return { op: 'BOR', js: 'binaryOr();', raw: getRaw(op) }
    }
    if (op === 0x37) {
      return { op: 'BNOT', js: 'binaryNot();', raw: getRaw(op) }
    }

    if (op === 0x40) {
      return { op: 'EQU', js: 'equals();', raw: getRaw(op) }
    }
    if (op === 0x41) {
      return { op: 'NEQU', js: 'notEquals();', raw: getRaw(op) }
    }
    if (op === 0x42) {
      return { op: 'GEQU', js: 'greaterThanEquals();', raw: getRaw(op) }
    }
    if (op === 0x43) {
      return { op: 'LEQU', js: 'lessThanEquals();', raw: getRaw(op) }
    }
    if (op === 0x44) {
      return { op: 'GRTN', js: 'greaterThan();', raw: getRaw(op) }
    }
    if (op === 0x45) {
      return { op: 'LSTN', js: 'lessThan();', raw: getRaw(op) }
    }

    if (op === 0x50) {
      return { op: 'AND', js: 'bothPopsNonZero();', raw: getRaw(op) }
    }
    if (op === 0x51) {
      return { op: 'OR', js: 'eitherPopsNonZero();', raw: getRaw(op) }
    }
    if (op === 0x52) {
      return { op: 'NOT', js: 'isZero();', raw: getRaw(op) }
    }

    if (op === 0x60) {
      const arg = $r.readUByte()
      return {
        op: 'PUSHV',
        arg,
        argHex: stringUtil.dec2hex(arg),
        length: 1,
        js: `pushValue(${stringUtil.dec2hex(arg)}, 1);`,
        raw: getRaw(op, arg)
      }
    }

    if (op === 0x61) {
      const arg = $r.readUShort()
      return {
        op: 'PUSHV',
        arg,
        argHex: stringUtil.dec2hex(arg),
        length: 2,
        js: `pushValue(${stringUtil.dec2hex(arg)}, 2);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x62) {
      const arg = $r.read24bitInteger() // ?
      return {
        op: 'PUSHV',
        arg,
        argHex: stringUtil.dec2hex(arg),
        length: 3,
        js: `pushValue(${stringUtil.dec2hex(arg)}, 3);`,
        raw: getRaw(op, arg)
      }
    }

    if (op === 0x70) {
      const arg = $r.readUShort()
      return {
        op: 'JMP0',
        arg,
        argHex: stringUtil.dec2hex(arg),
        js: `jumpIfZero(${stringUtil.dec2hex(arg)}, 70);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x71) {
      const arg = $r.readUShort()
      return {
        op: 'JNEQ',
        arg,
        argHex: stringUtil.dec2hex(arg),
        js: `jumpNotEqual(${stringUtil.dec2hex(arg)}, 71);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x72) {
      const arg = $r.readUShort()
      return {
        op: 'JUMP',
        arg,
        argHex: stringUtil.dec2hex(arg),
        js: `jump(${stringUtil.dec2hex(arg)}, 72);`,
        raw: getRaw(op, arg)
      }
    }
    if (op === 0x73) {
      return { op: 'END', js: 'end();', raw: getRaw(op) }
    }
    if (op === 0x74) {
      return { op: 'POP', js: 'pop();', raw: getRaw(op) }
    }
    if (op === 0x75) {
      return { op: 'LINK', js: 'link();', raw: getRaw(op) }
    }

    if (op === 0x80) {
      return { op: 'MASK', js: 'maskSet();', raw: getRaw(op) }
    }
    if (op === 0x81) {
      return { op: 'RWRD', js: 'random();', raw: getRaw(op) }
    }
    if (op === 0x82) {
      return { op: 'RBYT', js: 'pickRandomBit();', raw: getRaw(op) }
    }
    if (op === 0x83) {
      return { op: 'CNTB', js: 'countBits();', raw: getRaw(op) }
    }
    if (op === 0x84) {
      return { op: 'HMSK', js: 'highMask();', raw: getRaw(op) }
    }
    if (op === 0x85) {
      return { op: 'LMSK', js: 'lowMask();', raw: getRaw(op) }
    }
    if (op === 0x86) {
      return { op: 'MPCT', js: 'getMPCost();', raw: getRaw(op) }
    }
    if (op === 0x87) {
      return { op: 'TBIT', js: 'toBit();', raw: getRaw(op) }
    }

    if (op === 0x90) {
      return { op: 'STRA', js: 'saveToAddress();', raw: getRaw(op) }
    }
    if (op === 0x91) {
      return { op: 'POPX', js: 'popX();', raw: getRaw(op) }
    }
    if (op === 0x92) {
      return { op: 'ATTK', js: 'attack();', raw: getRaw(op) }
    }
    if (op === 0x93) {
      const text = this.readKernelString(255)
      return {
        op: 'DSTR',
        text,
        js: `displayString(${text});`,
        raw: getRaw(op) // TODO - Add text to this if required
      }
    }
    if (op === 0x94) {
      return { op: 'COPY', js: 'copyMiscData();', raw: getRaw(op) }
    }
    if (op === 0x95) {
      return { op: 'GLOB', js: 'copyToMemoryBank();', raw: getRaw(op) }
    }
    if (op === 0x96) {
      return { op: 'EDEF', js: 'elementalDefense();', raw: getRaw(op) }
    }

    if (op === 0xa0) {
      const arg = $r.readUByte()
      const text = this.readString(255)
      return {
        op: 'DEBG',
        arg,
        argHex: stringUtil.dec2hex(arg),
        text,
        js: `displayDebug(${stringUtil.dec2hex(arg)}, ${text});`,
        raw: getRaw(op) // TODO - Add text to this if required
      }
    }
    if (op === 0xa1) {
      return { op: 'POP2', js: 'POP2();', raw: getRaw(op) }
    }

    console.error('unsupported opCode: 0x' + stringUtil.toHex2(op))
    throw new Error('unsupported opCode: 0x' + stringUtil.toHex2(op))
  }

  readOp () {
    const $r = this // in case we want to split this class into two classes, one for readUByte() etc. and one for readOp()+getCmpDesc()+getCharacterDesc()

    const offset1 = $r.offset

    const op = $r.readUByte()
    // if (offset1 >= 3080 && offset1 <= 3133) {
    //   console.log('op code byte', op, op.toString(16), offset1)
    // }

    if (op === 0x00) {
      return {
        op: 'RET',
        mr: 'Return',
        js: 'return;'
      }
    }

    if (op === 0x01) {
      const e = $r.readUByte()
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'REQ',
        e,
        p,
        f,
        mr: 'Execute script #%3 in extern group %1 (priority %2/6) - Only if the script is not already running|_script(groupID)|priority|scriptID',
        js:
          'entityExecuteAsync({entity:' +
          e +
          ', priority:' +
          p +
          ', function:' +
          f +
          '});',
        pres: 'Tells <entityName> to <scriptName>'
      }
    }

    if (op === 0x02) {
      const e = $r.readUByte()
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'REQSW',
        e,
        p,
        f,
        mr: 'Execute script #%3 in extern group %1 (priority %2/6) - Only if the script is not already running|_script(groupID)|priority|scriptID',
        js:
          'entityExecuteAsyncGuaranteed({entity:' +
          e +
          ', priority:' +
          p +
          ', function:' +
          f +
          '});',
        pres: 'Tells <entityName> to <scriptName>'
      }
    }

    if (op === 0x03) {
      const e = $r.readUByte()
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'REQEW',
        e,
        p,
        f,
        js:
          'entityExecuteSync({entity:' +
          e +
          ', priority:' +
          p +
          ', function:' +
          f +
          '});',
        pres: 'Tells <entityName> to <scriptName>'
      }
    }

    if (op === 0x04) {
      const e = $r.readUByte()
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'PREQ',
        e,
        p,
        f,
        js:
          'partyMemberExecuteAsync({entity:' +
          e +
          ', priority:' +
          p +
          ', function:' +
          f +
          '});',
        pres: 'Tells <partyMemberName> to <scriptName>'
      }
    }

    if (op === 0x05) {
      const e = $r.readUByte()
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'PRQSW',
        e,
        p,
        f,
        js:
          'partyMemberExecuteAsyncGuaranteed({partyMemberId:' +
          e +
          ', priority:' +
          p +
          ', function:' +
          f +
          '});',
        pres: 'Tells <partyMemberName> to <scriptName>'
      }
    }

    if (op === 0x06) {
      const e = $r.readUByte()
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'PRQEW',
        e,
        p,
        f,
        js:
          'partyMemberExecuteSync({partyMemberId:' +
          e +
          ', priority:' +
          p +
          ', function:' +
          f +
          '});',
        pres: 'Tells <partyMemberName> to <scriptName>'
      }
    }

    if (op === 0x07) {
      const bpbf = $r.readUByte()
      const p = (bpbf & 0b11100000) >> 5
      const f = bpbf & 0b00011111
      return {
        op: 'RETTO',
        p,
        f,
        js: 'returnToFunction({priority:' + p + ', function:' + f + '});'
      }
    }

    if (op === 0x08) {
      const s = $r.readUByte()
      return {
        op: 'JOIN',
        s,
        js: 'joinParty({slowness:' + s + '});',
        pres: 'The party gathers.'
      }
    }

    if (op === 0x09) {
      const bx1by1 = $r.readUByte()
      const bx1 = (bx1by1 & 0xf0) >> 4
      const by1 = bx1by1 & 0x0f
      const bd1bx2 = $r.readUByte()
      const bd1 = (bd1bx2 & 0xf0) >> 4
      const bx2 = bd1bx2 & 0x0f
      const by2bd2 = $r.readUByte()
      const by2 = (by2bd2 & 0xf0) >> 4
      const bd2 = by2bd2 & 0x0f
      const x1 = $r.readShort()
      const y1 = $r.readShort()
      const d1 = $r.readUByte()
      const x2 = $r.readShort()
      const y2 = $r.readShort()
      const d2 = $r.readUByte()
      const s = $r.readUByte()
      const x1Desc = bx1 === 0 ? x1 : 'Bank[' + bx1 + '][' + x1 + ']'
      const y1Desc = by1 === 0 ? y1 : 'Bank[' + by1 + '][' + y1 + ']'
      const d1Desc = bd1 === 0 ? d1 : 'Bank[' + bd1 + '][' + d1 + ']'
      const x2Desc = bx2 === 0 ? x2 : 'Bank[' + bx2 + '][' + x2 + ']'
      const y2Desc = by2 === 0 ? y2 : 'Bank[' + by2 + '][' + y2 + ']'
      const d2Desc = bd2 === 0 ? d2 : 'Bank[' + bd2 + '][' + d2 + ']'
      return {
        op: 'SPLIT',
        bx1,
        by1,
        bd1,
        bx2,
        by2,
        bd2,
        x1,
        y1,
        d1,
        x2,
        y2,
        d2,
        s,
        js:
          'splitParty({c1: {x:' +
          x1Desc +
          ', y:' +
          y1Desc +
          ', d:' +
          d1Desc +
          '}, c2: {x:' +
          x2Desc +
          ', y:' +
          y2Desc +
          ', d:' +
          d2Desc +
          '}, slowness:' +
          s +
          '});',
        pres: 'The party spreads out.'
      }
    }

    if (op === 0x0a) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const a1 = $r.readUByte()
      const a2 = $r.readUByte()
      const a3 = $r.readUByte()
      const a1Desc = b1 === 0 ? a1 : 'Bank[' + b1 + '][' + a1 + ']'
      const a2Desc = b2 === 0 ? a2 : 'Bank[' + b2 + '][' + a2 + ']'
      const a3Desc = b3 === 0 ? a3 : 'Bank[' + b3 + '][' + a3 + ']'
      return {
        op: 'SPTYE',
        b1,
        b2,
        b3,
        a1,
        a2,
        a3,
        js:
          'setParty({characterId1:' +
          a1Desc +
          ', characterId2:' +
          a2Desc +
          ', characterId3:' +
          a3Desc +
          '});',
        pres: 'The party changes to <A1,A2,A3>'
      }
    }

    if (op === 0x0b) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const a1 = $r.readUByte()
      const a2 = $r.readUByte()
      const a3 = $r.readUByte()
      const a1Desc = b1 === 0 ? a1 : 'Bank[' + b1 + '][' + a1 + ']'
      const a2Desc = b2 === 0 ? a2 : 'Bank[' + b2 + '][' + a2 + ']'
      const a3Desc = b3 === 0 ? a3 : 'Bank[' + b3 + '][' + a3 + ']'
      return {
        op: 'GTPYE',
        b1,
        b2,
        b3,
        a1,
        a2,
        a3,
        js:
          a1Desc +
          ' = getParty({partyId:0}); ' +
          a2Desc +
          ' = getParty({partyId:1}); ' +
          a3Desc +
          ' = getParty({partyId:2});',
        pres: 'The party prepares to switch up...'
      }
    }

    // 0c, 0d are unused
    if (op >= 0x0c && op <= 0x0d) {
      console.error('invalid opCode: 0x' + stringUtil.toHex2(op))
      throw new Error('invalid opCode: 0x' + stringUtil.toHex2(op))
    }

    if (op === 0x0e) {
      const d = $r.readUByte()
      return {
        op: 'DSKCG',
        d,
        js: 'diskChangeScreen({diskId:' + d + '});'
      }
    }

    if (op === 0x0f) {
      const subOp = $r.readUByte()
      const params = []
      const numBytes = {
        0xf5: 1,
        0xf6: 1,
        0xf7: 1,
        0xf8: 2,
        0xf9: 0,
        0xfa: 0,
        0xfb: 1,
        0xfc: 1,
        0xfd: 2,
        0xfe: 0,
        0xff: 0
      }[subOp]
      for (let i = 0; i < numBytes; i++) {
        const byte = $r.readUByte()
        params.push(byte)
      }
      const subOpName = {
        0xf5: 'ARROW',
        0xf6: 'PNAME',
        0xf7: 'GMSPD',
        0xf8: 'SMSPD',
        0xf9: 'FLMAT',
        0xfa: 'FLITM',
        0xfb: 'BTLCK',
        0xfc: 'MVLCK',
        0xfd: 'SPCNM',
        0xfe: 'RSGLB',
        0xff: 'CLITM'
      }[subOp]
      return {
        op: 'SPECIAL',
        subOp,
        params,
        js:
          "specialOp({subOpName:'" +
          subOpName +
          "', params:" +
          JSON.stringify(params, null, 0) +
          '});'
      }
    }

    if (op === 0x10) {
      const baseOffset = this.offset - this.startOffset
      const a = $r.readUByte()
      return {
        op: 'JMPF',
        a,
        js: 'goto ' + (baseOffset + a) + ';',
        goto: baseOffset + a
      }
    }

    if (op === 0x11) {
      const baseOffset = this.offset - this.startOffset
      const a = $r.readUShort()
      return {
        op: 'JMPFL',
        a,
        js: 'goto ' + (baseOffset + a) + ';',
        goto: baseOffset + a
      }
    }

    if (op === 0x12) {
      const baseOffset = this.offset - 1 - this.startOffset
      const a = $r.readUByte()
      return {
        op: 'JMPB',
        a,
        js: 'goto ' + (baseOffset - a) + ';',
        goto: baseOffset - a
      }
    }

    if (op === 0x13) {
      const baseOffset = this.offset - 1 - this.startOffset
      const a = $r.readUShort()
      return {
        op: 'JMPBL',
        a,
        js: 'goto ' + (baseOffset - a) + ';',
        goto: baseOffset - a
      }
    }

    if (op === 0x14) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUByte()
      const v = $r.readUByte()
      const c = $r.readUByte()
      const e = $r.readUByte()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const vDesc = b2 === 0 ? v : 'Bank[' + b2 + '][' + v + ']'
      const cDesc = this.getCmpDesc(aDesc, c, vDesc)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFUB',
        b1,
        b2,
        a,
        v,
        c,
        e,
        js: 'if (' + cDesc + ') (else goto ' + (baseOffset + e) + ');',
        goto: baseOffset + e
      }
    }

    if (op === 0x15) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUByte()
      const v = $r.readUByte()
      const c = $r.readUByte()
      const e = $r.readUShort()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const vDesc = b2 === 0 ? v : 'Bank[' + b2 + '][' + v + ']'
      const cDesc = this.getCmpDesc(aDesc, c, vDesc)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFUBL',
        b1,
        b2,
        a,
        v,
        c,
        e,
        js: 'if (' + cDesc + ') (else goto ' + (baseOffset + e) + ');',
        goto: baseOffset + e
      }
    }

    if (op === 0x16) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUShort()
      const v = $r.readShort()
      const c = $r.readUByte()
      const e = $r.readUByte()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const vDesc = b2 === 0 ? v : 'Bank[' + b2 + '][' + v + ']'
      const cDesc = this.getCmpDesc(aDesc, c, vDesc)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFSW',
        b1,
        b2,
        a,
        v,
        c,
        e,
        js: 'if (' + cDesc + ') (else goto ' + (baseOffset + e) + ');',
        goto: baseOffset + e
      }
    }

    if (op === 0x17) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUShort()
      const v = $r.readShort()
      const c = $r.readUByte()
      const e = $r.readUShort()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const vDesc = b2 === 0 ? v : 'Bank[' + b2 + '][' + v + ']'
      const cDesc = this.getCmpDesc(aDesc, c, vDesc)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFSWL',
        b1,
        b2,
        a,
        v,
        c,
        e,
        js: 'if (' + cDesc + ') (else goto ' + (baseOffset + e) + ');',
        goto: baseOffset + e
      }
    }

    if (op === 0x18) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUShort()
      const v = $r.readUShort()
      const c = $r.readUByte()
      const e = $r.readUByte()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const vDesc = b2 === 0 ? v : 'Bank[' + b2 + '][' + v + ']'
      const cDesc = this.getCmpDesc(aDesc, c, vDesc)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFUW',
        b1,
        b2,
        a,
        v,
        c,
        e,
        js: 'if (' + cDesc + ') (else goto ' + (baseOffset + e) + ');',
        goto: baseOffset + e
      }
    }

    if (op === 0x19) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUShort()
      const v = $r.readUShort()
      const c = $r.readUByte()
      const e = $r.readUShort()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const vDesc = b2 === 0 ? v : 'Bank[' + b2 + '][' + v + ']'
      const cDesc = this.getCmpDesc(aDesc, c, vDesc)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFUWL',
        b1,
        b2,
        a,
        v,
        c,
        e,
        js: 'if (' + cDesc + ') (else goto ' + (baseOffset + e) + ');',
        goto: baseOffset + e
      }
    }

    // 1a, 1b, 1c, 1d, 1e, 1f are all unused
    if (op >= 0x1a && op <= 0x1f) {
      console.error('invalid opCode: 0x' + stringUtil.toHex2(op))
      throw new Error('invalid opCode: 0x' + stringUtil.toHex2(op))
    }

    // TODO: Minigame types
    if (op === 0x20) {
      const m = $r.readUShort()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const g = $r.readUByte()
      const t = $r.readUByte()
      return {
        op: 'MINIGAME',
        m,
        x,
        y,
        z,
        g,
        t,
        js:
          'runMinigame({mapId:' +
          m +
          ', x:' +
          x +
          ', y:' +
          y +
          ', z:' +
          z +
          ', value:' +
          g +
          ', gameType:' +
          t +
          '});'
      }
    }

    if (op === 0x21) {
      const t = $r.readUByte()
      return {
        op: 'TUTOR',
        t,
        js: 'openMainMenuAndPlayTutorial({tutorialId:' + t + '});'
      }
    }

    if (op === 0x22) {
      const bits1 = $r.readUByte()
      const bits2 = $r.readUByte()
      const bits3 = $r.readUByte()
      const bits4 = $r.readUByte()
      const descriptions = []
      if (bits1 & 0b10000000) {
        descriptions.push('DisableRewardScreens')
      }
      if (bits1 & 0b01000000) {
        descriptions.push('ActivateArenaMode')
      }
      if (bits1 & 0b00100000) {
        descriptions.push('DisableVictoryMusic')
      }
      if (bits1 & 0b00010000) {
        descriptions.push('Unknown0b00010000')
      }
      if (bits1 & 0b00001000) {
        descriptions.push('CanNotEscape')
      }
      if (bits1 & 0b00000100) {
        descriptions.push('PreEmptiveAttack')
      }
      if (bits1 & 0b00000010) {
        descriptions.push('TimedBattleWithoutRewardScreen')
      }
      if (bits1 & 0b00000001) {
        descriptions.push('Unknown0b00000001')
      }
      if (bits2 & 0b00000001) {
        descriptions.push('NoCelebrations')
      }
      if (bits3 & 0b10000000) {
        descriptions.push('DisableGameOver')
      }
      if (bits3 & 0b00000001) {
        descriptions.push('DisableGameOver')
      }
      return {
        op: 'BTMD2',
        bits1,
        bits2,
        bits3,
        bits4,
        js: 'setBattleModeOptions(' + descriptions.join(', ') + ');',
        pres: descriptions.join(', ')
      }
    }

    if (op === 0x23) {
      // TODO: battle result bits
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'BTRLD',
        b,
        a,
        js: aDesc + ' = getLastBattleResult();'
      }
    }

    if (op === 0x24) {
      const a = $r.readUShort()
      return {
        op: 'WAIT',
        a,
        js: 'wait({numFrames:' + a + '});'
      }
    }

    if (op === 0x25) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const bxb3 = $r.readUByte()
      const b3 = bxb3 & 0x0f
      const t = $r.readUByte()
      const r = $r.readUByte()
      const g = $r.readUByte()
      const b = $r.readUByte()
      const s = $r.readUByte()
      const unused = $r.readUByte()
      const rDesc = b1 === 0 ? r : 'Bank[' + b1 + '][' + r + ']'
      const gDesc = b2 === 0 ? g : 'Bank[' + b2 + '][' + g + ']'
      const bDesc = b3 === 0 ? b : 'Bank[' + b3 + '][' + b + ']'
      return {
        op: 'NFADE',
        b1,
        b2,
        b3,
        r,
        g,
        b,
        s,
        t,
        unused,
        js:
          'fadeScreenN({r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          ', speed:' +
          s +
          ', type:' +
          t +
          '}); // unused=' +
          unused,
        pres: 'The screen fades...'
      }
    }

    if (op === 0x26) {
      const s = $r.readUByte()
      const sFuncDesc = s === 0 ? 'enableBlink' : 'disableBlink'
      return {
        op: 'BLINK',
        s,
        js: sFuncDesc + '();'
      }
    }

    if (op === 0x27) {
      const s = $r.readUByte()
      const sFuncDesc = s === 0 ? 'bgMovieOn' : 'bgMovieOff'
      return {
        op: 'BGMOVIE',
        s,
        js: sFuncDesc + '();'
      }
    }

    if (op === 0x28) {
      const l = $r.readUByte()
      const s = $r.readUByte()
      const vars = []
      for (let i = 0; i < l - 3; i++) {
        vars.push($r.readUByte())
      }
      const subOpName = {
        0x00: 'EYETX',
        0x01: 'TRNSP',
        0x02: 'AMBNT',
        0x04: '04',
        0x06: 'LIGHT',
        0x07: '07',
        0x08: '08',
        0x09: '09',
        0x0a: 'SBOBJ',
        0x0b: '11',
        0x0c: '12',
        0x0d: 'SHINE',
        0xff: 'RESET'
      }[s]

      return {
        op: 'KAWAI',
        s,
        vars,
        js: `doCharacterGraphicsOp({subOpCode:${s}, subOpName:'${subOpName}', vars:${vars}});`
      }
    }

    if (op === 0x29) {
      return {
        op: 'KAWIW',
        js: 'waitForCharacterGraphicsOp();'
      }
    }

    if (op === 0x2a) {
      const p = $r.readUByte()
      return {
        op: 'PMOVA',
        p,
        js: 'moveToPartyMember({partyId:' + p + '});'
      }
    }

    if (op === 0x2b) {
      const s = $r.readUByte()
      const sFuncDesc = s === 0 ? 'slipOn' : 'slipOff'
      return {
        op: 'SLIP',
        s,
        js: sFuncDesc + '();'
      }
    }

    if (op === 0x2c) {
      const b1bx = $r.readUByte()
      const b1 = (b1bx & 0xf0) >> 4
      const bx = b1bx & 0x0f
      const l = $r.readUByte()
      const z = $r.readShort()
      const zDesc = b1 === 0 ? z : 'Bank[' + b1 + '][' + z + ']'
      return {
        op: 'BGPDH',
        b1,
        l,
        z,
        js: 'setBackgroundZDepth({layerId:' + l + ', z:' + zDesc + '});'
      }
    }

    if (op === 0x2d) {
      const bxby = $r.readUByte()
      const bx = (bxby & 0xf0) >> 4
      const by = bxby & 0x0f
      const l = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const xDesc = bx === 0 ? x : 'Bank[' + bx + '][' + x + ']'
      const yDesc = by === 0 ? y : 'Bank[' + by + '][' + y + ']'
      return {
        op: 'BGSCR',
        bx,
        by,
        l,
        x,
        y,
        js:
          'scrollBackgroundLayer({layerId:' +
          l +
          ', xSpeed:' +
          x +
          ', ySpeed:' +
          y +
          '});',
        pres: 'The background scrolls...'
      }
    }

    if (op === 0x2e) {
      const w = $r.readUByte()
      return {
        op: 'WCLS',
        w,
        js: 'closeWindow({windowId:' + w + '});'
      }
    }

    if (op === 0x2f) {
      const i = $r.readUByte()
      const x = $r.readUShort()
      const y = $r.readUShort()
      const w = $r.readUShort()
      const h = $r.readUShort()
      return {
        op: 'WSIZW',
        i,
        x,
        y,
        w,
        h,
        js:
          'resizeWindow({windowId:' +
          i +
          ', x:' +
          x +
          ', y:' +
          y +
          ', width:' +
          w +
          ', height:' +
          h +
          '});'
      }
    }

    // TODO: Button IDs:
    // 1=assist, 8=start, 10=up, 20=right, 40=down, 80=left, 100=camera, 200=target, 400=pgup, 800=pgdown, 1000=menu, 2000=ok, 4000=cancel, 8000=switch
    if (op === 0x30) {
      const b = $r.readUShort()
      const a = $r.readUByte()
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFKEY',
        b,
        a,
        js:
          'if keyPressed({inputKeyBitField:' +
          b +
          ') (else goto ' +
          (baseOffset + a) +
          ');',
        goto: baseOffset + a
      }
    }

    if (op === 0x31) {
      const b = $r.readUShort()
      const a = $r.readUByte()
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFKEYON',
        b,
        a,
        js:
          'if keyPressedJustPressed({inputKeyBitField:' +
          b +
          ') (else goto ' +
          (baseOffset + a) +
          ');',
        goto: baseOffset + a
      }
    }

    if (op === 0x32) {
      const b = $r.readUShort()
      const a = $r.readUByte()
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFKEYOFF',
        b,
        a,
        js:
          'if keyPressedJustReleased({inputKeyBitField:' +
          b +
          ') (else goto ' +
          (baseOffset + a) +
          ');',
        goto: baseOffset + a
      }
    }

    if (op === 0x33) {
      const s = $r.readUByte()
      const sDesc = s === 0 ? 'M.Movable' : 'M.Frozen'
      return {
        op: 'UC',
        s,
        js: 'setPlayableCharacterMovability(' + sDesc + ');'
      }
    }

    if (op === 0x34) {
      const c = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'PDIRA',
        c,
        js: 'turnToCharacterOrLeaderInstant({character:' + cDesc + '});'
      }
    }

    if (op === 0x35) {
      const p = $r.readUByte()
      const s = $r.readUByte()
      const a = $r.readUByte()
      return {
        op: 'PTURA',
        p,
        s,
        a,
        js:
          'turnToPartyMember({partyId:' +
          p +
          ', slowness:' +
          s +
          ', directionA:' +
          a +
          '});'
      }
    }

    if (op === 0x36) {
      const w = $r.readUByte()
      const t = $r.readUByte()
      const x = $r.readUByte()
      const y = $r.readUByte()
      return {
        op: 'WSPCL',
        w,
        t,
        x,
        y,
        js:
          'createNumericWindow({windowId:' +
          w +
          ', type:' +
          t +
          ', x:' +
          x +
          ', y:' +
          y +
          '});'
      }
    }

    if (op === 0x37) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const w = $r.readUByte()
      const nLow = $r.readUShort()
      const nHigh = $r.readUShort()
      const c = $r.readUByte()
      const nLowDesc = b1 === 0 ? nLow : 'Bank[' + b1 + '][' + nLow + ']'
      const nHighDesc = b2 === 0 ? nHigh : 'Bank[' + b2 + '][' + nHigh + ']'
      return {
        op: 'WNUMB',
        b1,
        b2,
        w,
        nLow,
        nHigh,
        c,
        js:
          'setNumericWindowDisplayValue({windowId:' +
          w +
          ', low:' +
          nLowDesc +
          ', high:' +
          nHighDesc +
          ', maxDigits:' +
          c +
          '});'
      }
    }

    if (op === 0x38) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const bxb3 = $r.readUByte()
      const b3 = bxb3 & 0x0f
      const h = $r.readUByte()
      const m = $r.readUByte()
      const s = $r.readUByte()
      const hDesc = b1 === 0 ? h : 'Bank[' + b1 + '][' + h + ']'
      const mDesc = b2 === 0 ? m : 'Bank[' + b2 + '][' + m + ']'
      const sDesc = b3 === 0 ? s : 'Bank[' + b3 + '][' + s + ']'
      return {
        op: 'STTIM',
        b1,
        b2,
        b3,
        h,
        m,
        s,
        js:
          'setNumericWindowTimeValue({h:' +
          hDesc +
          ', m:' +
          mDesc +
          ', s:' +
          sDesc +
          '});'
      }
    }

    if (op === 0x39) {
      const b1bx = $r.readUByte()
      const b1 = (b1bx & 0xf0) >> 4
      const bx = b1bx & 0x0f
      const a = $r.readUInt()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      return {
        op: 'GOLDU',
        b1,
        a,
        js: 'increaseGilBy({increment:' + aDesc + '});'
      }
    }

    if (op === 0x3a) {
      const b1bx = $r.readUByte()
      const b1 = (b1bx & 0xf0) >> 4
      const bx = b1bx & 0x0f
      const a = $r.readUInt()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      return {
        op: 'GOLDD',
        b1,
        a,
        js: 'decreaseGilBy({decrement:' + aDesc + '});'
      }
    }

    if (op === 0x3b) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const nLow = $r.readUByte()
      const nHigh = $r.readUByte()
      const nLowDesc = b1 === 0 ? nLow : 'Bank[' + b1 + '][' + nLow + ']'
      const nHighDesc = b2 === 0 ? nHigh : 'Bank[' + b2 + '][' + nHigh + ']'
      return {
        op: 'CHGLD',
        b1,
        b2,
        nLow,
        nHigh,
        js: nLowDesc + ' = getGilLow(); ' + nHighDesc + ' = getGilHigh();'
      }
    }

    if (op === 0x3c) {
      return {
        op: 'HMPMAX1',
        js: 'restoreHPMPMax({ver:0x3c});'
      }
    }

    if (op === 0x3d) {
      return {
        op: 'HMPMAX2',
        js: 'restoreHPMPMax({ver:0x3d});'
      }
    }

    if (op === 0x3e) {
      return {
        op: 'MHMMX',
        js: 'restoreHPMPMax({ver:0x3e});'
      }
    }

    if (op === 0x3f) {
      return {
        op: 'HMPMAX3',
        js: 'restoreHPMPMax({ver:0x3f});'
      }
    }

    if (op === 0x40) {
      const n = $r.readUByte()
      const d = $r.readUByte()
      return {
        op: 'MESSAGE',
        n,
        d,
        js:
          'showWindowWithDialog({window:' +
          n +
          ', dialog:' +
          d +
          '}); // ' +
          this.dialogStrings[d]
      }
    }

    if (op === 0x41) {
      const b = $r.readUByte()
      const w = $r.readUByte()
      const i = $r.readUByte()
      const v = $r.readUByte()
      const vDesc = b === 0 ? v : 'Bank[' + b + '][' + v + ']'
      return {
        op: 'MPARA',
        b,
        w,
        i,
        v,
        js:
          'setMessageParam({windowId:' +
          w +
          ', varId:' +
          i +
          ', value:' +
          vDesc +
          '});'
      }
    }

    if (op === 0x42) {
      const b = $r.readUByte()
      const w = $r.readUByte()
      const i = $r.readUByte()
      const v = $r.readUShort()
      const vDesc = b === 0 ? v : 'Bank[' + b + '][' + v + ']'
      return {
        op: 'MPRA2',
        b,
        w,
        i,
        v,
        js:
          'setMessageParam({windowId:' +
          w +
          ', varId:' +
          i +
          ', value:' +
          vDesc +
          '});'
      }
    }

    if (op === 0x43) {
      const dialogId = $r.readUByte()
      return {
        op: 'MPNAM',
        dialogId,
        js: 'setMapName({dialog:' + dialogId + '});'
      }
    }

    // 0x44 is unused

    if (op === 0x45) {
      const b = $r.readUByte()
      const p = $r.readUByte()
      const v = $r.readUShort()
      const vDesc = b === 0 ? v : 'Bank[' + b + '][' + v + ']'
      return {
        op: 'MPUP',
        b,
        p,
        v,
        js: 'increaseMP({partyId:' + p + ', increment:' + vDesc + '});'
      }
    }

    // 0x46 is unused

    if (op === 0x47) {
      const b = $r.readUByte()
      const p = $r.readUByte()
      const v = $r.readUShort()
      const vDesc = b === 0 ? v : 'Bank[' + b + '][' + v + ']'
      return {
        op: 'MPDWN',
        b,
        p,
        v,
        js: 'decreaseMP({partyId:' + p + ', decrement:' + vDesc + '});'
      }
    }

    if (op === 0x48) {
      // TODO: Menu Types and Event Types
      const ba = $r.readUByte()
      const w = $r.readUByte()
      const d = $r.readUByte()
      const f = $r.readUByte()
      const l = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = ba === 0 ? a : 'Bank[' + ba + '][' + a + ']'
      return {
        op: 'ASK',
        ba,
        w,
        d,
        f,
        l,
        a,
        js:
          aDesc +
          ' = askQuestion({window:' +
          w +
          ', dialog:' +
          d +
          ', firstChoice:' +
          f +
          ', lastChoice:' +
          l +
          '});'
      }
    }

    if (op === 0x49) {
      // TODO: Menu Types and Event Types
      const b = $r.readUByte()
      const t = $r.readUByte()
      const p = $r.readUByte()
      const pDesc = b === 0 ? p : 'Bank[' + b + '][' + p + ']'
      return {
        op: 'MENU',
        b,
        t,
        p,
        js: 'callMenu({type:' + t + ', param:' + p + '});'
      }
    }

    if (op === 0x4a) {
      const s = $r.readUByte()
      const sDesc = s === 0 ? 'MM.Accessible' : 'MM.Inaccessible'
      return {
        op: 'MENU2',
        s,
        js: 'setMainMenuAccessibility(' + sDesc + ');'
      }
    }

    if (op === 0x4b) {
      const i = $r.readUByte()
      return {
        op: 'BTLTB',
        i,
        js: 'setBattleEncounterTable({index:' + i + '});'
      }
    }

    // 0x4c is unused

    if (op === 0x4d) {
      const b = $r.readUByte()
      const p = $r.readUByte()
      const v = $r.readUShort()
      const vDesc = b === 0 ? v : 'Bank[' + b + '][' + v + ']'
      return {
        op: 'HPUP',
        b,
        p,
        v,
        js: 'increaseHP({partyId:' + p + ', increment:' + vDesc + '});'
      }
    }

    // 0x4e is unused

    if (op === 0x4f) {
      const b = $r.readUByte()
      const p = $r.readUByte()
      const v = $r.readUShort()
      const vDesc = b === 0 ? v : 'Bank[' + b + '][' + v + ']'
      return {
        op: 'HPDWN',
        b,
        p,
        v,
        js: 'decreaseHP({partyId:' + p + ', decrement:' + vDesc + '});'
      }
    }

    if (op === 0x50) {
      const n = $r.readUByte()
      const x = $r.readUShort()
      const y = $r.readUShort()
      const w = $r.readUShort()
      const h = $r.readUShort()
      return {
        op: 'WINDOW',
        n,
        x,
        y,
        w,
        h,
        js:
          'createWindow({window:' +
          n +
          ', x:' +
          x +
          ', y:' +
          y +
          ', width:' +
          w +
          ', height:' +
          h +
          '});'
      }
    }

    if (op === 0x51) {
      const w = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      return {
        op: 'WMOVE',
        w,
        x,
        y,
        js: 'setWindowPosition({windowId:' + w + ', x:' + x + ', y:' + y + '});'
      }
    }

    if (op === 0x52) {
      const w = $r.readUByte()
      const m = $r.readUByte()
      const p = $r.readUByte()
      const mDesc =
        m === 0
          ? 'WindowMode.Normal'
          : m === 1
            ? 'WindowMode.NoBackgroundNoBorder'
            : m === 2
              ? 'WindowMode.TransparentBackground'
              : 'WindowMode.UNKNOWN_' + m
      const pDesc =
        p === 0
          ? 'Closability.Closable'
          : p === 1
            ? 'Closability.NotClosable'
            : 'Closability.UNKNOWN_' + p
      return {
        op: 'WMODE',
        w,
        m,
        p,
        js:
          'setWindowModes({windowId:' +
          w +
          ', mode:' +
          m +
          ', closability:' +
          p +
          '});'
      }
    }

    if (op === 0x53) {
      const w = $r.readUByte()
      return {
        op: 'WREST',
        w,
        js: 'resetWindow({windowId:' + w + '});'
      }
    }

    if (op === 0x54) {
      const w = $r.readUByte()
      return {
        op: 'WCLSE',
        w,
        js: 'closeWindow({windowId:' + w + '});'
      }
    }

    if (op === 0x55) {
      const w = $r.readUByte()
      const r = $r.readUByte()
      return {
        op: 'WROW',
        w,
        r,
        js: 'setWindowHeightByNumRows({windowId:' + w + ', numRows:' + r + '});'
      }
    }

    if (op === 0x56) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const c = $r.readUByte()
      const r = $r.readUByte()
      const g = $r.readUByte()
      const b = $r.readUByte()
      const cDesc = b1 === 0 ? c : 'Bank[' + b1 + '][' + c + ']'
      const rDesc = b2 === 0 ? r : 'Bank[' + b2 + '][' + r + ']'
      const gDesc = b3 === 0 ? g : 'Bank[' + b3 + '][' + g + ']'
      const bDesc = b4 === 0 ? b : 'Bank[' + b4 + '][' + b + ']'
      return {
        op: 'GWCOL',
        b1,
        b2,
        b3,
        b4,
        c,
        r,
        g,
        b,
        js:
          '{ let color = getWindowColor({cornerId:' +
          cDesc +
          '}); ' +
          rDesc +
          ' = color.r; ' +
          gDesc +
          ' = color.g; ' +
          bDesc +
          ' = color.b; }'
      }
    }

    if (op === 0x57) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const c = $r.readUByte()
      const r = $r.readUByte()
      const g = $r.readUByte()
      const b = $r.readUByte()
      const cDesc = b1 === 0 ? c : 'Bank[' + b1 + '][' + c + ']'
      const rDesc = b2 === 0 ? r : 'Bank[' + b2 + '][' + r + ']'
      const gDesc = b3 === 0 ? g : 'Bank[' + b3 + '][' + g + ']'
      const bDesc = b4 === 0 ? b : 'Bank[' + b4 + '][' + b + ']'
      return {
        op: 'SWCOL',
        b1,
        b2,
        b3,
        b4,
        c,
        r,
        g,
        b,
        js:
          'setWindowColor({cornerId:' +
          cDesc +
          ', color:{r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          '}});'
      }
    }

    if (op === 0x58) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const t = $r.readUShort()
      const a = $r.readUByte()
      const tDesc = b1 === 0 ? t : 'Bank[' + b1 + '][' + t + ']'
      const aDesc = b2 === 0 ? a : 'Bank[' + b2 + '][' + a + ']'
      return {
        op: 'STITM',
        b1,
        b2,
        t,
        a,
        js: 'addItem({item:' + tDesc + ', amount:' + aDesc + '});'
      }
    }

    if (op === 0x59) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const t = $r.readUShort()
      const a = $r.readUByte()
      const tDesc = b1 === 0 ? t : 'Bank[' + b1 + '][' + t + ']'
      const aDesc = b2 === 0 ? a : 'Bank[' + b2 + '][' + a + ']'
      return {
        op: 'DLITM',
        b1,
        b2,
        t,
        a,
        js: 'dropItem({item:' + tDesc + ', amount:' + aDesc + '});'
      }
    }

    if (op === 0x5a) {
      const b = $r.readUByte()
      const i = $r.readUShort()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'CKITM',
        b,
        i,
        a,
        js: aDesc + ' = getItemCount({itemId:' + i + '});'
      }
    }

    if (op === 0x5b) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const t = $r.readUByte()
      const apByte1 = $r.readUByte()
      const apByte2 = $r.readUByte()
      const apByte3 = $r.readUByte()
      const tDesc = b1 === 0 ? t : 'Bank[' + b1 + '][' + t + ']'
      const apByte1Desc =
        b2 === 0 ? apByte1 : 'Bank[' + b2 + '][' + apByte1 + ']'
      const apByte2Desc =
        b3 === 0 ? apByte2 : 'Bank[' + b3 + '][' + apByte2 + ']'
      const apByte3Desc =
        b4 === 0 ? apByte3 : 'Bank[' + b4 + '][' + apByte3 + ']'
      let apDesc =
        '(' +
        apByte1Desc +
        ' + 256 * ' +
        apByte2Desc +
        ' + 65536 * ' +
        apByte3Desc +
        ')'
      if (b2 === 0 && b3 === 0 && b4 === 0) {
        apDesc = apByte1 + 256 * apByte2 + 65536 * apByte3
      }
      return {
        op: 'SMTRA',
        b1,
        b2,
        b3,
        b4,
        t,
        apByte1,
        apByte2,
        apByte3,
        js: 'addMateriaToInventory({materiaId:' + t + ', ap:' + apDesc + '});'
      }
    }

    if (op === 0x5c) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const t = $r.readUByte()
      const apByte1 = $r.readUByte()
      const apByte2 = $r.readUByte()
      const apByte3 = $r.readUByte()
      const a = $r.readUByte()
      const tDesc = b1 === 0 ? t : 'Bank[' + b1 + '][' + t + ']'
      const apByte1Desc =
        b2 === 0 ? apByte1 : 'Bank[' + b2 + '][' + apByte1 + ']'
      const apByte2Desc =
        b3 === 0 ? apByte2 : 'Bank[' + b3 + '][' + apByte2 + ']'
      const apByte3Desc =
        b4 === 0 ? apByte3 : 'Bank[' + b4 + '][' + apByte3 + ']'
      let apDesc =
        '(' +
        apByte1Desc +
        ' + 256 * ' +
        apByte2Desc +
        ' + 65536 * ' +
        apByte3Desc +
        ')'
      if (b2 === 0 && b3 === 0 && b4 === 0) {
        apDesc = apByte1 + 256 * apByte2 + 65536 * apByte3
      }
      return {
        op: 'DMTRA',
        b1,
        b2,
        b3,
        b4,
        t,
        apByte1,
        apByte2,
        apByte3,
        js:
          'deleteMateriaFromInventory({materiaId:' +
          t +
          ', ap:' +
          apDesc +
          ', amount:' +
          a +
          '});'
      }
    }

    // 0x5d is supposedly not used in the game

    if (op === 0x5e) {
      const u1 = $r.readUByte()
      const u2 = $r.readUByte()
      const t = $r.readUByte()
      const xA = $r.readUByte()
      const xF = $r.readUByte()
      const yA = $r.readUByte()
      const yF = $r.readUByte()
      const typeStrings = [
        '"Reset"',
        '"Horizontal"',
        '"Vertical"',
        '"BothAxes"'
      ]
      return {
        op: 'SHAKE',
        u1,
        u2,
        t,
        xA,
        xF,
        yA,
        yF,
        js: `shake({type: ${typeStrings[t]}, xAmplitude: ${xA}, xFrames: ${xF}, yAmplitude: ${xA}, yFrames: ${xF} });`
      }
    }

    if (op === 0x5f) {
      return {
        op: 'NOP',
        js: 'noOp();'
      }
    }

    if (op === 0x60) {
      const f = $r.readUShort()
      const x = $r.readShort()
      const y = $r.readShort()
      const i = $r.readShort()
      const d = $r.readUByte()
      return {
        op: 'MAPJUMP',
        f,
        x,
        y,
        i,
        d,
        js:
          'mapJump({fieldId:' +
          f +
          ', x:' +
          x +
          ', y:' +
          y +
          ', triangleId:' +
          i +
          ', direction:' +
          d +
          '});'
      }
    }

    if (op === 0x61) {
      const p = $r.readUByte()
      return {
        op: 'SCRLO',
        p,
        js: 'scrollOp0x61({param:' + p + '});',
        pres: 'The camera scrolls...'
      }
    }

    if (op === 0x62) {
      const p1 = $r.readUByte()
      const p2 = $r.readUByte()
      const p3 = $r.readUByte()
      const p4 = $r.readUByte()
      return {
        op: 'SCRLC',
        p1,
        p2,
        p3,
        p4,
        js:
          'scrollOp0x62({param1:' +
          p1 +
          ', param2:' +
          p2 +
          ', param3:' +
          p3 +
          ', param4:' +
          p4 +
          '});',
        pres: 'The camera scrolls...'
      }
    }

    if (op === 0x63) {
      const b = $r.readUByte()
      const s = $r.readUShort()
      const e = $r.readUByte()
      const t = $r.readUByte()
      const sDesc = b === 0 ? s : 'Bank[' + b + '][' + s + ']'
      return {
        op: 'SCRLA',
        b,
        s,
        e,
        t,
        js:
          'scrollToEntity({speedInFrame:' +
          sDesc +
          ', entityId:' +
          e +
          ', scrollType:' +
          t +
          '});',
        pres: 'The camera pans to <E' + e + '>.'
      }
    }

    if (op === 0x64) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const targetX = $r.readShort()
      const targetY = $r.readShort()
      const xDesc = b1 === 0 ? targetX : 'Bank[' + b1 + '][' + targetX + ']'
      const yDesc = b2 === 0 ? targetY : 'Bank[' + b2 + '][' + targetY + ']'
      return {
        op: 'SCR2D',
        b1,
        b2,
        targetX,
        targetY,
        js: 'scroll({x:' + xDesc + ', y:' + yDesc + '});'
      }
    }

    if (op === 0x65) {
      return {
        op: 'SCRCC',
        js: 'scrollToCurrentPlayableCharacter();'
      }
    }

    if (op === 0x66) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const bxb3 = $r.readUByte()
      const b3 = bxb3 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const s = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const sDesc = b3 === 0 ? s : 'Bank[' + b3 + '][' + s + ']'
      return {
        op: 'SCR2DC',
        b1,
        b2,
        b3,
        x,
        y,
        s,
        js:
          'scrollSmooth({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', speed:' +
          sDesc +
          '});'
      }
    }

    if (op === 0x67) {
      return {
        op: 'SCRLW',
        js: 'waitForScroll();'
      }
    }

    if (op === 0x68) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const bxb3 = $r.readUByte()
      const b3 = bxb3 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const s = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const sDesc = b3 === 0 ? s : 'Bank[' + b3 + '][' + s + ']'
      return {
        op: 'SCR2DL',
        b1,
        b2,
        b3,
        x,
        y,
        s,
        js:
          'scrollToCoordsLinear({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', s:' +
          sDesc +
          ', speed:' +
          s +
          '});'
      }
    }

    if (op === 0x69) {
      const p = $r.readUByte()
      return {
        op: 'MPDSP',
        p,
        js: 'MPDSPOp0x69({param:' + p + '});'
      }
    }

    if (op === 0x6a) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const s = $r.readUByte()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      return {
        op: 'VWOFT',
        b1,
        b2,
        x,
        y,
        s,
        js: 'VWOFTOp0x6a({x:' + xDesc + ', y:' + yDesc + ', s:' + s + '});'
      }
    }

    if (op === 0x6b) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const bxb3 = $r.readUByte()
      const b3 = bxb3 & 0x0f
      const r = $r.readUByte()
      const g = $r.readUByte()
      const b = $r.readUByte()
      const s = $r.readUByte()
      const t = $r.readUByte()
      const a = $r.readUByte()
      const rDesc = b1 === 0 ? r : 'Bank[' + b1 + '][' + r + ']'
      const gDesc = b2 === 0 ? g : 'Bank[' + b2 + '][' + g + ']'
      const bDesc = b3 === 0 ? b : 'Bank[' + b3 + '][' + b + ']'
      return {
        op: 'FADE',
        b1,
        b2,
        b3,
        r,
        g,
        b,
        s,
        t,
        a,
        js:
          'fade({r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          ', speed:' +
          s +
          ', type:' +
          t +
          ', adjust:' +
          a +
          '});',
        pres: 'The screen fades...'
      }
    }

    if (op === 0x6c) {
      return {
        op: 'FADEW',
        js: 'waitForFade();',
        pres: '...'
      }
    }

    if (op === 0x6d) {
      const i = $r.readUShort()
      const s = $r.readUByte()
      const sFuncDesc =
        s === 0 ? 'disableCollisionDetection' : 'enableCollisionDetection'
      return {
        op: 'IDLCK',
        i,
        s,
        js: sFuncDesc + '({triangleId:' + i + '});',
        pres: 'The <I' + i + '> ' + (s === 0 ? 'no longer blocks' : 'blocks')
      }
    }

    if (op === 0x6e) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'LSTMP',
        b,
        a,
        js: aDesc + ' = getLastFieldMapId(); // wm does not count'
      }
    }

    if (op === 0x6f) {
      const b = $r.readUByte()
      const s = $r.readUShort()
      const e = $r.readUByte()
      const t = $r.readUByte()
      const sDesc = b === 0 ? s : 'Bank[' + b + '][' + s + ']'
      return {
        op: 'SCRLP',
        b,
        s,
        e,
        t,
        js:
          'scrollToPartyMember({speedInFrame:' +
          sDesc +
          ', partyId:' +
          e +
          ', scrollType:' +
          t +
          '});',
        pres: 'The camera focuses on <P' + e + '>.'
      }
    }

    if (op === 0x70) {
      const b = $r.readUByte()
      const n = $r.readUShort()
      const nDesc = b === 0 ? n : 'Bank[' + b + '][' + n + ']'
      return {
        op: 'BATTLE',
        b,
        n,
        js: 'startBattle({battle:' + nDesc + '});'
      }
    }

    if (op === 0x71) {
      const s = $r.readUByte()
      const func =
        s === 0 ? 'enableRandomEncounters' : 'disableRandomEncounters'
      return {
        op: 'BTLON',
        s,
        js: func + '();',
        pres:
          s === 0
            ? 'Random monsters start showing up.'
            : 'Random monsters stop showing up.'
      }
    }

    if (op === 0x72) {
      const bits1 = $r.readUByte()
      const bits2 = $r.readUByte()
      const descriptions = []
      if (bits1 & 0b10000000) {
        descriptions.push('DisableRewardScreens')
      }
      if (bits1 & 0b01000000) {
        descriptions.push('ActivateArenaMode')
      }
      if (bits1 & 0b00100000) {
        descriptions.push('DisableVictoryMusic')
      }
      if (bits1 & 0b00010000) {
        descriptions.push('Unknown0b00010000')
      }
      if (bits1 & 0b00001000) {
        descriptions.push('CanNotEscape')
      }
      if (bits1 & 0b00000100) {
        descriptions.push('PreEmptiveAttack')
      }
      if (bits1 & 0b00000010) {
        descriptions.push('TimedBattleWithoutRewardScreen')
      }
      if (bits1 & 0b00000001) {
        descriptions.push('Unknown0b00000001')
      }
      if (bits2 & 0b11111110) {
        descriptions.push('UnknownLSB')
      }
      if (bits2 & 0b00000001) {
        descriptions.push('DisableGameOver')
      }
      return {
        op: 'BTLMD',
        bits1,
        bits2,
        js: 'setBattleModeOptions(' + descriptions.join(', ') + ');',
        pres: descriptions.join(', ')
      }
    }

    if (op === 0x73) {
      const b = $r.readUByte()
      const p = $r.readUByte()
      const d = $r.readUByte()
      const dDesc = b === 0 ? d : 'Bank[' + b + '][' + d + ']'
      return {
        op: 'PGTDR',
        b,
        p,
        d,
        js: dDesc + ' = getPartyMemberDirection({partyId:' + p + '});'
      }
    }

    if (op === 0x74) {
      const b = $r.readUByte()
      const p = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'GETPC',
        b,
        p,
        a,
        js: aDesc + ' = getPartyMemberCharacterId({partyId:' + p + '});'
      }
    }

    if (op === 0x75) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const p = $r.readUByte()
      const x = $r.readUByte()
      const y = $r.readUByte()
      const z = $r.readUByte()
      const i = $r.readUByte()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const zDesc = b3 === 0 ? z : 'Bank[' + b3 + '][' + z + ']'
      const iDesc = b4 === 0 ? i : 'Bank[' + b4 + '][' + i + ']'
      return {
        op: 'PXYZI',
        b1,
        b2,
        b3,
        b4,
        p,
        x,
        y,
        z,
        i,
        js:
          '{ let pos = getPartyMemberPosition({partyId:' +
          p +
          '}); ' +
          xDesc +
          ' = pos.x; ' +
          yDesc +
          ' = pos.y; ' +
          zDesc +
          ' = pos.z; ' +
          iDesc +
          ' = pos.triangleId; }'
      }
    }

    if (op === 0x76) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'PLUS!',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = add8bitClamped(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x77) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'PLUS2!',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = add16bitClamped(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x78) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MINUS!',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = subtract8bitClamped(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x79) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MINUS2!',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = subtract16bitClamped(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x7a) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'INC!',
        b,
        a,
        js: 'increment8bitClamped(' + aDesc + ');'
      }
    }

    if (op === 0x7b) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'INC2!',
        b,
        a,
        js: 'increment16bitClamped(' + aDesc + ');'
      }
    }

    if (op === 0x7c) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'DEC!',
        b,
        a,
        js: 'decrement8bitClamped(' + aDesc + ');'
      }
    }

    if (op === 0x7d) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'DEC2!',
        b,
        a,
        js: 'decrement16bitClamped(' + aDesc + ');'
      }
    }

    if (op === 0x7e) {
      const s = $r.readUByte()
      const funcDesc = s === 0 ? 'interactibilityOn' : 'interactibilityOff'
      return {
        op: 'TLKON',
        s,
        js: funcDesc + '();'
      }
    }

    if (op === 0x7f) {
      const b = $r.readUByte()
      const s = $r.readUByte()
      const sDesc = b === 0 ? s : 'Bank[' + b + '][' + s + ']'
      return {
        op: 'RDMSD',
        b,
        s,
        js: 'setRandomSeed({tableOffset:' + sDesc + '});'
      }
    }

    if (op === 0x80) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const a = $r.readUByte()
      const v = $r.readUByte()
      const aDesc = bd === 0 ? a : 'Bank[' + bd + '][' + a + ']'
      const vDesc = bs === 0 ? v : 'Bank[' + bs + '][' + v + ']'
      return {
        op: 'SETBYTE',
        bd,
        bs,
        a,
        v,
        js: aDesc + ' = ' + vDesc + ';'
      }
    }

    if (op === 0x81) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const a = $r.readUByte()
      const v = $r.readShort()
      let aDesc = bd === 0 ? a : 'Bank[' + bd + '][' + a + ']'
      const vDesc = bs === 0 ? v : 'Bank[' + bs + '][' + v + ']'
      if (bd === 2 && a === 0) {
        aDesc = '$GameMoment'
      }
      return {
        op: 'SETWORD',
        bd,
        bs,
        a,
        v,
        mr: aDesc + ' = ' + vDesc + ' (16 bit)',
        js: aDesc + ' = ' + vDesc + ';'
      }
    }

    if (op === 0x82) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const bit = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      return {
        op: 'BITON', // SETBIT seems better?
        bd,
        bs,
        d,
        bit,
        js: 'setBit({destination:' + dDesc + ', bit:' + bit + '});'
      }
    }

    if (op === 0x83) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const bit = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      return {
        op: 'BITOFF', // UNSETBIT seems better?
        bd,
        bs,
        d,
        bit,
        js: 'unsetBit({destination:' + dDesc + ', bit:' + bit + '});'
      }
    }

    if (op === 0x84) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const bit = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      return {
        op: 'BITXOR',
        bd,
        bs,
        d,
        bit,
        js: 'toggleBit({destination:' + dDesc + ', bit:' + bit + '});'
      }
    }

    if (op === 0x85) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'PLUS',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = add8bit(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x86) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'PLUS2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = add16bit(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x87) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MINUS',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = subtract8bit(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x88) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MINUS2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = subtract16bit(' + dDesc + ', ' + sDesc + ');'
      }
    }

    if (op === 0x89) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MUL',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' * ' + sDesc + '; // TODO: cap at 255'
      }
    }

    if (op === 0x8a) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MUL2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' * ' + sDesc + ';'
      }
    }

    if (op === 0x8b) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'DIV',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = Math.floor(' + dDesc + ' / ' + sDesc + ');'
      }
    }

    if (op === 0x8c) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'DIV2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = Math.floor(' + dDesc + ' / ' + sDesc + ');'
      }
    }

    if (op === 0x8d) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MOD',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' % ' + sDesc + ';'
      }
    }

    if (op === 0x8e) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'MOD2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' % ' + sDesc + ';'
      }
    }

    if (op === 0x8f) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'AND',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' & ' + sDesc + ';'
      }
    }

    if (op === 0x90) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'AND2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' & ' + sDesc + ';'
      }
    }

    if (op === 0x91) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'OR',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' | ' + sDesc + ';'
      }
    }

    if (op === 0x92) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'OR2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' | ' + sDesc + ';'
      }
    }

    if (op === 0x93) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'XOR',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' ^ ' + sDesc + ';'
      }
    }

    if (op === 0x94) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'XOR2',
        bd,
        bs,
        d,
        s,
        js: dDesc + ' = ' + dDesc + ' ^ ' + sDesc + ';'
      }
    }

    if (op === 0x95) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'INC',
        b,
        a,
        js: 'increment8bit(' + aDesc + ');'
      }
    }

    if (op === 0x96) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'INC2',
        b,
        a,
        js: 'increment16bit(' + aDesc + ');'
      }
    }

    if (op === 0x97) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'DEC',
        b,
        a,
        js: 'decrement8bit(' + aDesc + ');'
      }
    }

    if (op === 0x98) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'DEC2',
        b,
        a,
        js: 'decrement16bit(' + aDesc + ');'
      }
    }

    if (op === 0x99) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'RANDOM',
        b,
        a,
        js: 'set8bit(' + aDesc + ', Math.floor(Math.random() * 256));'
      }
    }

    if (op === 0x9a) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUByte()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'LBYTE',
        bd,
        bs,
        d,
        s,
        js: 'set8bit(' + dDesc + ', get8bit(' + sDesc + '));'
      }
    }

    if (op === 0x9b) {
      const bdbs = $r.readUByte()
      const bd = (bdbs & 0xf0) >> 4
      const bs = bdbs & 0x0f
      const d = $r.readUByte()
      const s = $r.readUShort()
      const dDesc = bd === 0 ? d : 'Bank[' + bd + '][' + d + ']'
      const sDesc = bs === 0 ? s : 'Bank[' + bs + '][' + s + ']'
      return {
        op: 'HBYTE',
        bd,
        bs,
        d,
        s,
        js: 'set8bit(' + dDesc + ', getHighByte(' + sDesc + '));'
      }
    }

    if (op === 0x9c) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const bxb3 = $r.readUByte()
      const b3 = bxb3 & 0x0f
      const d = $r.readUByte()
      const l = $r.readUByte()
      const h = $r.readUByte()
      const dDesc = b1 === 0 ? d : 'Bank[' + b1 + '][' + d + ']'
      const lDesc = b2 === 0 ? l : 'Bank[' + b2 + '][' + l + ']'
      const hDesc = b3 === 0 ? h : 'Bank[' + b3 + '][' + h + ']'
      return {
        op: '2BYTE',
        b1,
        b2,
        b3,
        d,
        l,
        h,
        js: 'setTwoBytes(' + dDesc + ', ' + lDesc + ', ' + hDesc + ');'
      }
    }

    if (op === 0x9d) {
      const p1 = $r.readUByte()
      const p2 = $r.readUByte()
      const p3 = $r.readUByte()
      const p4 = $r.readUByte()
      const p5 = $r.readUByte()
      const p6 = $r.readUByte()
      return {
        op: 'SETX',
        p1,
        p2,
        p3,
        p4,
        p5,
        p6,
        js:
          'setX(' +
          p1 +
          ', ' +
          p2 +
          ', ' +
          p3 +
          ', ' +
          p4 +
          ', ' +
          p5 +
          ', ' +
          p6 +
          ');'
      }
    }

    if (op === 0x9e) {
      const p1 = $r.readUByte()
      const p2 = $r.readUByte()
      const p3 = $r.readUByte()
      const p4 = $r.readUByte()
      const p5 = $r.readUByte()
      const p6 = $r.readUByte()
      return {
        op: 'GETX',
        p1,
        p2,
        p3,
        p4,
        p5,
        p6,
        js:
          'getX(' +
          p1 +
          ', ' +
          p2 +
          ', ' +
          p3 +
          ', ' +
          p4 +
          ', ' +
          p5 +
          ', ' +
          p6 +
          ');'
      }
    }

    if (op === 0x9f) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const b5b6 = $r.readUByte()
      const b5 = (b5b6 & 0xf0) >> 4
      const b6 = b5b6 & 0x0f
      const i = $r.readUByte()
      const s = $r.readUShort()
      const e = $r.readUShort()
      const v = $r.readUByte()
      const r = $r.readUByte()
      const sDesc = b2 === 0 ? s : 'Bank[' + b2 + '][' + s + ']'
      const eDesc = b3 === 0 ? e : 'Bank[' + b3 + '][' + e + ']'
      const vDesc = b4 === 0 ? v : 'Bank[' + b4 + '][' + v + ']'
      const rDesc = b6 === 0 ? r : 'Bank[' + b6 + '][' + r + ']'
      return {
        op: 'SEARCHX',
        b1,
        b2,
        b3,
        b4,
        b6,
        i,
        s,
        e,
        v,
        r,
        js:
          rDesc +
          ' = searchAndGetIndexOfValueInBank({bank: Bank[' +
          b1 +
          '], offset:' +
          i +
          ', startOffset:' +
          sDesc +
          ', endOffset:' +
          eDesc +
          ', value:' +
          vDesc +
          '});'
      }
    }

    if (op === 0xa0) {
      const c = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'PC',
        c,
        js: 'thisIsAPlayableCharacter(' + cDesc + ');'
      }
    }

    if (op === 0xa1) {
      const n = $r.readUByte()
      return {
        op: 'CHAR',
        n,
        js: 'thisIsAFieldModel(' + n + ');'
      }
    }

    if (op === 0xa2) {
      const a = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'DFANM',
        a,
        s,
        js: 'playAnimationLoop({animation:' + a + ', slowness:' + s + '});'
      }
    }

    if (op === 0xa3) {
      const a = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'ANIME1',
        a,
        s,
        js: 'playAnimationSync({animation:' + a + ', slowness:' + s + '});'
      }
    }

    if (op === 0xa4) {
      const s = $r.readUByte()
      const sDesc = s === 0 ? 'V.NotVisible' : 'V.Visible'
      return {
        op: 'VISI',
        s,
        js: 'setVisibilityMode(' + sDesc + ');'
      }
    }

    if (op === 0xa5) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const i = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const zDesc = b3 === 0 ? z : 'Bank[' + b3 + '][' + z + ']'
      const iDesc = b4 === 0 ? i : 'Bank[' + b4 + '][' + i + ']'
      return {
        op: 'XYZI',
        b1,
        b2,
        b3,
        b4,
        x,
        y,
        z,
        i,
        js:
          'placeObject({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', z:' +
          zDesc +
          ', walkmeshTriangle:' +
          iDesc +
          '});'
      }
    }

    if (op === 0xa6) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const i = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const iDesc = b3 === 0 ? i : 'Bank[' + b3 + '][' + i + ']'
      return {
        op: 'XYI',
        b1,
        b2,
        b3,
        x,
        y,
        i,
        js:
          'placeObject({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', walkmeshTriangle:' +
          iDesc +
          '});'
      }
    }

    if (op === 0xa7) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const zDesc = b3 === 0 ? z : 'Bank[' + b3 + '][' + z + ']'
      return {
        op: 'XYZ',
        b1,
        b2,
        b3,
        x,
        y,
        z,
        js: 'placeObject({x:' + xDesc + ', y:' + yDesc + ', z:' + zDesc + '});'
      }
    }

    if (op === 0xa8) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      return {
        op: 'MOVE',
        b1,
        b2,
        x,
        y,
        js: 'walkObjectTo({x:' + xDesc + ', y:' + yDesc + '});' // using standard walk animation, found with animation ID 1 in the field object
      }
    }

    if (op === 0xa9) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      return {
        op: 'CMOVE',
        b1,
        b2,
        x,
        y,
        js: 'moveObjectTo({x:' + xDesc + ', y:' + yDesc + '});' // using no animation
      }
    }

    if (op === 0xaa) {
      const e = $r.readUByte()
      return {
        op: 'MOVA',
        e,
        js: 'moveObjectToEntity({entityId:' + e + '});'
      }
    }

    if (op === 0xab) {
      const g = $r.readUByte()
      const d = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'TURA',
        g,
        d,
        s,
        js:
          'turnToEntity({groupId:' +
          g +
          ', direction:' +
          d +
          ', speed:' +
          s +
          '});'
      }
    }

    if (op === 0xac) {
      return {
        op: 'ANIMW',
        js: 'waitForLastAnimationToFinish();'
      }
    }

    if (op === 0xad) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      return {
        op: 'FMOVE',
        b1,
        b2,
        x,
        y,
        js: 'moveFieldObjectTo({x:' + xDesc + ', y:' + yDesc + '});' // using no animation
      }
    }

    if (op === 0xae) {
      const a = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'ANIME1',
        a,
        s,
        js: 'playAnimationAsync({animation:' + a + ', slowness:' + s + '});'
      }
    }

    if (op === 0xaf) {
      const a = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'ANIM!1',
        a,
        s,
        js: 'playAnimationOnceAsync({animation:' + a + ', slowness:' + s + '});'
      }
    }

    if (op === 0xb0) {
      const a = $r.readUByte()
      const f = $r.readUByte()
      const l = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'CANIM1',
        a,
        f,
        l,
        s,
        js:
          'playPartialAnimation({animation:' +
          a +
          ', firstFrame:' +
          f +
          ', lastFrame:' +
          l +
          ', slowness:' +
          s +
          '});'
      }
    }

    if (op === 0xb1) {
      const a = $r.readUByte()
      const f = $r.readUByte()
      const l = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'CANM!1',
        a,
        f,
        l,
        s,
        js:
          'playPartialAnimation({animation:' +
          a +
          ', firstFrame:' +
          f +
          ', lastFrame:' +
          l +
          ', slowness:' +
          s +
          '});'
      }
    }

    if (op === 0xb2) {
      const b = $r.readUByte()
      const s = $r.readUShort()
      const sDesc = b === 0 ? s : 'Bank[' + b + '][' + s + ']'
      return {
        op: 'MSPED',
        b,
        s,
        js: 'setMovementSpeed({speed:' + sDesc + '});'
      }
    }

    if (op === 0xb3) {
      const b = $r.readUByte()
      const d = $r.readUByte()
      const dDesc = b === 0 ? d : 'Bank[' + b + '][' + d + ']'
      return {
        op: 'DIR',
        b,
        d,
        js: 'setFacingDirection({direction:' + dDesc + '});'
      }
    }

    if (op === 0xb4) {
      const b = $r.readUByte()
      const r = $r.readUByte()
      const d = $r.readUByte()
      const s = $r.readUByte()
      const t = $r.readUByte()
      const rDesc = b === 0 ? r : 'Bank[' + b + '][' + r + ']'
      return {
        op: 'TURNGEN',
        b,
        r,
        d,
        s,
        t,
        js:
          'rotateModel({rotation:' +
          rDesc +
          ', direction:' +
          d +
          ', steps:' +
          s +
          ', stepType:' +
          t +
          '});'
      }
    }

    if (op === 0xb5) {
      const b = $r.readUByte()
      const r = $r.readUByte()
      const d = $r.readUByte()
      const s = $r.readUByte()
      const t = $r.readUByte()
      const rDesc = b === 0 ? r : 'Bank[' + b + '][' + r + ']'
      return {
        op: 'TURN',
        b,
        r,
        d,
        s,
        t,
        js:
          'rotateModelDeprecatedSync({rotation:' +
          rDesc +
          ', direction:' +
          d +
          ', steps:' +
          s +
          ', stepType:' +
          t +
          '});'
      }
    }

    if (op === 0xb6) {
      const e = $r.readUByte()
      return {
        op: 'DIRA',
        e,
        js: 'setModelDirectionToFaceEntity({entityIndex:' + e + '});'
      }
    }

    if (op === 0xb7) {
      const b = $r.readUByte()
      const e = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'GETDIR',
        b,
        e,
        a,
        js: aDesc + ' = getEntityDirection({entityIndex:' + e + '});'
      }
    }

    if (op === 0xb8) {
      const bxby = $r.readUByte()
      const bx = (bxby & 0xf0) >> 4
      const by = bxby & 0x0f
      const e = $r.readUByte()
      const x = $r.readUByte()
      const y = $r.readUByte()
      const xDesc = bx === 0 ? x : 'Bank[' + bx + '][' + x + ']'
      const yDesc = by === 0 ? y : 'Bank[' + by + '][' + y + ']'
      return {
        op: 'GETAXY',
        bx,
        by,
        e,
        x,
        y,
        js:
          xDesc +
          ' = getEntityX({entityIndex:' +
          e +
          '}); ' +
          yDesc +
          ' = getEntityY({entityIndex:' +
          e +
          '})'
      }
    }

    if (op === 0xb9) {
      const b = $r.readUByte()
      const e = $r.readUByte()
      const a = $r.readUByte()
      return {
        op: 'GETAI',
        b,
        e,
        a,
        js:
          'Bank[' +
          b +
          '][' +
          a +
          '] = getTriangleIdUnderEntity({entity:' +
          e +
          '});'
      }
    }

    if (op === 0xba) {
      const a = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'ANIM!2',
        a,
        s,
        js:
          'playAnimationHoldLastFrameSync({animation:' +
          a +
          ', slowness:' +
          s +
          '});'
      }
    }

    if (op === 0xbb) {
      const a = $r.readUByte()
      const f = $r.readUByte()
      const l = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'CANIM2',
        a,
        f,
        l,
        s,
        js:
          'playPartialAnimation({animation:' +
          a +
          ', firstFrame:' +
          f +
          ', lastFrame:' +
          l +
          ', slowness:' +
          s +
          '});'
      }
    }

    if (op === 0xbc) {
      const a = $r.readUByte()
      const f = $r.readUByte()
      const l = $r.readUByte()
      const s = $r.readUByte()
      return {
        op: 'CANM!2',
        a,
        f,
        l,
        s,
        js:
          'playPartialAnimation({animation:' +
          a +
          ', firstFrame:' +
          f +
          ', lastFrame:' +
          l +
          ', slowness:' +
          s +
          '});'
      }
    }

    if (op === 0xbd) {
      const b = $r.readUByte()
      const s = $r.readUShort()
      const sDesc = b === 0 ? s : 'Bank[' + b + '][' + s + ']'
      return {
        op: 'ASPED',
        b,
        s,
        js: 'setAnimationSpeed({speed:' + sDesc + '});'
      }
    }

    // 0xbe is unused

    if (op === 0xbf) {
      const e = $r.readUByte()
      return {
        op: 'CC',
        e,
        js: 'setControllableCharacter({entity:' + e + '});'
      }
    }

    if (op === 0xc0) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const i = $r.readShort()
      const h = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const iDesc = b3 === 0 ? i : 'Bank[' + b3 + '][' + i + ']'
      const hDesc = b4 === 0 ? h : 'Bank[' + b4 + '][' + h + ']'
      return {
        op: 'JUMP',
        b1,
        b2,
        b3,
        b4,
        x,
        y,
        i,
        h,
        js:
          'makeObjectJump({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', triangleId:' +
          iDesc +
          ', height:' +
          hDesc +
          '});'
      }
    }

    if (op === 0xc1) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const a = $r.readUByte()
      const x = $r.readUByte()
      const y = $r.readUByte()
      const z = $r.readUByte()
      const i = $r.readUByte()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const zDesc = b3 === 0 ? z : 'Bank[' + b3 + '][' + z + ']'
      const iDesc = b4 === 0 ? i : 'Bank[' + b4 + '][' + i + ']'
      return {
        op: 'AXYZI',
        b1,
        b2,
        b3,
        b4,
        a,
        x,
        y,
        z,
        i,
        js:
          '{ let pos = getEntityPosition({entityId:' +
          a +
          '}); ' +
          xDesc +
          ' = pos.x; ' +
          yDesc +
          ' = pos.y; ' +
          zDesc +
          ' = pos.z; ' +
          iDesc +
          ' = pos.triangleId; }'
      }
    }

    if (op === 0xc2) {
      const advanceKeys = ['Key.Down', 'Key.Up', 'Key.Right', 'Key.Left']
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const i = $r.readUShort()
      const k = $r.readUByte()
      const a = $r.readUByte()
      const d = $r.readUByte()
      const s = $r.readUByte()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const zDesc = b3 === 0 ? z : 'Bank[' + b3 + '][' + z + ']'
      const iDesc = b4 === 0 ? i : 'Bank[' + b4 + '][' + i + ']'
      const kDesc = advanceKeys[k]
      return {
        op: 'LADER',
        b1,
        b2,
        b3,
        b4,
        x,
        y,
        z,
        i,
        k,
        a,
        d,
        s,
        js:
          'climbLadder({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', z:' +
          zDesc +
          ', triangleId:' +
          iDesc +
          ', advanceKey:' +
          kDesc +
          ', animationId:' +
          a +
          ', facingDirection:' +
          d +
          ', speed:' +
          s +
          '});'
      }
    }

    if (op === 0xc3) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const t = $r.readUByte()
      const x = $r.readShort()
      const y = $r.readShort()
      const z = $r.readShort()
      const s = $r.readUShort()
      const xDesc = b1 === 0 ? x : 'Bank[' + b1 + '][' + x + ']'
      const yDesc = b2 === 0 ? y : 'Bank[' + b2 + '][' + y + ']'
      const zDesc = b3 === 0 ? z : 'Bank[' + b3 + '][' + z + ']'
      const sDesc = b4 === 0 ? s : 'Bank[' + b4 + '][' + s + ']'
      return {
        op: 'OFST',
        b1,
        b2,
        b3,
        b4,
        x,
        y,
        z,
        s,
        t,
        js:
          'transposeObjectDisplayOnly({x:' +
          xDesc +
          ', y:' +
          yDesc +
          ', z:' +
          zDesc +
          ', speed:' +
          sDesc +
          '});'
      }
    }

    if (op === 0xc4) {
      return {
        op: 'OFSTW',
        js: 'waitForTransposeObjectDisplayOnly();'
      }
    }

    if (op === 0xc5) {
      const b = $r.readUByte()
      const r = $r.readUByte()
      const rDesc = b === 0 ? r : 'Bank[' + b + '][' + r + ']'
      return {
        op: 'TALKR',
        b,
        r,
        js: 'setInteractibilityRadius({radius:' + r + '});'
      }
    }

    if (op === 0xc6) {
      const b = $r.readUByte()
      const r = $r.readUByte()
      const rDesc = b === 0 ? r : 'Bank[' + b + '][' + r + ']'
      return {
        op: 'SLIDR',
        b,
        r,
        js: 'setCollisionRadius({radius:' + r + '});'
      }
    }

    if (op === 0xc7) {
      const s = $r.readUByte()
      const sDesc = s === 0 ? 'S.Solid' : 'S.NonSolid'
      return {
        op: 'SOLID',
        s,
        js: 'setSolidMode(' + sDesc + ');'
      }
    }

    if (op === 0xc8) {
      const c = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'PRTYP',
        c,
        js: 'addToParty(' + cDesc + ');'
      }
    }

    if (op === 0xc9) {
      const c = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'PRTYM',
        c,
        js: 'removeFromParty(' + cDesc + ');'
      }
    }

    if (op === 0xca) {
      const c1 = $r.readUByte()
      const c2 = $r.readUByte()
      const c3 = $r.readUByte()
      const c1Desc = this.getCharacterDesc(c1)
      const c2Desc = this.getCharacterDesc(c2)
      const c3Desc = this.getCharacterDesc(c3)
      return {
        op: 'PRTYE',
        c1,
        c2,
        c3,
        js: 'changePartyTo([' + c1Desc + ', ' + c2Desc + ', ' + c3Desc + ']);'
      }
    }

    if (op === 0xcb) {
      const c = $r.readUByte()
      const a = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFPRTYQ',
        c,
        a,
        js:
          'if (isCharacterInParty(' +
          cDesc +
          ') (else goto ' +
          (baseOffset + a) +
          ');',
        goto: baseOffset + a
      }
    }

    if (op === 0xcc) {
      const c = $r.readUByte()
      const a = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      const baseOffset = this.offset - 1 - this.startOffset
      return {
        op: 'IFMEMBQ',
        c,
        a,
        js:
          'if (isCharacterAvailable(' +
          cDesc +
          ') (else goto ' +
          (baseOffset + a) +
          ');',
        goto: baseOffset + a
      }
    }

    if (op === 0xcd) {
      const s = $r.readUByte()
      const c = $r.readUByte()
      const sFuncDesc =
        s === 0 ? 'makeCharacterUnavailable' : 'makeCharacterAvailable'
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'MMBud',
        s,
        c,
        js: sFuncDesc + '(' + cDesc + ');'
      }
    }

    if (op === 0xce) {
      const c = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'MMBLK',
        c,
        js: 'lockPartyMember(' + cDesc + ');'
      }
    }

    if (op === 0xcf) {
      const c = $r.readUByte()
      const cDesc = this.getCharacterDesc(c)
      return {
        op: 'MMBUK',
        c,
        js: 'unlockPartyMember(' + cDesc + ');'
      }
    }

    if (op === 0xd0) {
      const x1 = $r.readShort()
      const y1 = $r.readShort()
      const z1 = $r.readShort()
      const x2 = $r.readShort()
      const y2 = $r.readShort()
      const z2 = $r.readShort()
      return {
        op: 'LINE',
        x1,
        y1,
        z1,
        x2,
        y2,
        z2,
        js:
          'createLineTrigger({x1:' +
          x1 +
          ', y1:' +
          y1 +
          ', z1:' +
          z1 +
          ', x2:' +
          x2 +
          ', y2:' +
          y2 +
          ', z2:' +
          z2 +
          '});'
      }
    }

    if (op === 0xd1) {
      const s = $r.readUByte()
      const funcDesc =
        s === 0 ? 'disableThisLineTrigger' : 'enableThisLineTrigger'
      return {
        op: 'LINON',
        s,
        js: funcDesc + '();'
      }
    }

    if (op === 0xd2) {
      const s = $r.readUByte()
      const funcDesc =
        s === 0 ? 'enableAllGatewayTriggers' : 'disableAllGatewayTriggers'
      return {
        op: 'MPJPO',
        s,
        js: funcDesc + '();'
      }
    }

    if (op === 0xd3) {
      const bx1by1 = $r.readUByte()
      const bx1 = (bx1by1 & 0xf0) >> 4
      const by1 = bx1by1 & 0x0f
      const bz1bx2 = $r.readUByte()
      const bz1 = (bz1bx2 & 0xf0) >> 4
      const bx2 = bz1bx2 & 0x0f
      const by2bz2 = $r.readUByte()
      const by2 = (by2bz2 & 0xf0) >> 4
      const bz2 = by2bz2 & 0x0f
      const x1 = $r.readShort()
      const y1 = $r.readShort()
      const z1 = $r.readShort()
      const x2 = $r.readShort()
      const y2 = $r.readShort()
      const z2 = $r.readShort()
      const x1Desc = bx1 === 0 ? x1 : 'Bank[' + bx1 + '][' + x1 + ']'
      const y1Desc = by1 === 0 ? y1 : 'Bank[' + by1 + '][' + y1 + ']'
      const z1Desc = bz1 === 0 ? z1 : 'Bank[' + bz1 + '][' + z1 + ']'
      const x2Desc = bx2 === 0 ? x2 : 'Bank[' + bx2 + '][' + x2 + ']'
      const y2Desc = by2 === 0 ? y2 : 'Bank[' + by2 + '][' + y2 + ']'
      const z2Desc = bz2 === 0 ? z2 : 'Bank[' + bz2 + '][' + z2 + ']'
      return {
        op: 'SLINE',
        bx1,
        by1,
        bz1,
        bx2,
        by2,
        bz2,
        x1,
        y1,
        z1,
        x2,
        y2,
        z2,
        js:
          'setLine({v1: {x:' +
          x1Desc +
          ', y:' +
          y1Desc +
          ', z:' +
          z1Desc +
          '}, v2: {x:' +
          x2Desc +
          ', y:' +
          y2Desc +
          ', z:' +
          z2Desc +
          '}});'
      }
    }

    if (op === 0xd4) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const d = $r.readUShort()
      const m = $r.readUShort()
      const a = $r.readUShort()
      const s = $r.readUByte()
      const dDesc = b1 === 0 ? d : 'Bank[' + b1 + '][' + d + ']'
      const mDesc = b2 === 0 ? m : 'Bank[' + b2 + '][' + m + ']'
      const aDesc = b3 === 0 ? a : 'Bank[' + b3 + '][' + a + ']'
      const sDesc = b4 === 0 ? s : 'Bank[' + b4 + '][' + s + ']'
      return {
        op: 'SIN',
        b1,
        b2,
        b3,
        b4,
        d,
        m,
        a,
        s,
        js: `calculateSin({desination: ${dDesc}, sourceAngle: ${sDesc}, multiplicand: ${mDesc}, addition: ${aDesc}});`
      }
    }

    if (op === 0xd5) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const d = $r.readUShort()
      const m = $r.readUShort()
      const a = $r.readUShort()
      const s = $r.readUByte()
      const dDesc = b1 === 0 ? d : 'Bank[' + b1 + '][' + d + ']'
      const mDesc = b2 === 0 ? m : 'Bank[' + b2 + '][' + m + ']'
      const aDesc = b3 === 0 ? a : 'Bank[' + b3 + '][' + a + ']'
      const sDesc = b4 === 0 ? s : 'Bank[' + b4 + '][' + s + ']'
      return {
        op: 'COS',
        b1,
        b2,
        b3,
        b4,
        d,
        m,
        a,
        s,
        js: `calculateCos({desination: ${dDesc}, sourceAngle: ${sDesc}, multiplicand: ${mDesc}, addition: ${aDesc}});`
      }
    }

    if (op === 0xd6) {
      const b = $r.readUByte()
      const r = $r.readUShort()
      const rDesc = b === 0 ? r : 'Bank[' + b + '][' + r + ']'
      return {
        op: 'TLKR2',
        b,
        r,
        js: 'setInteractibilityRadius({radius:' + r + '});'
      }
    }

    if (op === 0xd7) {
      const b = $r.readUByte()
      const r = $r.readUShort()
      const rDesc = b === 0 ? r : 'Bank[' + b + '][' + r + ']'
      return {
        op: 'SLDR2',
        b,
        r,
        js: 'setCollisionRadius({radius:' + r + '});'
      }
    }

    if (op === 0xd8) {
      const i = $r.readUShort()
      return {
        op: 'PMJMP',
        i,
        js: 'setFieldJumpId({fieldId:' + i + '});'
      }
    }

    if (op === 0xd9) {
      return {
        op: 'PMJMP2',
        js: 'doPMJMP2Op0xd9();'
      }
    }

    if (op === 0xda) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const bxb5 = $r.readUByte()
      const b5 = bxb5 & 0x0f
      const akaoOp = $r.readUByte()
      const p1 = $r.readUShort()
      const p2 = $r.readUShort()
      const p3 = $r.readUShort()
      const p4 = $r.readUShort()
      const p5 = $r.readUShort()
      const p1Desc = b1 === 0 ? p1 : 'Bank[' + b1 + '][' + p1 + ']'
      const p2Desc = b2 === 0 ? p2 : 'Bank[' + b2 + '][' + p2 + ']'
      const p3Desc = b3 === 0 ? p3 : 'Bank[' + b3 + '][' + p3 + ']'
      const p4Desc = b4 === 0 ? p4 : 'Bank[' + b4 + '][' + p4 + ']'
      const p5Desc = b5 === 0 ? p5 : 'Bank[' + b5 + '][' + p5 + ']'
      return {
        op: 'AKAO2',
        b1,
        b2,
        b3,
        b4,
        b5,
        akaoOp,
        p1,
        p2,
        p3,
        p4,
        p5,
        js:
          'musicOp_da_' +
          stringUtil.toHex2(akaoOp) +
          '({p1:' +
          p1Desc +
          ', p2:' +
          p2Desc +
          ', p3:' +
          p3Desc +
          ', p4:' +
          p4Desc +
          ', p5:' +
          p5Desc +
          '});',
        pres: 'Musical event...'
      }
    }

    if (op === 0xdb) {
      const s = $r.readUByte()
      const funcDesc = s === 0 ? 'lockRotatability' : 'unlockRotatability'
      return {
        op: 'FCFIX',
        s,
        js: funcDesc + '();',
        pres: '<This> is locked facing forward.'
      }
    }

    if (op === 0xdc) {
      const actionNames = ['Action.Stand', 'Action.Walk', 'Action.Run']
      const a = $r.readUByte()
      const s = $r.readUByte()
      const i = $r.readUByte()
      const iDesc = actionNames[i]
      return {
        op: 'CCANM',
        a,
        s,
        i,
        js:
          'setAnimationId({animationId:' +
          a +
          ', speed:' +
          s +
          ', actionId:' +
          iDesc +
          '});',
        pres: '<This> <Animation>.'
      }
    }

    if (op === 0xdd) {
      return {
        op: 'ANIMB',
        js: 'stopAnimation();',
        pres: '<This> stops.'
      }
    }

    if (op === 0xde) {
      return {
        op: 'TURNW',
        js: 'waitForTurn();',
        pres: '...'
      }
    }

    // quint8 banks[3], posSrc, posDst, start, b, g, r, colorCount;
    if (op === 0xdf) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const bxb5 = $r.readUByte()
      const b5 = bxb5 & 0x0f
      const s = $r.readUByte()
      const d = $r.readUByte()
      const start = $r.readUByte()
      const b = $r.readUByte()
      const g = $r.readUByte()
      const r = $r.readUByte()
      const size = $r.readUByte()
      const startDesc = b1 === 0 ? start : 'Bank[' + b1 + '][' + start + ']'
      const bDesc = b2 === 0 ? b : 'Bank[' + b2 + '][' + b + ']'
      const gDesc = b3 === 0 ? g : 'Bank[' + b3 + '][' + g + ']'
      const rDesc = b4 === 0 ? r : 'Bank[' + b4 + '][' + r + ']'
      const sizeDesc = b5 === 0 ? size : 'Bank[' + b5 + '][' + size + ']'
      return {
        op: 'MPPAL',
        b1,
        b2,
        b3,
        b4,
        b5,
        s,
        d,
        start,
        b,
        g,
        r,
        size,
        js:
          'multiplyPaletteColors({sourcePaletteId:' +
          s +
          ', targetPaletteId:' +
          d +
          ', startColor:' +
          startDesc +
          ', r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          ', size:' +
          sizeDesc +
          '});',
        pres: 'The colors change.'
      }
    }

    if (op === 0xe0) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUByte()
      const l = $r.readUByte()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const lDesc = b2 === 0 ? l : 'Bank[' + b2 + '][' + l + ']'
      return {
        op: 'BGON',
        b1,
        b2,
        a,
        l,
        js: 'backgroundOn({area:' + aDesc + ', layer:' + l + '});',
        pres: '<Area:' + aDesc + '> <Layer:' + l + '> appears.'
      }
    }

    if (op === 0xe1) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const a = $r.readUByte()
      const l = $r.readUByte()
      const aDesc = b1 === 0 ? a : 'Bank[' + b1 + '][' + a + ']'
      const lDesc = b2 === 0 ? l : 'Bank[' + b2 + '][' + l + ']'
      return {
        op: 'BGOFF',
        b1,
        b2,
        a,
        l,
        js: 'backgroundOff({area:' + aDesc + ', layer:' + l + '});',
        pres: '<Area:' + aDesc + '> <Layer:' + l + '> disappears.'
      }
    }

    if (op === 0xe2) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'BGROL',
        b,
        a,
        js: 'backgroundRollForward({area:' + aDesc + '});',
        pres: '<Area:' + aDesc + '> rolls forward.'
      }
    }

    if (op === 0xe3) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'BGROL2',
        b,
        a,
        js: 'backgroundRollBack({area:' + aDesc + '});',
        pres: '<Area:' + aDesc + '> rolls back.'
      }
    }

    if (op === 0xe4) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      const aDesc = b === 0 ? a : 'Bank[' + b + '][' + a + ']'
      return {
        op: 'BGCLR',
        b,
        a,
        js: 'clearBackground({area:' + aDesc + '});',
        pres: '<Area:' + aDesc + '> clears.'
      }
    }
    if (op === 0xe5) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const s = $r.readUByte()
      const d = $r.readUByte()
      const size = $r.readUByte()
      const sDesc = b1 === 0 ? s : 'Bank[' + b1 + '][' + s + ']'
      const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      return {
        op: 'STPAL',
        b1,
        b2,
        s,
        d,
        size,
        js:
          'storePalette({sourcePaletteId:' +
          sDesc +
          ', destinationTempPaletteId:' +
          dDesc +
          ', size:' +
          size +
          '});'
      }
    }
    if (op === 0xe6) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const s = $r.readUByte()
      const d = $r.readUByte()
      const size = $r.readUByte()
      const sDesc = b1 === 0 ? s : 'Bank[' + b1 + '][' + s + ']'
      const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      return {
        op: 'LDPAL',
        b1,
        b2,
        s,
        d,
        size,
        js:
          'loadPalette({sourceTempPaletteId:' +
          sDesc +
          ', destinationPaletteId:' +
          dDesc +
          ', size:' +
          size +
          '});'
      }
    }

    if (op === 0xe7) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const s = $r.readUByte()
      const d = $r.readUByte()
      const size = $r.readUByte()
      const sDesc = b1 === 0 ? s : 'Bank[' + b1 + '][' + s + ']'
      const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      return {
        op: 'CPPAL',
        b1,
        b2,
        s,
        d,
        size,
        js:
          'copyPalette({sourceArrayId:' +
          sDesc +
          ', targetArrayId:' +
          dDesc +
          ', size:' +
          size +
          '});'
      }
    }

    // quint8 banks[2], posSrc, posDst, start, end;
    if (op === 0xe8) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const posSrc = $r.readUByte()
      const posDst = $r.readUByte()
      const start = $r.readUByte()
      const end = $r.readUByte()
      return {
        op: 'RTPAL',
        b1,
        b2,
        b3,
        b4,
        posSrc,
        posDst,
        start,
        end,
        js:
          'copyPalettePartial({posSrc:' +
          posSrc +
          ', posDst:' +
          posDst +
          ', start:' +
          start +
          ', end:' +
          end +
          '});'
      }
    }

    if (op === 0xe9) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const bxb5 = $r.readUByte()
      const b5 = (bxb5 & 0xf0) >> 4
      const s = $r.readUByte()
      const d = $r.readUByte()
      const b = $r.readUByte()
      const g = $r.readUByte()
      const r = $r.readUByte()
      const size = $r.readUByte()
      const sDesc = b1 === 0 ? s : 'Bank[' + b1 + '][' + s + ']'
      const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      const bDesc = b3 === 0 ? b : 'Bank[' + b3 + '][' + b + ']'
      const gDesc = b4 === 0 ? g : 'Bank[' + b4 + '][' + g + ']'
      const rDesc = b5 === 0 ? r : 'Bank[' + b5 + '][' + r + ']'
      return {
        op: 'ADPAL',
        b1,
        b2,
        b3,
        b4,
        b5,
        s,
        d,
        b,
        g,
        r,
        size,
        js:
          'addPaletteColors({sourceTempPaletteId:' +
          sDesc +
          ', destinationTempPaletteId:' +
          dDesc +
          ', r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          ', size:' +
          size +
          '});'
      }
    }

    if (op === 0xea) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const bxb5 = $r.readUByte()
      const b5 = (bxb5 & 0xf0) >> 4
      const s = $r.readUByte()
      const d = $r.readUByte()
      const b = $r.readUByte()
      const g = $r.readUByte()
      const r = $r.readUByte()
      const size = $r.readUByte()
      const sDesc = b1 === 0 ? s : 'Bank[' + b1 + '][' + s + ']'
      const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      const bDesc = b3 === 0 ? b : 'Bank[' + b3 + '][' + b + ']'
      const gDesc = b4 === 0 ? g : 'Bank[' + b4 + '][' + g + ']'
      const rDesc = b5 === 0 ? r : 'Bank[' + b5 + '][' + r + ']'
      return {
        op: 'MPPAL2',
        b1,
        b2,
        b3,
        b4,
        b5,
        s,
        d,
        b,
        g,
        r,
        size,
        js:
          'multiplyPaletteColors2({sourcePaletteId:' +
          s +
          ', destinationTempPaletteId:' +
          d +
          ', r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          ', size:' +
          size +
          '});'
      }
    }

    if (op === 0xeb) {
      const s = $r.readUByte()
      const d = $r.readUByte()
      const start = $r.readUByte()
      const size = $r.readUByte()
      return {
        op: 'STPLS',
        s,
        d,
        start,
        size,
        js:
          'storePaletteOffset({paletteId:' +
          s +
          ', tempPaletteId:' +
          d +
          ', start:' +
          start +
          ', size:' +
          size +
          '});'
      }
    }

    if (op === 0xec) {
      const s = $r.readUByte()
      const d = $r.readUByte()
      const start = $r.readUByte()
      const size = $r.readUByte()
      return {
        op: 'LDPLS',
        s,
        d,
        start,
        size,
        js:
          'loadPaletteOffset({sourceTempPaletteId:' +
          s +
          ', destinationPaletteId:' +
          d +
          ', start:' +
          start +
          ', size:' +
          size +
          '});'
      }
    }

    if (op === 0xed) {
      const p1 = $r.readUByte()
      const p2 = $r.readUByte()
      const p3 = $r.readUByte()
      const p4 = $r.readUByte()
      const p5 = $r.readUByte()
      const p6 = $r.readUByte()
      const p7 = $r.readUByte()
      return {
        op: 'CPPAL2',
        p1,
        p2,
        p3,
        p4,
        p5,
        p6,
        p7,
        js:
          'op0xed_CPPAL2(' +
          p1 +
          ', ' +
          p2 +
          ', ' +
          p3 +
          ', ' +
          p4 +
          ', ' +
          p5 +
          ', ' +
          p6 +
          ', ' +
          p7 +
          ');'
      }
    }

    if (op === 0xee) {
      const p1 = $r.readUByte()
      const p2 = $r.readUByte()
      const p3 = $r.readUByte()
      const p4 = $r.readUByte()
      const p5 = $r.readUByte()
      const p6 = $r.readUByte()
      const p7 = $r.readUByte()
      return {
        op: 'RTPAL2',
        p1,
        p2,
        p3,
        p4,
        p5,
        p6,
        p7,
        js:
          'op0xee_RTPAL2(' +
          p1 +
          ', ' +
          p2 +
          ', ' +
          p3 +
          ', ' +
          p4 +
          ', ' +
          p5 +
          ', ' +
          p6 +
          ', ' +
          p7 +
          ');'
      }
    }

    if (op === 0xef) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const bxb5 = $r.readUByte()
      const b5 = (bxb5 & 0xf0) >> 4
      const b6 = bxb5 & 0x0f
      const s = $r.readUByte()
      const d = $r.readUByte()
      const start = $r.readUByte()
      const b = $r.readUByte()
      const g = $r.readUByte()
      const r = $r.readUByte()
      const size = $r.readUByte()
      // const sDesc = b1 === 0 ? s : 'Bank[' + b1 + '][' + s + ']'
      // const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      const bDesc = b2 === 0 ? b : 'Bank[' + b2 + '][' + b + ']'
      const gDesc = b3 === 0 ? g : 'Bank[' + b3 + '][' + g + ']'
      const rDesc = b4 === 0 ? r : 'Bank[' + b4 + '][' + r + ']'
      return {
        op: 'ADPAL2',
        b1,
        b2,
        b3,
        b4,
        b5,
        b6,
        s,
        d,
        b,
        g,
        r,
        size,
        start,
        js:
          'addPaletteColors2({sourceTempPaletteId:' +
          s +
          ', destinationTempPaletteId:' +
          d +
          ', r:' +
          rDesc +
          ', g:' +
          gDesc +
          ', b:' +
          bDesc +
          ', start:' +
          start +
          ', size:' +
          size +
          '});'
      }
    }

    if (op === 0xf0) {
      const id = $r.readUByte()
      return {
        op: 'MUSIC',
        id,
        js: 'playMusic({song:' + id + '});',
        pres: 'Song starts: <Song:' + id + '>'
      }
    }

    if (op === 0xf1) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const i = $r.readUShort()
      const d = $r.readUByte()
      const iDesc = b1 === 0 ? i : 'Bank[' + b1 + '][' + i + ']'
      const dDesc = b2 === 0 ? d : 'Bank[' + b2 + '][' + d + ']'
      return {
        op: 'SOUND',
        b1,
        b2,
        i,
        d,
        js: 'playSound({sound:' + iDesc + ', direction:' + dDesc + '});'
      }
    }

    if (op === 0xf2) {
      const b1b2 = $r.readUByte()
      const b1 = (b1b2 & 0xf0) >> 4
      const b2 = b1b2 & 0x0f
      const b3b4 = $r.readUByte()
      const b3 = (b3b4 & 0xf0) >> 4
      const b4 = b3b4 & 0x0f
      const bxb5 = $r.readUByte()
      const b5 = bxb5 & 0x0f
      const akaoOp = $r.readUByte()
      const p1 = $r.readUByte()
      const p2 = $r.readUShort()
      const p3 = $r.readUShort()
      const p4 = $r.readUShort()
      const p5 = $r.readUShort()
      const p1Desc = b1 === 0 ? p1 : 'Bank[' + b1 + '][' + p1 + ']'
      const p2Desc = b2 === 0 ? p2 : 'Bank[' + b2 + '][' + p2 + ']'
      const p3Desc = b3 === 0 ? p3 : 'Bank[' + b3 + '][' + p3 + ']'
      const p4Desc = b4 === 0 ? p4 : 'Bank[' + b4 + '][' + p4 + ']'
      const p5Desc = b5 === 0 ? p5 : 'Bank[' + b5 + '][' + p5 + ']'
      return {
        op: 'AKAO',
        b1,
        b2,
        b3,
        b4,
        b5,
        akaoOp,
        p1,
        p2,
        p3,
        p4,
        p5,
        js:
          'musicOp_F2_' +
          stringUtil.toHex2(akaoOp) +
          '({p1:' +
          p1Desc +
          ', p2:' +
          p2Desc +
          ', p3:' +
          p3Desc +
          ', p4:' +
          p4Desc +
          ', p5:' +
          p5Desc +
          '});',
        pres: 'Music event.'
      }
    }

    if (op === 0xf3) {
      const id = $r.readUByte()
      return {
        op: 'MUSVT',
        id,
        js: 'musicVTOp0xf3({song:' + id + '});'
      }
    }

    if (op === 0xf4) {
      const id = $r.readUByte()
      return {
        op: 'MUSVM',
        id,
        js: 'musicVMOp0xf4({song:' + id + '});'
      }
    }

    if (op === 0xf5) {
      const s = $r.readUByte()
      const sDesc = s === 0 ? 'M.NotLocked' : 'M.Locked'
      return {
        op: 'MULCK',
        s,
        js: 'setMusicLockMode(' + sDesc + ');'
      }
    }

    if (op === 0xf6) {
      const id = $r.readUByte()
      return {
        op: 'BMUSC',
        id,
        js: 'setBattleMusic({song:' + id + '});'
      }
    }

    if (op === 0xf8) {
      const m = $r.readUByte()
      return {
        op: 'PMVIE',
        m,
        js: 'setCurrentMovie({movie:' + m + '});'
      }
    }

    if (op === 0xf9) {
      return {
        op: 'MOVIE',
        js: 'playMovie();'
      }
    }

    if (op === 0xfa) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      return {
        op: 'MVIEF',
        b,
        a,
        js: 'Bank[' + b + '][' + a + '] = getCurrentMovieFrame();'
      }
    }

    if (op === 0xfb) {
      const s = $r.readUByte()
      const sFuncDesc = s === 0 ? 'useMovieCamera' : 'stopUsingMovieCamera'
      return {
        op: 'MVCAM',
        s,
        js: sFuncDesc + '();'
      }
    }

    if (op === 0xfc) {
      const p = $r.readUByte()
      return {
        op: 'FMUSC',
        p,
        js: 'musicF({p:' + p + '});'
      }
    }

    if (op === 0xfd) {
      const i = $r.readUByte()
      const p1 = $r.readUByte()
      const p2 = $r.readUByte()
      const p3 = $r.readUByte()
      const p4 = $r.readUByte()
      const p5 = $r.readUByte()
      const p6 = $r.readUByte()
      return {
        op: 'CMUSC',
        i,
        p1,
        p2,
        p3,
        p4,
        p5,
        p6,
        js:
          'musicC(' +
          i +
          ', ' +
          p1 +
          ', ' +
          p2 +
          ', ' +
          p3 +
          ', ' +
          p4 +
          ', ' +
          p5 +
          ', ' +
          p6 +
          ');'
      }
    }

    if (op === 0xfe) {
      const b = $r.readUByte()
      const a = $r.readUByte()
      return {
        op: 'CHMST',
        b,
        a,
        js: 'Bank[' + b + '][' + a + '] = isMusicPlaying();'
      }
    }

    if (op === 0xff) {
      return {
        op: 'GAMEOVER',
        js: 'gameOver();'
      }
    }

    // definitely want to throw Error here to prevent attempts to translate subsequent opcodes, which will be invalid/out-of-sync
    console.error('unsupported opCode: 0x' + stringUtil.toHex2(op))
    throw new Error('unsupported opCode: 0x' + stringUtil.toHex2(op))
  } // end of readOp()

  readBattleActionOp () {
    // Still need to complete this:
    // https://wiki.ffrtt.ru/index.php/FF7/Battle/Battle_Animation/Animation_Script
    // https://github.com/Akari1982/q-gears_reverse/blob/master/ffvii/documents/battle/models/animation.txt

    const $r = this
    const offset = this.offset
    const op = $r.readUByte()

    const getRaw = (from, to) => {
      // console.log('getRaw', from, to)
      this.offset = from
      return this.readUByteArray(to - from)
        .map(v => stringUtil.dec2hex(v, 2, true).toUpperCase())
        .join(' ')
    }

    // 0x00 - 0x8d - animations
    if (op >= 0x00 && op <= 0x8d) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ANIM',
        animation: op,
        raw,
        js: `playAnimation({animation: ${op}})`
      }
    }

    // play some effect 800cdfc4.
    if (op === 0x91) {
      const arg = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EFFPLAY',
        arg,
        raw,
        js: `playEffect({arg: ${arg}})`
      }
    }
    // Something to do with Tifa's limits
    if (op === 0x9d) {
      const arg = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'TIFALIM',
        arg,
        raw,
        js: `tifaLimit({arg: ${arg}})`
      }
    }
    // 0xa4 - E.Skill charge effect (remains stationary on actor's position when called)
    if (op === 0xa4) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'CHARGEE',
        raw,
        js: 'enemySkillChargeEffect()'
      }
    }
    // 0xa5 - Summon charge effect (remains stationary on actor's position when called)
    if (op === 0xa5) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'CHARGES',
        raw,
        js: 'summonChargeEffect()'
      }
    }
    // A9[][00] this increment script pointer by 2 and execute animation on second pointer.
    if (op === 0xa9) {
      const arg = $r.readUByte()
      const arg2 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SKANIM',
        arg,
        arg2,
        raw,
        js: `skipBy2AndAnim({arg: ${arg}, arg2: ${arg2}})`
      }
    }
    // Unpause camera scripts.
    if (op === 0xaa) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'UNPAUSE',
        raw,
        js: 'unpauseCamera()'
      }
    }
    // set_effect - AD[joint XX][distance XXXX][start XX][end XX] Attach effect (machinegun) to joint 07 with
    // given distanse from this joint which starts at 01 and ends at 0x0a. Always machingun fire.
    // If end 0x80 byte is set then we do not add shell effect.
    if (op === 0xad) {
      const joint = $r.readUByte()
      const distance = $r.readUShort()
      const start = $r.readUByte()
      const end = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'GUN',
        joint,
        distance,
        start,
        end,
        raw,
        js: `setMachineGunEffect({joint: ${joint}, distance: ${distance}, start: ${start}, end: ${end}})`
      }
    }
    // B6[animation XX] pause_camera_finish_animation    - B6[animation XX] pause camera scripts and then continue
    // to play animation given animation from frame that already set. Used to smoothly finish idle animation
    // before start of anything else. Camera paused because we want camera be sync with start of action
    // (this is just finish animation that was already started).
    if (op === 0xb6) {
      const animation = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'PCANIM',
        animation,
        raw,
        js: `pauseCameraFinishAnimation({animation: ${animation}})`
      }
    }
    // B9[camera_script_id XX] set camera script id to use
    if (op === 0xb9) {
      const id = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETCAM',
        id,
        raw,
        js: `setCameraScript({id: ${id}})`
      }
    }
    // execute_hurt - BE[wait XX] after wait time ends execute hurt action, effect, sound.
    // This will NOT display damage and barriers effect.
    if (op === 0xbe) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'HURT',
        frames,
        raw,
        js: `executeHurt({frames: ${frames}})`
      }
    }
    // 0xc1 - jump - C1 jump to first meet C9 from start of script
    if (op === 0xc1) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'JUMP',
        raw,
        js: 'jumpToLabel()'
      }
    }
    // 0xc2 - execute_damage - C2[wait XX] after wait time ends show damage.
    if (op === 0xc2) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DAMAGE',
        frames,
        raw,
        js: `executeDamage({frames: ${frames}})`
      }
    }
    // 0xc5 - set_unit_fade_wait - C5 set value from 0x800f8374 (unit fade time) as wait time for action script.
    if (op === 0xc5) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FADEW',
        raw,
        js: 'setFadeWait()'
      }
    }
    // 0xc6 - set_unit_fade_time - C6[wait XX] set value to 0x800f8374 (unit fade time) for futher use.
    if (op === 0xc6) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FADET',
        frames,
        raw,
        js: `setFadeTime({frames: ${frames}})`
      }
    }
    // 0xc9 - jump_label - C9 do nothing just go to next opcode. Used as marker when jump up.
    if (op === 0xc9) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'LABEL',
        raw,
        js: 'setJumpLabel()'
      }
    }
    // 0xca - jump_if_not_loaded - CA jump to first meet C9 at start of this script if something loading in background.
    if (op === 0xca) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'JUMPL',
        raw,
        js: 'jumpToLabelIfStillLoading()'
      }
    }
    // 0xd0 - D0[4C04][01] jump to enemy
    if (op === 0xd0) {
      const distance = $r.readUShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVJ',
        distance,
        frames,
        raw,
        js: `jumpToEnemy({distance: ${distance}, frames: ${frames}})`
      }
    }
    // 0xd1 - move_to_target - D1[distance XXXX][XXXX][steps XX] move to enemy using function 0x800cf5bc by number of steps.
    // Stop distance is distance to target collision radius.
    if (op === 0xd1) {
      const distance = $r.readUShort()
      const arg2 = $r.readUShort()
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVE',
        distance,
        arg2,
        frames,
        raw,
        js: `moveToTarget({distance: ${distance}, arg2: ${arg2}, frames: ${frames}})`
      }
    }
    // 0xd8 - play_sound_for_attacker - D8[wait XX][sound XXXX] play sound using attacker settings after
    // waiting given number of frames.
    if (op === 0xd8) {
      const frames = $r.readUByte()
      const sound = $r.readUShort()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SOUND',
        frames,
        sound,
        raw,
        js: `playSound({frames: ${frames}, sound: ${sound}})`
      }
    }
    // 0xe0 - Limit charge effect (remains stationary on actor's position when called)
    if (op === 0xe0) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'CHARGEL',
        raw,
        js: 'limitChargeEffect()'
      }
    }
    // 0xe3 - Move Z instantly - Assuming this is right (E3) - Eg, ensure backrow/normal is applied after anim is finished
    if (op === 0xe3) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVIZ',
        raw,
        js: 'moveDefaultZPosInstantly()'
      }
    }
    // 0xe5 - return_direction - E5 set initial (idle) direction for current unit acording to situation.
    if (op === 0xe5) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ROTI',
        raw,
        js: 'rotateBackToIdleDirection()'
      }
    }
    // 0xe6 - Magic charge effect (remains stationary on actor's position when called)
    if (op === 0xe6) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'CHARGEM',
        raw,
        js: 'magicChargeEffect()'
      }
    }
    // 0xe8 - load_additional_effect - E8 start load effect requested during attack (attack type id and attack id
    // are used to determinate what effect to load).
    if (op === 0xe8) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'LOAD',
        raw,
        js: 'loadAdditionalEffect()'
      }
    }
    // 0xea - show_action_name - EA show action name.
    if (op === 0xea) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'NAME',
        raw,
        js: 'showActionName()'
      }
    }
    // 0xeb - Assume that this is execute the effect from a item
    if (op === 0xeb) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EXEITEM',
        raw,
        js: 'executeItem()'
      }
    }
    // 0xec - execute_additional_effect - EC if effect not loaded we will call this opcode until it does.
    // For magic, summon, limit, enemy skill and enemy attack we execute loaded effect
    // All effects are hardcoded so they can do whatever they want (play sounds, display damage,
    // request hurt for target and so on).
    if (op === 0xec) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'EXEEFF',
        raw,
        js: 'executeEffect()'
      }
    }

    // 0xed - ????
    if (op === 0xed) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ED',
        raw,
        js: 'unknownED()'
      }
    }
    // 0xee - return_to_idle - EE reset to idle. Script pointer to 0.
    if (op === 0xee) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'RET',
        raw,
        js: 'return()'
      }
    }
    // 0xf0 - set_effect - F0 set effect (foot_dust).
    if (op === 0xf0) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DUST',
        raw,
        js: 'setDustEffect()'
      }
    }
    // 0xf1 - ???
    if (op === 0xf1) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'F1',
        raw,
        js: 'unknownF1()'
      }
    }
    // 0xf3 - wait - F3 repeat reading this opcode until wait time for script not reach 0.
    // It descrease by 1 each tome this opcode called.
    if (op === 0xf3) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'WAIT',
        raw,
        js: 'wait()'
      }
    }
    // 0xf4 - set_wait - F4[wait XX] set frames to wait.
    if (op === 0xf4) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'SETWAIT',
        frames,
        raw,
        js: `setWait({frames: ${frames}})`
      }
    }
    // 0xf6 - play_die_if_dead - F6 play die effect (depends on die type) if unit is dead. Used in enemy hurt actions.
    if (op === 0xf6) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'DIE',
        raw,
        js: 'playDieEffectIfDead()'
      }
    }
    // 0xf7 - execute_attack - F7[wait XX] after wait time ends execute hurt action, effect, sound. This will display damage and barriers effect.
    if (op === 0xf7) {
      const frames = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ATT',
        frames,
        raw,
        js: `executeAttack({frames: ${frames}})`
      }
    }
    // 0xfa - return_position - FA instantly set default position for units.
    if (op === 0xfa) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'MOVI',
        raw,
        js: 'returnToIdlePosition()'
      }
    }
    // 0xfc - set_direction - FC set direction for targets (delayed) and attacker acording to situation.
    if (op === 0xfc) {
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'ROTF',
        raw,
        js: 'setRotationToActors()'
      }
    }
    // 0xfe - ??? Guess a 3 bytes based on what it looks like it rtab
    if (op === 0xfe) {
      const arg1 = $r.readUByte()
      const arg2 = $r.readUByte()
      const arg3 = $r.readUByte()
      const raw = getRaw(offset, $r.offset)
      return {
        op: 'FE',
        arg1,
        arg2,
        arg3,
        raw,
        js: 'unknownFE()'
      }
    }

    // TODO - E0 ???
    // Args for EC ????
    //   E8 FC 00 E0 EA F4 19 F3 EC 2C 2D 2D 2E FA E5 EE

    const opUpper = stringUtil.dec2hex(op, 2, true).toUpperCase()
    // console.log('Unknown op', opUpper, $r.offset - 1)
    return {
      op: opUpper,
      raw: opUpper,
      js: `unknownOp${opUpper}()`
    }
    // console.error(
    //   '    unsupported opCode: 0x' + stringUtil.toHex2(op),
    //   $r.offset
    // )
    // throw new Error('unsupported opCode: 0x' + stringUtil.toHex2(op))
  }

  printNextBufferDataAsHex (numRows = 30, numCols = 8) {
    console.log()
    const pad5 = stringUtil.pad5
    const toHex2 = stringUtil.toHex2
    const toHex5 = stringUtil.toHex5
    let hex = ''
    for (let i = 0; i < numRows; i++) {
      hex =
        toHex5(this.offset) +
        ' + ' +
        toHex5(i * numCols) +
        ' = ' +
        toHex5(this.offset + i * numCols) +
        ' : '
      for (let j = 0; j < numCols; j++) {
        const pos = this.offset + i * numCols + j
        if (pos >= this.buffer.length) {
          hex = hex + 'EOF'
        } else {
          const c = this.buffer[pos]
          hex = hex + toHex2(c) + ' '
        }
      }
      hex = hex + '    '
      for (let j = 0; j < numCols; j++) {
        const pos = this.offset + i * numCols + j
        if (pos >= this.buffer.length) {
          hex = hex + ''
        } else {
          const c = this.buffer[pos]
          // hex = hex + (c >= 0x20 && c <= 127 ? String.fromCharCode(c) : ".");
          hex = hex + (c < 0xd0 ? this.charMap[c] : '.')
        }
      }
      console.log(hex)
      hex = ''
    }
  }
} // end of class FF7BinaryDataReader

module.exports = {
  FF7BinaryDataReader
}
