const fs = require('fs-extra')
const path = require('path')
const stringUtil = require('./string-util.js')
// const LzsDecompressor = require('../lzs/lzs-decompressor.js')
const { FF7BinaryDataReader } = require('./ff7-binary-data-reader.js')
const backgroundLayerRenderer = require('./background-layer-renderer.js')
// const { toHexlet2 } = require('./string-util.js')
const { TexFile } = require('../ff7-asset-loader/tex-file.js')
const { KUJATA_ROOT } = require('./helper.js')

let musicList = null
module.exports = class FLevelLoader {
  constructor (lzsDecompressor, mapList) {
    this.lzsDecompressor = lzsDecompressor
    this.mapList = mapList || []
  }

  loadFLevel (config, baseFilename, renderBackgroundLayers) {
    this.ensureTexturesExist(config)
    // console.log('\n\nflevel', config, baseFilename, renderBackgroundLayers)
    if (!musicList) {
      // Do this so the fields are not reliant on the media export
      const musicIdx = fs
        .readFileSync(
          path.join(config.ff7InstallDirectory, 'data', 'music', 'music.idx')
        )
        .toString()
        .split('\r\n')
      musicIdx.unshift('')
      musicIdx.unshift('')

      const musicNames = JSON.parse(
        fs.readFileSync(path.join(KUJATA_ROOT, 'metadata', 'music-names.json'))
      )

      musicList = musicIdx.map((name, index) => {
        return { id: index, name, description: musicNames[name] }
      })
      // console.log('\n\nCREATED MUSIC LIST')
    }

    // const charMap = require('./char-map.js')

    let buffer = fs.readFileSync(
      path.join(config.unlgpDirectory, 'flevel.lgp', baseFilename)
      // config.kujataDataDirectory + '/' + baseFilename
    )
    buffer = this.lzsDecompressor.decompress(buffer)
    // console.log('buffer', buffer.length)

    const r = new FF7BinaryDataReader(buffer)

    // const fileSizeBytes = buffer.length
    r.offset = 0

    const flevel = {}
    let sectionOffset = 0
    let sectionOffsetBase = 0

    flevel.blank = r.readShort() // always 0x00
    flevel.numSections = r.readInt()
    flevel.sectionOffsets = []
    for (let s = 0; s < flevel.numSections; s++) {
      flevel.sectionOffsets.push(r.readInt())
    }

    // Section 0/1: "script" (Dialog and Event)

    flevel.script = {}

    sectionOffset = r.offset // flevel.sectionOffsets[i]     // this offset is relative to the beginning of file
    flevel.script.length = r.readInt()
    sectionOffsetBase = r.offset // flevel.sectionOffsets[i] + 4 // entityScriptRoutines[j] is relative to this offset

    flevel.script.header = {
      unknown: r.readShort(),
      numEntities: r.readByte(),
      numModels: r.readByte(),
      stringOffset: r.readUShort(),
      numAkaoOffsets: r.readShort(),
      scale: r.readShort(),
      blank: [r.readShort(), r.readShort(), r.readShort()],
      creator: r.readString(8),
      name: r.readString(8),
      entityNames: [],
      akaoOffsets: [],
      entitySections: []
    }

    for (let i = 0; i < flevel.script.header.numEntities; i++) {
      flevel.script.header.entityNames.push(r.readString(8))
    }
    for (let i = 0; i < flevel.script.header.numAkaoOffsets; i++) {
      flevel.script.header.akaoOffsets.push(r.readInt())
    }

    for (let i = 0; i < flevel.script.header.numEntities; i++) {
      const entitySection = {
        entityName: flevel.script.header.entityNames[i],
        entityScriptRoutines: []
      }
      for (let i = 0; i < 32; i++) {
        entitySection.entityScriptRoutines.push(r.readUShort())
      }
      flevel.script.header.entitySections.push(entitySection)
    }

    flevel.script.entities = []
    flevel.script.dialogStrings = []

    // read dialog offsets, then dialog strings
    r.offset = sectionOffsetBase + flevel.script.header.stringOffset
    // console.log('dialog offset', r.offset, flevel.script.header.stringOffset)
    let numDialogs = r.readUShort() // + 255;
    if (numDialogs === 0) {
      numDialogs = 255
      // console.log('ZERO DIALOGS', r.readUByte(), r.readUByte(), r.readUByte(), r.readUByte(), r.readUByte(), r.readUByte(), r.readUByte(), r.readUByte())
      r.offset = sectionOffsetBase + flevel.script.header.stringOffset
      // console.log('dialog offset', r.offset, flevel.script.header.stringOffset)
      r.readUShort() // + 255;
    } else if (numDialogs > 255) {
      numDialogs = 0
    }
    // console.log('dialog numDialogs', numDialogs)
    const dialogOffsets = []
    for (let i = 0; i < numDialogs; i++) {
      dialogOffsets.push(r.readUShort())
    }
    for (let i = 0; i < numDialogs; i++) {
      const dialogOffset = dialogOffsets[i]
      r.offset =
        sectionOffsetBase + flevel.script.header.stringOffset + dialogOffset
      const string = r.readDialogString(1000) // TODO: What's the longest dialog string?

      // r.offset = sectionOffsetBase + flevel.script.header.stringOffset + dialogOffset
      // const bin = r.readUByteArray(1000).map(b => toHex2(b)).join(' ').split(' ff')[0]
      // const feS = bin.split(/(?=fe)/g).filter(s => s.startsWith('fe'))// .map(s => s.split(' 00')[0])
      // if (feS.length > 0) {
      //   console.log('--------------------------------------------------------------------------------------------------------')
      //   console.log(bin)
      //   console.log(string)
      //   console.log('fe strings: ', numDialogs, feS)
      // //   /*
      // //   23 48 4f 4c 45 e7 b2 29 00 54 48 49 4e 4b 00 49 54 07 53 e7 e1 fe e2 40 04 06 00 0e b3 Chole<br/>“I think it's<br/>       <fe>, `$& .”
      // //   23 48 4f 4c 45 e7 b2 34 48 41 54 07 53 00 fe e2 40 04 06 00 b3 Chole<br/>“That's <fe>, `$& ”
      // //   C  h  o  l  e <br “  T  h  a  t  '  s    <fe , `$& ”
      // //   */
      // }

      flevel.script.dialogStrings.push(string)
      // console.log('dialog ->', sectionOffsetBase, flevel.script.header.stringOffset, dialogOffset, '-', sectionOffsetBase + flevel.script.header.stringOffset + dialogOffset, string)
    }
    // console.log('flevel.script.dialogStrings', flevel.script.dialogStrings)
    r.setDialogStrings(flevel.script.dialogStrings)

    for (let i = 0; i < flevel.script.header.numEntities; i++) {
      const entity = {
        entityId: i,
        entityName: flevel.script.header.entityNames[i],
        entityType: '', // Purely added for positioning in JSON, updated delow
        scripts: []
      }
      const LOG_I = 999 // Change for debugging
      if (i === LOG_I) {
        console.log(
          'entity',
          entity,
          flevel.script.header.entitySections[i].entityScriptRoutines
        )
      } // DEBUG

      flevel.script.entities.push(entity)
      for (let j = 0; j < 31; j++) {
        // TODO: support entities with 32 scripts; will need different method of determining endOffset
        const startOffset =
          sectionOffsetBase +
          flevel.script.header.entitySections[i].entityScriptRoutines[j]
        r.startOffset = startOffset
        r.offset = startOffset
        // if (i==5 && j==0) {
        //   console.log("Entity " + i + ", Script " + j + ": Offset=" + startOffset + ", HexData:");
        //   r.printNextBufferDataAsHex();
        // }
        if (j > 0) {
          const prevStartOffset =
            sectionOffsetBase +
            flevel.script.header.entitySections[i].entityScriptRoutines[j - 1]
          if (startOffset == prevStartOffset) {
            continue
          }
        }
        const entityScript = {
          index: j,
          scriptType: '',
          ops: []
        }
        let op = {}
        let done = false
        // Determine the startOffset for the "next" script (which is the endOffset for the "current" script)
        let nextStartOffset =
          sectionOffsetBase + flevel.script.header.stringOffset // default
        if (i === LOG_I) {
          console.log('-----------  default', j, nextStartOffset)
        } // Debug
        if (j < 31) {
          // If this is not the last script for this entity, just look at the next script's offset
          let nextStartOffsetCount = 1
          nextStartOffset =
            sectionOffsetBase +
            flevel.script.header.entitySections[i].entityScriptRoutines[
              j + nextStartOffsetCount
            ]
          while (startOffset === nextStartOffset) {
            nextStartOffsetCount++
            // if (i + 1 < flevel.script.header.entitySections.length && nextStartOffsetCount >= sectionOffsetBase + flevel.script.header.entitySections[i + 1].entityScriptRoutines[0]) {
            //   continue
            // }
            nextStartOffset =
              sectionOffsetBase +
              flevel.script.header.entitySections[i].entityScriptRoutines[
                j + nextStartOffsetCount
              ]
          }

          if (i === LOG_I) {
            console.log('  j < 31', startOffset, nextStartOffset)
          } // Debug
        }
        const lastScriptOffset =
          sectionOffsetBase +
          flevel.script.header.entitySections[i].entityScriptRoutines[
            flevel.script.header.entitySections[i].entityScriptRoutines.length -
              1
          ]
        const isLastScript = j == 31 || lastScriptOffset == startOffset
        if (i === LOG_I) {
          console.log(
            '  isLastScript',
            isLastScript,
            j,
            nextStartOffset,
            startOffset,
            lastScriptOffset
          )
        } // Debug
        if (isLastScript) {
          const isLastEntity = i == flevel.script.header.numEntities - 1
          if (isLastEntity) {
            // If this is the last entity (and last script), assume it's the end of the entire field section (beginning of string/dialog section)
            nextStartOffset =
              sectionOffsetBase + flevel.script.header.stringOffset
            if (i === LOG_I) {
              console.log(
                'last script last entity',
                j,
                r.offset,
                nextStartOffset
              )
            } // Debug
          } else {
            // If this is not the last entity, just look at the next entity's first script offset
            nextStartOffset =
              sectionOffsetBase +
              flevel.script.header.entitySections[i + 1].entityScriptRoutines[0]
            if (i === LOG_I) {
              console.log(
                'last script not last entity',
                j,
                r.offset,
                nextStartOffset
              )
            } // Debug
          }
        }
        if (i === LOG_I) {
          console.log(' nextStartOffset', j, r.offset, nextStartOffset)
        } // Debug

        let byteIndexOffset = 0
        while (!done) {
          // let lineNumber = pad5(offset - sectionOffsetBase);
          const lineNumber = stringUtil.pad5(r.offset)
          const byteIndex = r.offset - startOffset
          try {
            op = r.readOpAndIncludeRawBytes() // r.readOp();
            if (entityScript.ops.length === 0) {
              byteIndexOffset = byteIndex
            }
            op.byteIndex = byteIndex - byteIndexOffset
            // op.line = lineNumber
            entityScript.ops.push(op)
            // if (i === LOG_I) { console.log('   op added -> ', op.op) } // Debug
            // console.log("read op=" + JSON.stringify(op, null, 0));
          } catch (e) {
            console.error(
              'Error while reading op in ' +
                baseFilename +
                ', entity ' +
                entity.entityName +
                ', index ' +
                j +
                ': ',
              e
            )
            console.error(
              'Previous ops: ' + JSON.stringify(entityScript.ops, null, 2)
            )
            op = { op: 'ERROR', js: '' + e }
            entityScript.ops.push(op)
            // process.exit(0);
            // TODO - For some reason there is an error with mds7st3 aval script 6
            // It looks as though the entityScriptRoutines value for the next script is just wrong
            // It says the value should be +46, but it isn't. Catching this single error anyway
            break
          }

          if (r.offset >= nextStartOffset) {
            if (i === LOG_I) {
              console.log('  done', j, r.offset, nextStartOffset)
            } // Debug
            done = true
          } else {
            if (i === LOG_I) {
              console.log('  continue', j, r.offset, nextStartOffset)
            } // Debug
          }
          if (i === LOG_I) {
            console.log('End op while ' + i + ' script ' + j)
          }
        } // end while(!done)
        if (i === LOG_I) {
          console.log('End of entity ' + i + ' script ' + j)
        }

        if (j === 0) {
          // Split init script into init and main
          let initReturn = false
          let opIndex = 0
          let gotoIndex = 0
          while (!initReturn) {
            // const opX = entityScript.ops[opIndex]
            // console.log(j, opIndex, opX, opX?.byteIndex, '->', gotoIndex)
            const returnFound = entityScript.ops[opIndex].op === 'RET'
            const gotoFound = entityScript.ops[opIndex].goto !== undefined
            if (gotoFound) {
              gotoIndex = entityScript.ops[opIndex].goto
              // if (i === LOG_I) { console.log('splitInit', 'gotoIndex', gotoIndex, opIndex, returnFound, gotoFound, entityScript.ops[opIndex].op, entityScript.ops[opIndex].byteIndex) }
            }
            if (
              returnFound
              // && entityScript.ops[opIndex].byteIndex >= gotoIndex
            ) {
              // if (i === LOG_I) { console.log('splitInit', 'initReturn', gotoIndex, opIndex, returnFound, gotoFound, entityScript.ops[opIndex].op, entityScript.ops[opIndex].byteIndex) }
              initReturn = true
            } else {
              // if (i === LOG_I) { console.log('splitInit', 'next', gotoIndex, opIndex, returnFound, gotoFound, entityScript.ops[opIndex].op, entityScript.ops[opIndex].byteIndex) }
              opIndex++
            }
          }
          const initOps = entityScript.ops
          const mainOps = initOps.splice(opIndex + 1)
          entityScript.ops = initOps
          entity.scripts.push(entityScript)

          const mainEntityScript = {
            index: 0,
            scriptType: '',
            isMain: true,
            ops: mainOps
          }
          entity.scripts.push(mainEntityScript)
          // if (i === LOG_I) { console.log('INIT/MAIN', i, entityScript, mainEntityScript, opIndex) }
        } else {
          if (entityScript.ops.length > 0) {
            entity.scripts.push(entityScript)
          }
        }

        // if (entity.entityName === 'line2' && j >= 2) {
        //   console.log('entityScript', entity.entityName, j, i, entityScript.ops, entityScript.ops.length)
        // }
      }
    }

    const getEntityType = entity => {
      if (entity.scripts.length === 0) {
        return 'Unknown'
      }

      const ops0 = entity.scripts[0].ops.map(o => o.op)

      if (ops0.includes('PC')) {
        return 'Playable Character'
      }
      if (ops0.includes('CHAR')) {
        return 'Model'
      }
      if (ops0.includes('LINE')) {
        return 'Line'
      }
      if (
        ops0.includes('BGPDH') ||
        ops0.includes('BGSCR') ||
        ops0.includes('BGON') ||
        ops0.includes('BGOFF') ||
        ops0.includes('BGROL') ||
        ops0.includes('BGROL2') ||
        ops0.includes('BGCLR')
      ) {
        return 'Animation'
      }
      if (ops0.includes('MPNAM')) {
        return 'Director'
      }

      if (entity.scripts.length >= 2) {
        const ops1 = entity.scripts[1].ops.map(o => o.op)
        if (ops1.includes('MPNAM')) {
          return 'Director'
        }
      }
      return 'Unknown'
    }
    const getScriptType = (script, entityType) => {
      switch (
        script.index // This is the adjusted index, rather than the array position
      ) {
        case 0:
          if (script.isMain) {
            return 'Main'
          } else {
            return 'Init'
          }
        case 1:
          if (entityType === 'Model' || entityType === 'Playable Character') {
            return 'Talk'
          }
          if (entityType === 'Line') {
            return '[OK]'
          }
          break
        case 2:
          if (entityType === 'Model' || entityType === 'Playable Character') {
            return 'Contact'
          }
          if (entityType === 'Line') {
            return 'Move'
          }
          break
        case 3:
          if (entityType === 'Line') {
            return 'Move'
          }
          break
        case 4:
          if (entityType === 'Line') {
            return 'Go'
          }
          break
        case 5:
          if (entityType === 'Line') {
            return 'Go 1x'
          }
          break
        case 6:
          if (entityType === 'Line') {
            return 'Go away'
          }
          break
        default:
          break
      }
      return `Script ${script.index}`
    }
    for (let i = 0; i < flevel.script.entities.length; i++) {
      const entity = flevel.script.entities[i]
      entity.entityType = getEntityType(entity) // Get the type of entity, it's really metadata, but useful
      for (let j = 0; j < entity.scripts.length; j++) {
        const script = entity.scripts[j]
        script.scriptType = getScriptType(script, entity.entityType)
        // console.log('getScriptType', script.index, script.isMain, entity.entityName, entity.entityType, '->', script.scriptType)
      }
    }

    // AKAO - eg music (Note all are music, this could be a tutorial also) - This should be built upon
    flevel.script.akao = []
    for (let i = 0; i < flevel.script.header.akaoOffsets.length; i++) {
      r.offset = flevel.script.header.akaoOffsets[i] + 50
      const musicId = r.readUByte()
      flevel.script.akao.push(musicList[musicId])
    }

    // Section 2/3: Model Loaders
    const replaceBrokenAnimations = (modelName, animName) => {
      // I really didn't want to do this, but this anim seems just plain broken
      switch (animName) {
        case 'BZAC.chi':
          if (modelName.includes('ballet')) {
            return 'AQAD.chi' // southmk2 -> ACGD.HRC (model) -> BZAC.chi
          }
          return animName

        default:
          return animName
      }
    }
    r.offset = flevel.sectionOffsets[2]
    sectionOffset = r.offset // flevel.sectionOffsets[i]     // this offset is relative to the beginning of file
    flevel.script.length = r.readInt()
    sectionOffsetBase = r.offset // flevel.sectionOffsets[i] + 4 // offsets within section are relative to this offset
    const blank = r.readShort()
    const numModels = r.readShort()
    const modelScale = r.readShort()
    flevel.model = {
      header: {
        numModels,
        modelScale
      },
      modelLoaders: []
    }
    for (let i = 0; i < numModels; i++) {
      const modelLoader = {}
      const nameLength = r.readUShort()
      modelLoader.name = r.readString(nameLength)
      const unknown = r.readUShort()
      modelLoader.hrcId = r.readString(8)
      modelLoader.scaleString = r.readString(4)
      modelLoader.numAnimations = r.readUShort()
      modelLoader.light1 = {
        r: r.readUByte(),
        g: r.readUByte(),
        b: r.readUByte(),
        x: r.readShort(),
        y: r.readShort(),
        z: r.readShort()
      }
      modelLoader.light2 = {
        r: r.readUByte(),
        g: r.readUByte(),
        b: r.readUByte(),
        x: r.readShort(),
        y: r.readShort(),
        z: r.readShort()
      }
      modelLoader.light3 = {
        r: r.readUByte(),
        g: r.readUByte(),
        b: r.readUByte(),
        x: r.readShort(),
        y: r.readShort(),
        z: r.readShort()
      }
      modelLoader.globalLight = {
        r: r.readUByte(),
        g: r.readUByte(),
        b: r.readUByte()
      }
      modelLoader.animations = []

      for (let j = 0; j < modelLoader.numAnimations; j++) {
        const animNameLength = r.readUShort()
        const animName = replaceBrokenAnimations(
          modelLoader.name,
          r.readString(animNameLength)
        )
        const unknown = r.readShort()
        modelLoader.animations.push(animName)
        // modelLoader.animations.push({name: animName, unknown: unknown}); // TODO: see if anyone figured out what unknown is
        // console.log('animName', modelLoader.name, animName)
      }

      flevel.model.modelLoaders.push(modelLoader)
    }

    // Section 1/2: Camera
    r.offset = flevel.sectionOffsets[1]
    sectionOffset = r.offset // flevel.sectionOffsets[i]     // this offset is relative to the beginning of file
    const cameraSectionLength = r.readUInt()
    sectionOffsetBase = r.offset // flevel.sectionOffsets[i] + 4 // offsets within section are relative to this offset
    const readCameraVector = function () {
      return {
        x: r.readShort(),
        y: r.readShort(),
        z: r.readShort()
      }
    }
    flevel.cameraSection = {
      cameras: []
    }
    const camera = {
      xAxis: readCameraVector(),
      yAxis: readCameraVector(),
      zAxis: readCameraVector(),
      zz: r.readShort(),
      position: { x: r.readInt(), y: r.readInt(), z: r.readInt() },
      blank: r.readInt(),
      zoom: r.readUShort(),
      unknown: r.readUShort()
    }
    flevel.cameraSection.cameras.push(camera)

    // Section 4/5: Walkmesh
    r.offset = flevel.sectionOffsets[4]
    sectionOffset = r.offset // flevel.sectionOffsets[i]     // this offset is relative to the beginning of file
    const walkmeshSectionLength = r.readUInt()
    sectionOffsetBase = r.offset // flevel.sectionOffsets[i] + 4 // offsets within section are relative to this offset
    const numSectors = r.readUInt()
    flevel.walkmeshSection = {
      numSectors,
      triangles: [],
      accessors: []
    }
    const readWalkmeshVertex = function () {
      return {
        x: r.readShort(),
        y: r.readShort(),
        z: r.readShort(),
        res: r.readShort() // res = Triangle[0].z (padding)
      }
    }
    for (let i = 0; i < numSectors; i++) {
      flevel.walkmeshSection.triangles.push({
        vertices: [
          readWalkmeshVertex(),
          readWalkmeshVertex(),
          readWalkmeshVertex()
        ]
      })
    }
    for (let i = 0; i < numSectors; i++) {
      flevel.walkmeshSection.accessors.push([
        r.readShort(),
        r.readShort(),
        r.readShort()
      ])
    }

    // Section 6/7: Encounter
    const encounterShortToObject = b => {
      return { prob: b >> 10, encounterId: b & 0x03ff }
    }
    r.offset = flevel.sectionOffsets[6]
    const encounterSectionLength = r.readUInt()
    sectionOffsetBase = r.offset // flevel.sectionOffsets[i] + 4 // offsets within section are relative to this offset
    flevel.encounters = {}
    for (const tableId of ['1', '2']) {
      const enabled = r.readUByte()
      const rate = r.readUByte()
      const battles = r.readUShortArray(6).map(b => encounterShortToObject(b))
      const table = {
        tableId,
        enabled,
        rate,
        battles,
        backAttack1: encounterShortToObject(r.readUShort()),
        backAttack2: encounterShortToObject(r.readUShort()),
        sideAttack: encounterShortToObject(r.readUShort()),
        bothSidesAttack: encounterShortToObject(r.readUShort()),
        padding: r.readUShort()
      }
      delete table.padding
      flevel.encounters[tableId] = table
    }

    // Section 7/8: Triggers
    r.offset = flevel.sectionOffsets[7]
    // const sectionEndOffset = flevel.sectionOffsets[8]
    // sectionOffset = r.offset // flevel.sectionOffsets[i]     // this offset is relative to the beginning of file
    flevel.script.length = r.readInt()
    sectionOffsetBase = r.offset // flevel.sectionOffsets[i] + 4 // offsets within section are relative to this offset
    flevel.triggers = {}
    flevel.triggers.header = {}
    flevel.triggers.header.fieldName = r.readString(9)
    flevel.triggers.header.controlDirection = r.readUByte()
    flevel.triggers.header.controlDirectionDegrees =
      ((256 - flevel.triggers.header.controlDirection) * 360) / 256 - 180 // Relative to y axis
    flevel.triggers.header.cameraHeightAdjustment = r.readShort() // could be negative
    flevel.triggers.header.cameraRange = {
      left: r.readShort(),
      bottom: r.readShort(),
      right: r.readShort(),
      top: r.readShort()
    }
    flevel.triggers.header.bgLayer3 = {}
    flevel.triggers.header.bgLayer4 = {}
    const off0x20 = [r.readByte(), r.readByte(), r.readByte(), r.readByte()]

    flevel.triggers.header.bgLayer3.animation = {
      width: r.readUShort(),
      height: r.readUShort()
    }
    flevel.triggers.header.bgLayer4.animation = {
      width: r.readUShort(),
      height: r.readUShort()
    }
    const off0x32 = []
    for (let i = 0; i < 12; i++) {
      off0x32.push(r.readShort())
    }
    // flevel.triggers.header.bgLayer34Unknown = { off0x20 } // TODO: unknowns

    flevel.triggers.header.bgLayer3.animation.x = off0x32[0]
    flevel.triggers.header.bgLayer3.animation.y = off0x32[1]
    flevel.triggers.header.bgLayer4.animation.x = off0x32[2]
    flevel.triggers.header.bgLayer4.animation.y = off0x32[3]
    flevel.triggers.header.bgLayer3.animation.xMultiplier = off0x32[4]
    flevel.triggers.header.bgLayer3.animation.yMultiplier = off0x32[5]
    flevel.triggers.header.bgLayer4.animation.xMultiplier = off0x32[6]
    flevel.triggers.header.bgLayer4.animation.yMultiplier = off0x32[7]

    flevel.triggers.gateways = []
    for (let i = 0; i < 12; i++) {
      const gateway = {
        exitLineVertex1: {
          x: r.readShort(),
          y: r.readShort(),
          z: r.readShort()
        },
        exitLineVertex2: {
          x: r.readShort(),
          y: r.readShort(),
          z: r.readShort()
        },
        destinationVertex: {
          x: r.readShort(),
          y: r.readShort(),
          triangleId: r.readShort()
        },
        fieldId: r.readUShort()
      }
      gateway.destinationVertex.direction = r.readByte()
      const unknown = [r.readByte(), r.readByte(), r.readByte()]
      if (gateway.fieldId !== 32767) {
        if (gateway.fieldId < this.mapList.length) {
          gateway.fieldName = this.mapList[gateway.fieldId]
        }
        flevel.triggers.gateways.push(gateway)
      }
    }

    flevel.triggers.triggers = []
    for (let i = 0; i < 12; i++) {
      const trigger = {
        cornerVertex1: { x: r.readShort(), y: r.readShort(), z: r.readShort() },
        cornerVertex2: { x: r.readShort(), y: r.readShort(), z: r.readShort() },
        bgGroupId_param: r.readUByte(), // see BGON/BGOFF opcodes
        bgFrameId_state: r.readUByte(), // see BGON/BGOFF opcodes
        behavior: r.readUByte(),
        soundId: r.readUByte()
      }
      flevel.triggers.triggers.push(trigger)
    }

    // TODO: interpret this data better, consider combining showArrows and gatewayArrows, consider removing "empty" instances
    for (let i = 0; i < 12; i++) {
      const showArrow = r.readByte()
      if (flevel.triggers.gateways[i]) {
        flevel.triggers.gateways[i].showArrow = showArrow
      }
    }
    flevel.triggers.gatewayArrows = []
    for (let i = 0; i < 12; i++) {
      const gatewayArrow = {
        x: r.readInt(),
        z: r.readInt(),
        y: r.readInt(),
        type: r.readInt()
      }
      flevel.triggers.gatewayArrows.push(gatewayArrow)
    }

    const replacer = function (k, v) {
      if (k === 'entitySections') {
        return undefined
      }
      return v
    }

    // Section 3/4: Palette
    r.offset = flevel.sectionOffsets[3]
    flevel.palette = {
      length: r.readUInt(),
      header: {
        length: r.readUInt(),
        palX: r.readUShort(),
        palY: r.readUShort(),
        colorsPerPage: r.readUShort(),
        pageCount: r.readUShort()
      },
      pages: []
    }
    for (let i = 0; i < flevel.palette.header.pageCount; i++) {
      const page = []
      let firstColor
      for (let j = 0; j < flevel.palette.header.colorsPerPage; j++) {
        const bytes = r.readShort()
        let color = backgroundLayerRenderer.getColorForPalette(bytes)
        if (j === 0) {
          firstColor = color
        } else if (color.isZero) {
          color = firstColor
        }
        page.push(color)
      }
      flevel.palette.pages.push(page)
    }

    // Section 8/9: Background
    r.offset = flevel.sectionOffsets[8]
    const setLayerIDs = tile => {
      switch (
        tile.id // id = z, where lower values are closer to the camera. 4095 = layer 0, 4096 = layer 2, 0 = layer 3
      ) {
        case 4095:
          tile.layerID = 0
          tile.param = 0
          tile.state = 0
          break // Reset params for layer 0, shouldn't really be set
        case 4096:
          tile.layerID = 2
          break
        case 0:
          tile.layerID = 3
          break // TODO - This needs to be looked at more... ujunon1, hill
        default:
          tile.layerID = 1
          break
      }
      tile.z = tile.id
      return tile
    }
    const readTile = r => {
      const blank = r.readUShort()
      const destinationX = r.readShort()
      const destinationY = r.readShort()
      const unknown1 = r.readUByteArray(4)
      const sourceX = r.readUByte()
      const unknown2 = r.readUByte()
      const sourceY = r.readUByte()
      const unknown3 = r.readUByte()
      const sourceX2 = r.readUByte()
      const unknown4 = r.readUByte()
      const sourceY2 = r.readUByte()
      const unknown5 = r.readUByte()
      const width = r.readUShort()
      const height = r.readUShort()
      const paletteId = r.readUByte()
      const unknown6 = r.readUByte()
      const id = r.readUShort()
      const param = r.readUByte()
      const statePow2 = r.readUByte()
      const blending = r.readUByte()
      const useBlack = r.readUByte()
      const typeTrans = r.readUByte()
      const unknown8 = r.readUByte()
      const textureId = r.readUByte()
      const unknown9 = r.readUByte()
      const textureId2 = r.readUByte()
      const unknown10 = r.readUByte()
      const depth = r.readUByte()
      const unknown11 = r.readUByte()
      const idBig = r.readUInt()
      const sourceXBig = r.readUInt()
      const sourceYBig = r.readUInt()
      const blank2 = r.readUShort()
      return setLayerIDs({
        destinationX,
        destinationY,
        sourceX,
        sourceY,
        sourceX2,
        sourceY2,
        width,
        height,
        paletteId,
        id,
        param,
        statePow2,
        state: statePow2 > 0 ? Math.log2(statePow2) : 0,
        blending,
        useBlack,
        typeTrans,
        textureId,
        textureId2,
        depth,
        idBig,
        sourceXBig,
        sourceYBig,
        unknown: {
          // Uncomment should they wish to be used
          blank,
          blank2,
          unknown1,
          unknown2,
          unknown3,
          unknown4,
          unknown5,
          unknown6,
          unknown8,
          unknown9,
          unknown10,
          unknown11
        }
      })
    }
    flevel.background = {
      length: r.readUInt(),
      header: {
        zero1: r.readUShort(),
        usePaddles: r.readUShort(),
        activated: r.readUByte()
      },
      palette: {}
    }

    const paletteTitle = r.readString(7)
    flevel.background.palette.ignoreFirstPixel = r.readUByteArray(20)
    const paletteZero2 = r.readUInt()
    const paletteBack = r.readString(4)

    flevel.background.tiles = {
      layer1: {
        width: r.readUShort(),
        height: r.readUShort(),
        tileCount: r.readUShort(),
        depth: r.readUShort(),
        tiles: []
      }
    }
    flevel.background.tiles.layer1.blank = r.readUShort()
    for (let i = 0; i < flevel.background.tiles.layer1.tileCount; i++) {
      const tile = readTile(r)
      flevel.background.tiles.layer1.tiles.push(tile)
    }
    flevel.background.tiles.layer1.blank2 = r.readUShort()

    for (let layerNo = 2; layerNo <= 4; layerNo++) {
      const layerFlag = r.readUByte()
      if (layerFlag === 1) {
        flevel.background.tiles[`layer${layerNo}`] = {
          width: r.readUShort(),
          height: r.readUShort(),
          tileCount: r.readUShort(),
          unknown: r.readUByteArray(layerNo === 2 ? 16 : 10),
          tiles: []
        }
        flevel.background.tiles[`layer${layerNo}`].blank = r.readUShort()
        for (
          let i = 0;
          i < flevel.background.tiles[`layer${layerNo}`].tileCount;
          i++
        ) {
          const tile = readTile(r)
          flevel.background.tiles[`layer${layerNo}`].tiles.push(tile)
        }
        flevel.background.tiles[`layer${layerNo}`].blank2 = r.readUShort()
      }
    }

    const textureHeader = r.readString(7)
    // console.log('TEXTURE ->', textureHeader) // Check that all has been read properly
    flevel.background.textures = {}

    for (let textureCount = 0; textureCount < 42; textureCount++) {
      // Max possible 42 - https://github.com/niemasd/PyFF7/wiki/Field-File-Section-9%3A-Background
      const exists = r.readUShort()
      if (exists) {
        const size = r.readUShort()
        const depth = r.readUShort()
        let textureData
        if (depth === 2) {
          textureData = r.readUShortArray(256 * 256 * (depth / 2)) // Depth = 2 tiles don't seem to use palettes but instead have the colour directly, so it needs to be 2 bytes
        } else {
          textureData = r.readUByteArray(256 * 256 * depth)
        }
        flevel.background.textures[`texture${textureCount}`] = {
          textureId: textureCount,
          size,
          depth,
          data: textureData
        }
      }
    }
    const end = r.readString(3)
    const ff7 = r.readString(14)
    // console.log('ff7 ->', ff7) // Check that all has been read properly

    // Render Backgrounds
    if (renderBackgroundLayers) {
      const bgFolder = path.join(
        config.kujataDataDirectory,
        'metadata',
        'background-layers'
      )
      fs.ensureDirSync(bgFolder)

      // `${config.metadataDirectory}/background-layers/`
      // const thisBgFolder = `${bgFolder}/${baseFilename}`
      const thisBgFolder = path.join(bgFolder, baseFilename)
      fs.ensureDirSync(thisBgFolder)

      backgroundLayerRenderer.renderBackgroundLayers(
        flevel,
        thisBgFolder,
        baseFilename
      )
    }

    // Clean up json object so it doesn't contain all pallette and texture data
    const textureIDs = Object.keys(flevel.background.textures)
    for (let i = 0; i < textureIDs.length; i++) {
      const textureID = textureIDs[i]
      flevel.background.textures[textureID].data = 'Omitted to reduce size'
    }
    const layerIDs = Object.keys(flevel.background.tiles)
    for (let i = 0; i < layerIDs.length; i++) {
      const layerID = layerIDs[i]
      flevel.background.tiles[layerID].tiles = 'Omitted to reduce size'
    }
    // flevel.palette.pages = 'Omitted to reduce size'

    return flevel
  } // end loadFLevel() function

  async ensureTexturesExist (config) {
    const outputDir = path.join(
      config.kujataDataDirectory,
      'data',
      'field',
      'flevel.lgp',
      'textures'
    )
    // if (fs.existsSync(outputDir)) return

    const flevelDir = path.join(config.unlgpDirectory, 'flevel.lgp')

    const outputDirMetaData = path.join(
      config.kujataDataDirectory,
      'metadata',
      'field-assets'
    )
    fs.ensureDirSync(outputDir)
    fs.ensureDirSync(outputDirMetaData)
    fs.ensureDirSync(path.join(outputDirMetaData, 'field'))
    // `${config.metadataDirectory}/field-assets`

    const texFiles = fs
      .readdirSync(flevelDir)
      .filter(f => f.toLowerCase().endsWith('.tex'))

    const fieldTextureMetadata = { field: [] }
    // console.log('ensureTexturesExist', config.inputFieldFLevelDirectory, config.outputFieldFLevelDirectory, texFiles, outputDir)
    for (let i = 0; i < texFiles.length; i++) {
      const texFile = texFiles[i]
      const texPath = path.join(flevelDir, texFile) // `${config.inputFieldFLevelDirectory}/${texFile}`
      const pngPath = path.join(outputDir, `${texFile}.png`) // `${outputDir}/${texFile}.png`
      // const pngMetadataPath = path.join(outputDirMetaData, `${texFile}.png`) // `${outputDir}/${texFile}.png`
      // const pngPathMetadataParent = path.join(outputDirMetaData, 'field') // `${outputDirMetaData}/field`
      const pngPathMetadata = path.join(
        outputDirMetaData,
        'field',
        `${texFile.replace('.tex', '')}.png`
      )
      // `${outputDirMetaData}/field/${texFile.replace('.tex','')}.png`
      const metadataFile = path.join(outputDirMetaData, 'flevel.metadata.json') // `${outputDirMetaData}/flevel.metadata.json`
      const tex = new TexFile().loadTexFileFromPath(texPath)
      const w = tex.tex.header.width
      const h = tex.tex.header.height
      if (!fs.existsSync(pngPath)) {
        await tex.saveAsPng(pngPath)
      }
      if (!fs.existsSync(pngPathMetadata)) {
        await tex.saveAsPng(pngPathMetadata) // TODO: Duplicated ?! It's in the bundle for some reason, need to check
      }
      // fs.ensureDirSync(pngPathMetadataParent)
      // fs.ensureDirSync(pngPathMetadata)
      fieldTextureMetadata.field.push({
        id: i,
        description: texFile.replace('.tex', ''),
        x: 0,
        y: 0,
        w,
        h,
        palette: 0
      })
      fs.writeFileSync(metadataFile, JSON.stringify(fieldTextureMetadata))
    }
    // console.log('fieldTextureMetadata', fieldTextureMetadata)
  }
} // end module.exports = class FLevelLoader {
