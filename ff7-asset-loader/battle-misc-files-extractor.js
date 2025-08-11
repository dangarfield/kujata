const fs = require('fs-extra')
const path = require('path')

const { FF7BinaryDataReader } = require('./ff7-binary-data-reader.js')
const { toHex2 } = require('./string-util.js')
const { TexFile } = require('./tex-file.js')
const { KUJATA_ROOT } = require('./helper.js')
const sharp = require('sharp')

const saveData = async (data, outputFile) => {
  await fs.outputFile(outputFile, JSON.stringify(data))
}

const transformVertexColorsToModernOrientation = (
  vertexColors,
  vertexColorSet
) => {
  let temp
  temp = vertexColorSet['0']
  vertexColorSet['0'] = vertexColorSet['16']
  vertexColorSet['16'] = temp

  temp = vertexColorSet['8']
  vertexColorSet['8'] = vertexColorSet['16']
  vertexColorSet['16'] = temp

  temp = vertexColorSet['16']
  vertexColorSet['16'] = vertexColorSet['24']
  vertexColorSet['24'] = temp

  const third = vertexColors.pop()
  vertexColors.splice(2, 0, third)
}

/* Contains vertex position, colors for the active player pointer */
const extractMarkDat = async (
  inputBattleDataDirectory,
  outputBattleMiscDirectory
) => {
  const buffer = fs.readFileSync(
    path.join(inputBattleDataDirectory, 'mark.dat')
  )
  const r = new FF7BinaryDataReader(buffer)

  const vertexCount = r.readUByte() / 8 // ? Untested
  const unknown = {}
  unknown.unknown1 = r.read24bitInteger()
  const vertexPositions = []
  unknown.unknown2 = []
  for (let vertexI = 0; vertexI < vertexCount; vertexI++) {
    const x = r.readShort()
    const y = r.readShort()
    const z = r.readShort()
    unknown.unknown2.push(r.readShort())
    vertexPositions.push([x, y, z])
  }
  unknown.unknown3 = r.readUByteArray(8)
  const facesCount = r.readUInt() // ? Untested
  const faces = []
  unknown.unknown4 = []
  unknown.unknown5 = []
  for (let facesI = 0; facesI < facesCount; facesI++) {
    const face = { positions: [], colors: [] }
    for (let i = 0; i < 3; i++) {
      face.positions.push(vertexPositions[r.readShort() / 8])
    }
    unknown.unknown4.push(r.readShort())
    for (let i = 0; i < 3; i++) {
      face.colors.push(
        '#' +
          r
            .readUByteArray(3)
            .map(c => toHex2(c))
            .join('')
      )
      unknown.unknown5.push(r.readByte())
    }
    faces.push(face)
  }
  const markData = {
    faces,
    unknown
  }
  // console.log('markData', JSON.stringify(markData, null, 4))
  await saveData(
    markData.faces,
    path.join(outputBattleMiscDirectory, 'mark.dat.json')
  )
}
const extractCamDatData = async (
  inputBattleSceneDirectory,
  outputBattleMiscDirectory
) => {
  // TODO - Work In Progress
  const buffer = fs.readFileSync(
    path.join(inputBattleSceneDirectory, 'camdat0.bin')
  )
  const r = new FF7BinaryDataReader(buffer)

  r.offset = 82
  const cameraPositions = []
  for (let j = 0; j < 30; j++) {
    const camera = {
      xAxis: { x: r.readShort(), y: r.readShort(), z: r.readShort() },
      yAxis: { x: r.readShort(), y: r.readShort(), z: r.readShort() },
      zAxis: { x: r.readShort(), y: r.readShort(), z: r.readShort() },
      unknown1: r.readShort(), // dupe of zAxis.z
      position: { x: r.readInt(), y: r.readInt(), z: r.readInt() },
      unknown2: r.readInt(),
      zoom: r.readUShort(),
      unknown3: r.readShort()
    }
    delete camera.unknown1
    delete camera.unknown2
    delete camera.unknown3
    console.log('camera', camera, r.offset)
    cameraPositions.push(camera)
  }

  console.log('example', r.readUByteArray(24 * 4))
  // 0x481, 0x493
  const a = 0x481
  r.offset = a
  console.log('example2', r.readUByteArray(40 * 2))
  r.offset = r.offset - 40 * 2
  let x = r.readShort()
  let y = r.readShort()
  let z = r.readShort()
  console.log('xyz', x, y, z, 'o', a)
  for (let i = 0; i < 1260; i++) {
    r.offset = a + 6 + i
    const px = r.readShort()
    const py = r.readShort()
    const pz = r.readShort()
    const dx = x - px
    const dy = y - py
    const dz = z - pz

    // console.log('dxyz', dx, dy, dz)
    const t = 300
    if (Math.abs(dx) < t && Math.abs(dy) < t && Math.abs(dz) < t) {
      console.log('dxyz', dx, dy, dz, 'FOUND SOMETHING', r.offset)
      x = px
      y = py
      z = pz
    }
  }
}

const extractMiscBattleData = async (
  inputBattleDataDirectory,
  inputBattleSceneDirectory,
  outputBattleMiscDirectory
) => {
  console.log('Extract Misc Battle Data: START')
  await extractMarkDat(inputBattleDataDirectory, outputBattleMiscDirectory)
  await extractCamDatData(inputBattleSceneDirectory, outputBattleMiscDirectory)

  console.log('Extract Misc Battle Data: END')
}
module.exports = {
  extractMiscBattleData
}
