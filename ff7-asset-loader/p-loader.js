const fs = require('fs')

module.exports = {
  loadP: function (
    inputBattleBattleDirectory,
    inputFieldCharDirectory,
    pBaseFilename,
    isBattleModel
  ) {
    let buffer = {}
    if (isBattleModel) {
      buffer = fs.readFileSync(inputBattleBattleDirectory + '/' + pBaseFilename) // e.g. "rtam"
    } else {
      // Try lowercase .p first, then uppercase .P for compatibility
      let pFilePath = inputFieldCharDirectory + '/' + pBaseFilename + '.p'
      if (!fs.existsSync(pFilePath)) {
        pFilePath = inputFieldCharDirectory + '/' + pBaseFilename + '.P'
      }
      buffer = fs.readFileSync(pFilePath)
    }
    let offset = 0

    let readInt = function () {
      if (offset + 4 > buffer.length) {
        // World model P files may be shorter than field/battle models
        // Return 0 for missing data
        offset = buffer.length // Move to end to prevent further reads
        return 0
      }
      let i = buffer.readInt32LE(offset)
      offset += 4
      return i
    }
    let readFloat = function () {
      if (offset + 4 > buffer.length) {
        // World model P files may be shorter than field/battle models
        // Return 0.0 for missing bounding box data
        offset = buffer.length // Move to end to prevent further reads
        return 0.0
      }
      let f = buffer.readFloatLE(offset)
      offset += 4
      return f
    }
    let readByte = function () {
      let b = buffer.readUInt8(offset)
      offset += 1
      return b
    }
    let readShort = function () {
      let s = buffer.readInt16LE(offset)
      offset += 2
      return s
    }
    let fileSizeBytes = buffer.length

    let model = {
      off00: readInt(),
      off04: readInt(),
      isColoredVertices: readInt(),
      numVertices: readInt(),
      numNormals: readInt(),
      off14: readInt(),
      numTextureCoords: readInt(),
      numNormalIndices: readInt(),
      numEdges: readInt(),
      numPolygons: readInt(),
      off28: readInt(),
      off2c: readInt(),
      numHundreds: readInt(),
      numGroups: readInt(),
      mirex_g: readInt(),
      off3c: readInt(),
      unknown: [],
      vertices: [],
      normals: [],
      textureCoordinates: [],
      vertexColors: [],
      polygonColors: [],
      edges: [],
      polygons: [],
      hundreds: [],
      polygonGroups: []
    }

    for (let i = 0; i < 16; i++) {
      model.unknown[i] = readInt()
    }
    for (let i = 0; i < model.numVertices; i++) {
      model.vertices.push({ x: readFloat(), y: readFloat(), z: readFloat() })
    }
    for (let i = 0; i < model.numNormals; i++) {
      model.normals.push({ x: readFloat(), y: readFloat(), z: readFloat() })
    }
    for (let i = 0; i < model.numTextureCoords; i++) {
      model.textureCoordinates.push({ x: readFloat(), y: readFloat() })
    }
    for (let i = 0; i < model.numVertices; i++) {
      model.vertexColors.push({
        b: readByte(),
        g: readByte(),
        r: readByte(),
        a: readByte()
      })
    }
    for (let i = 0; i < model.numPolygons; i++) {
      model.polygonColors.push({
        b: readByte(),
        g: readByte(),
        r: readByte(),
        a: readByte()
      })
    }
    for (let i = 0; i < model.numEdges; i++) {
      model.edges.push({ vertexIndex1: readShort(), vertexIndex2: readShort() })
    }
    for (let i = 0; i < model.numPolygons; i++) {
      readShort() // unknown
      model.polygons.push({
        vertexIndex1: readShort(),
        vertexIndex2: readShort(),
        vertexIndex3: readShort(),
        normalIndex1: readShort(),
        normalIndex2: readShort(),
        normalIndex3: readShort(),
        edgeIndex1: readShort(),
        edgeIndex2: readShort(),
        edgeIndex3: readShort()
      })
      readInt() // unknown
    }
    for (let i = 0; i < model.numHundreds; i++) {
      model.hundreds.push({
        off00: readInt(),
        off04: readInt(),
        renderFlags1: readInt(),
        renderFlags2: readInt(),
        textureId: readInt(),
        textureSetPointer: readInt(),
        off18: readInt(),
        off1c: readInt(),
        off20: readInt(),
        shadeMode: readInt(),
        ambient: readInt(),
        off2c: readInt(),
        materialPointer: readInt(),
        srcBlend: readInt(),
        dstBlend: readInt(),
        off3c: readInt(),
        alphaRef: readInt(),
        blendMode: readInt(), // (0=avg, 1=additive, 4=none? other modes are broken and unused)
        zsort: readInt(), // filled in real-time
        off4c: readInt(),
        off50: readInt(),
        off54: readInt(),
        off58: readInt(),
        vertexAlpha: readInt(),
        off60: readInt()
      })
    }
    for (let i = 0; i < model.numGroups; i++) {
      model.polygonGroups.push({
        polygonType: readInt(),
        offsetPolyIndex: readInt(),
        numPolysInGroup: readInt(),
        offsetVertexIndex: readInt(),
        numVerticesInGroup: readInt(),
        offsetEdgeIndex: readInt(),
        unknowns: [readInt(), readInt(), readInt(), readInt(), readInt()],
        offsetTextureCoordinateIndex: readInt(),
        isTextureUsed: readInt(),
        textureIndex: readInt()
      })
    }
    const unknown = readInt() // unknown
    // if (unknown > 0x00) console.log('p unknown', unknown)
    model.boundingBox = {
      max: { x: readFloat(), y: readFloat(), z: readFloat() },
      min: { x: readFloat(), y: readFloat(), z: readFloat() }
    }
    // console.log('boundingBox', model.boundingBox)
    // Normal Index Table
    for (let i = 0; i < model.numNormalIndices; i++) {
      // console.log('model.numNormalIndices', model.numNormalIndices, i, offset)
      if (offset + 4 <= buffer.length) {
        // Issue with cvba, runs out of buffer
        readInt() // vertex v uses normal n
      }
    }
    if (offset !== fileSizeBytes) {
      console.log('WARNING: Did not reach end of file data!')
    }
    // console.log('p model', pBaseFilename)// model)
    return model
  }
}
