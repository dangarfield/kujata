const fs = require('fs-extra')
const path = require('path')
const { FF7BinaryDataReader } = require('./ff7-binary-data-reader.js')
const LzsDecompressor = require('../tools/lzs/lzs-decompressor.js')

const generateWorldMapTransitionData = async config => {
  const buffer = fs.readFileSync(
    path.join(config.unlgpDirectory, 'world_us.lgp', 'field.tbl')
  )
  const r = new FF7BinaryDataReader(buffer)
  const totalLocations = r.length / 24

  const locations = {}
  for (let i = 0; i < totalLocations; i++) {
    const wmFieldReference = `wm${i}`
    locations[wmFieldReference] = { wmFieldReference }
    const sections = ['sectionA', 'sectionB']
    sections.forEach(sectionType => {
      locations[wmFieldReference][sectionType] = {
        x: r.readShort(),
        y: r.readShort(),
        triangleId: r.readShort(),
        fieldId: r.readUShort(),
        direction: r.readUByte(), // 9-12 all the same
        direction2: r.readUByte(),
        direction3: r.readUByte(),
        direction4: r.readUByte()
      }
      delete locations[wmFieldReference][sectionType].direction2
      delete locations[wmFieldReference][sectionType].direction3
      delete locations[wmFieldReference][sectionType].direction4
    })
  }

  const fieldTblJsonPath = path.join(
    config.kujataDataDirectory,
    'data',
    'world',
    'world_us.lgp',
    'field.tbl.json'
  )
  fs.ensureDirSync(path.dirname(fieldTblJsonPath))
  fs.writeFileSync(fieldTblJsonPath, JSON.stringify(locations, null, 2))
}

const generateWorldMaps = async config => {
  // Define world map configurations
  const worldMaps = [
    {
      name: 'wm0',
      filename: 'WM0.MAP',
      gridSize: { width: 9, height: 7 }, // 9x7 = 63 blocks
      hasReplacements: true,
      replacements: {
        63: 50, 64: 41, 65: 42, 66: 60, 67: 47, 68: 48
      }
    },
    {
      name: 'wm2',
      filename: 'WM2.MAP',
      gridSize: { width: 3, height: 4 }, // 3x4 = 12 blocks
      hasReplacements: false,
      replacements: {}
    },
    {
      name: 'wm3',
      filename: 'WM3.MAP',
      gridSize: { width: 2, height: 2 }, // 2x2 = 4 blocks
      hasReplacements: false,
      replacements: {}
    }
  ]

  // Process each world map
  for (const worldMapConfig of worldMaps) {
    await processWorldMap(config, worldMapConfig)
  }
}

const processWorldMap = async (config, worldMapConfig) => {
  // Initialize decompressor and validate file path
  const wmMapPath = path.join(config.ff7InstallDirectory, 'data', 'wm', worldMapConfig.filename)

  if (!fs.existsSync(wmMapPath)) {
    console.error(`${worldMapConfig.filename} file not found at: ${wmMapPath}`)
    return
  }

  // Read and initialize world map data
  const buffer = fs.readFileSync(wmMapPath)
  const reader = new FF7BinaryDataReader(buffer)
  const BLOCK_SIZE = 0xB800
  const blockCount = Math.floor(buffer.length / BLOCK_SIZE)

  // Create output directories for GLTF files
  const worldDataDir = path.join(config.kujataDataDirectory, 'data', 'world')
  const worldGltfDir = path.join(worldDataDir, 'world_us.lgp')
  fs.ensureDirSync(worldDataDir)
  fs.ensureDirSync(worldGltfDir)

  const worldMapData = {
    metadata: {
      mapName: worldMapConfig.name,
      filePath: wmMapPath,
      fileSize: buffer.length,
      blockSize: BLOCK_SIZE,
      blockCount,
      gridSize: worldMapConfig.gridSize,
      hasReplacements: worldMapConfig.hasReplacements
    },
    blocks: []
  }

  // Process each world map block
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    // if (blockIndex !== 10) continue
    const block = processWorldMapBlock(buffer, reader, blockIndex, BLOCK_SIZE, worldMapConfig.name)
    worldMapData.blocks.push(block)

    // Generate GLTF for this block
    await generateBlockGltf(config, block, worldGltfDir, worldMapConfig.name)
  }

  // Generate metadata file
  generateWorldMapMetadata(config, worldMapData, worldMapConfig.name)

  // Extract world map textures (only once for all maps)
  if (worldMapConfig.name === 'wm0') {
    await extractWorldMapTextures(config)
  }
}

const processWorldMapBlock = (buffer, reader, blockIndex, blockSize, worldMapName = 'wm0') => {
  // Read mesh offset table for this block
  reader.offset = blockIndex * blockSize
  const meshOffsets = reader.readIntArray(16)
  const meshes = []

  // Process each mesh in the block
  for (let meshIndex = 0; meshIndex < meshOffsets.length; meshIndex++) {
    const meshOffset = meshOffsets[meshIndex]

    if (meshOffset === 0) {
      continue // Skip empty mesh slots
    }

    // try {
    const mesh = extractMeshFromBlock(buffer, reader, blockIndex, blockSize, meshIndex, meshOffset)
    meshes.push(mesh)
    // } catch (error) {
    //   console.error(`Error processing mesh ${meshIndex} in block ${blockIndex}:`, error.message)
    //   meshes.push({
    //     meshIndex,
    //     offset: meshOffset,
    //     error: error.message
    //   })
    // }
  }

  // Extract unique texture IDs from all triangles in all meshes
  const uniqueTextureIds = new Set()
  for (const mesh of meshes) {
    if (mesh.triangles) {
      for (const triangle of mesh.triangles) {
        if (triangle.texture !== undefined && triangle.texture !== null) {
          uniqueTextureIds.add(triangle.texture)
        }
      }
    }
  }

  const texturesList = Array.from(uniqueTextureIds).sort((a, b) => a - b)

  // Create corresponding array of texture names from the IDs
  const textureIdToName = getTextureIdToNameMapping(worldMapName)
  const textureListNames = texturesList.map(textureId => {
    const textureInfo = textureIdToName[textureId]
    return textureInfo ? textureInfo.name : `unknown_${textureId}`
  })
  return {
    blockIndex,
    meshOffsets,
    meshCount: meshes.length,
    meshes,
    texturesList,
    textureListNames
  }
}

const extractMeshFromBlock = (buffer, reader, blockIndex, blockSize, meshIndex, meshOffset) => {
  // Calculate mesh data positions
  const baseOffset = blockIndex * blockSize
  const meshDataLengthOffset = baseOffset + meshOffset

  // Read compressed mesh data
  reader.offset = meshDataLengthOffset
  const meshDataLength = reader.readInt()
  const compressedData = buffer.subarray(meshDataLengthOffset, meshDataLengthOffset + 4 + meshDataLength)

  // Decompress and process mesh
  const lzsDecompressor = new LzsDecompressor()
  const decompressedData = lzsDecompressor.decompress(compressedData)

  const meshData = processMesh(decompressedData)

  return {
    meshIndex,
    offset: meshOffset,
    compressedSize: meshDataLength,
    decompressedSize: decompressedData.length,
    ...meshData
  }
}

const processMesh = (buffer) => {
  const r = new FF7BinaryDataReader(buffer)
  const noTriangles = r.readShort()
  const noVertices = r.readShort()

  const triangles = []
  const vertices = []
  const normals = []

  // Read triangle data
  for (let i = 0; i < noTriangles; i++) {
    const vertex0Index = r.readUByte() // Index of vertex 0 of triangle t
    const vertex1Index = r.readUByte() // Index of vertex 1 of triangle t
    const vertex2Index = r.readUByte() // Index of vertex 2 of triangle t

    const walkmapAndUnknown = r.readUByte() // 5 bits walkmap + 3 bits unknown
    const walkmapStatus = walkmapAndUnknown & 0x1F // Lower 5 bits
    const unknown = (walkmapAndUnknown >> 5) & 0x07 // Upper 3 bits

    // Texture coordinates for each vertex
    const u0 = r.readUByte() // Coordinate u in texture for vertex 0
    const v0 = r.readUByte() // Coordinate v in texture for vertex 0
    const u1 = r.readUByte() // Coordinate u in texture for vertex 1
    const v1 = r.readUByte() // Coordinate v in texture for vertex 1
    const u2 = r.readUByte() // Coordinate u in texture for vertex 2
    const v2 = r.readUByte() // Coordinate v in texture for vertex 2

    const textureAndLocation = r.readUShort() // 9 bits texture + 7 bits location
    const texture = textureAndLocation & 0x1FF // Lower 9 bits
    const location = (textureAndLocation >> 9) & 0x7F // Upper 7 bits

    triangles.push({
      vertices: [vertex0Index, vertex1Index, vertex2Index],
      walkmapStatus,
      unknown,
      textureCoords: [
        { u: u0, v: v0 },
        { u: u1, v: v1 },
        { u: u2, v: v2 }
      ],
      texture,
      location,
      walkmapType: getWalkmapTypeName(walkmapStatus)
    })
  }

  // Read vertex data
  for (let i = 0; i < noVertices; i++) {
    const x = r.readShort() // Coordinate x of vertex v (signed)
    const y = r.readShort() // Coordinate y of vertex v (signed)
    const z = r.readShort() // Coordinate z of vertex v (signed)
    const w = r.readShort() // Unknown coordinate w (never used in PC version)

    vertices.push({
      x,
      y,
      z,
      w // Keep for completeness even though unused
    })
  }

  // Read normal data
  for (let i = 0; i < noVertices; i++) {
    const x = r.readShort() // Coordinate x of normal for vertex v
    const y = r.readShort() // Coordinate y of normal for vertex v
    const z = r.readShort() // Coordinate z of normal for vertex v
    const w = r.readShort() // Unknown coordinate w (always 0)

    normals.push({
      x,
      y,
      z,
      w
    })
  }

  return {
    triangleCount: noTriangles,
    vertexCount: noVertices,
    triangles,
    vertices,
    normals
  }
}

// Helper function to get walkmap type name from code
const getWalkmapTypeName = (code) => {
  const walkmapTypes = {
    0: 'Grass',
    1: 'Forest',
    2: 'Mountain',
    3: 'Sea',
    4: 'River Crossing',
    5: 'River',
    6: 'Water',
    7: 'Swamp',
    8: 'Desert',
    9: 'Wasteland',
    10: 'Snow',
    11: 'Riverside',
    12: 'Cliff',
    13: 'Corel Bridge',
    14: 'Wutai Bridge',
    15: 'Unused',
    16: 'Hill side',
    17: 'Beach',
    18: 'Sub Pen',
    19: 'Canyon',
    20: 'Mountain Pass',
    21: 'Unknown',
    22: 'Waterfall',
    23: 'Unused',
    24: 'Gold Saucer Desert',
    25: 'Jungle',
    26: 'Sea (2)',
    27: 'Northern Cave',
    28: 'Gold Saucer Desert Border',
    29: 'Bridgehead',
    30: 'Back Entrance',
    31: 'Unused'
  }

  return walkmapTypes[code] || `Unknown (${code})`
}

const generateBlockGltf = async (config, block, outputDir, worldMapName = 'wm0') => {
  const blockIndex = block.blockIndex
  const gltfFilename = `${worldMapName}-block_${blockIndex}.gltf`
  const binFilename = `${worldMapName}-block_${blockIndex}.bin`

  // Combine all meshes in the block into a single GLTF
  const combinedMeshData = combineMeshesForGltf(block.meshes, worldMapName)

  if (combinedMeshData.vertices.length === 0) {
    return
  }

  // Create GLTF structure with texture support
  const gltf = createGltfStructureWithTextures(blockIndex, combinedMeshData)

  // Create binary buffer including texture coordinates
  const binaryData = createGltfBinaryDataWithTextures(combinedMeshData, gltf)

  // Update buffer references in GLTF
  updateGltfBufferReferences(gltf, binaryData, binFilename)

  // Add texture references to GLTF
  try {
    addTextureReferencesToGltf(gltf, combinedMeshData, config, worldMapName)
  } catch (error) {
    console.error('Error in addTextureReferencesToGltf:', error.message)
  }

  // Write files
  const gltfPath = path.join(outputDir, gltfFilename)
  const binPath = path.join(outputDir, binFilename)

  fs.writeFileSync(gltfPath, JSON.stringify(gltf, null, 2))
  fs.writeFileSync(binPath, binaryData.combinedBuffer)
}

const combineMeshesForGltf = (meshes, worldMapName = 'wm0') => {
  const vertices = []
  const normals = []
  const textureCoords = []
  const indices = []
  const materials = []
  let vertexOffset = 0

  // Define mesh size for positioning in 4x4 grid
  const MESH_SIZE = 8192

  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex++) {
    const mesh = meshes[meshIndex]

    if (mesh.error || !mesh.vertices || !mesh.triangles) {
      continue // Skip invalid meshes
    }

    // Calculate mesh position in 4x4 grid
    const meshRow = Math.floor(meshIndex / 4)
    const meshCol = meshIndex % 4
    const offsetX = meshCol * MESH_SIZE
    const offsetZ = meshRow * MESH_SIZE

    // Process triangles and create unique vertices for each (no vertex sharing)
    for (const triangle of mesh.triangles) {
      // Get texture info for UV conversion
      const textureIdToName = getTextureIdToNameMapping(worldMapName)
      const textureInfo = textureIdToName[triangle.texture]

      if (!textureInfo) {
        console.warn(`Unknown texture ID: ${triangle.texture}, using default UV coordinates`)
      }

      // Get texture dimensions and offsets (fallback to default values if texture not found)
      const textureWidth = textureInfo ? textureInfo.width : 64
      const textureHeight = textureInfo ? textureInfo.height : 64
      const uOffset = textureInfo ? textureInfo.uOffset : 0
      const vOffset = textureInfo ? textureInfo.vOffset : 0

      // Convert UV coordinates using proper FF7 UV calculation
      const calcUV = (value, offset, dimension) => {
        if (value + offset === dimension) return value - 1
        if (offset > value) {
          offset = offset % dimension
        }
        return Math.abs((value - offset) % dimension)
      }

      const convertUV = (u, v) => {
        const adjustedU = calcUV(u, uOffset, textureWidth)
        const adjustedV = calcUV(v, vOffset, textureHeight)
        return {
          u: adjustedU / textureWidth,
          v: adjustedV / textureHeight
        }
      }

      const texCoord0 = triangle.textureCoords[0]
      const texCoord1 = triangle.textureCoords[2] // Swapped to match vertex order
      const texCoord2 = triangle.textureCoords[1] // Swapped to match vertex order

      const uv0 = convertUV(texCoord0.u, texCoord0.v)
      const uv1 = convertUV(texCoord1.u, texCoord1.v)
      const uv2 = convertUV(texCoord2.u, texCoord2.v)

      // Get triangle vertices and normals (with swapped order for correct winding)
      const triangleVertices = [
        mesh.vertices[triangle.vertices[0]],
        mesh.vertices[triangle.vertices[2]], // Swapped to match UV order
        mesh.vertices[triangle.vertices[1]] // Swapped to match UV order
      ]

      const triangleNormals = [
        mesh.normals[triangle.vertices[0]] || { x: 0, y: 1, z: 0 },
        mesh.normals[triangle.vertices[2]] || { x: 0, y: 1, z: 0 }, // Swapped
        mesh.normals[triangle.vertices[1]] || { x: 0, y: 1, z: 0 } // Swapped
      ]

      const triangleUVs = [uv0, uv1, uv2]

      // Create unique vertices for this triangle
      const newVertexIndices = []
      for (let i = 0; i < 3; i++) {
        const vertex = triangleVertices[i]
        const normal = triangleNormals[i]
        const uv = triangleUVs[i]

        // Add vertex position with mesh offset
        vertices.push(
          vertex.x + offsetX, // X position with column offset
          vertex.y, // Y position (height) unchanged
          vertex.z + offsetZ // Z position with row offset
        )

        // Convert and normalize normals
        const normalScale = 1.0 / 32767.0
        let nx = normal.x * normalScale
        let ny = normal.y * normalScale
        let nz = normal.z * normalScale

        // Calculate magnitude and normalize to unit length
        const magnitude = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (magnitude > 0) {
          nx /= magnitude
          ny /= magnitude
          nz /= magnitude
        } else {
          // Fallback to up vector if normal is zero
          nx = 0
          ny = 1
          nz = 0
        }

        normals.push(nx, ny, nz)

        // Add texture coordinates for this vertex
        textureCoords.push(uv.u, uv.v)

        // Store the new vertex index
        newVertexIndices.push(vertexOffset)
        vertexOffset++
      }

      // Add triangle indices (no need to reverse winding since we already swapped vertices)
      indices.push(newVertexIndices[0], newVertexIndices[1], newVertexIndices[2])

      // Store material info for this triangle
      materials.push({
        texture: triangle.texture,
        walkmapType: triangle.walkmapType,
        location: triangle.location,
        textureCoords: triangle.textureCoords
      })
    }
  }

  return {
    vertices,
    normals,
    textureCoords,
    indices,
    materials,
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3
  }
}
const createGltfStructureWithTextures = (blockIndex, meshData) => {
  const {
    COMPONENT_TYPE,
    ARRAY_BUFFER,
    PRIMITIVE_MODE,
    FILTER,
    WRAPPING_MODE
  } = require('../ff7-gltf/gltf-2.0-util.js')

  // Group triangles by texture to create separate primitives
  const textureGroups = {}
  const uniqueTextures = [...new Set(meshData.materials.map(m => m.texture))]

  // Initialize texture groups
  uniqueTextures.forEach(textureId => {
    textureGroups[textureId] = {
      indices: [],
      triangleCount: 0
    }
  })

  // Group indices by texture
  for (let i = 0; i < meshData.materials.length; i++) {
    const material = meshData.materials[i]
    const textureId = material.texture
    const baseIndex = i * 3 // Each triangle has 3 indices

    textureGroups[textureId].indices.push(
      meshData.indices[baseIndex],
      meshData.indices[baseIndex + 1],
      meshData.indices[baseIndex + 2]
    )
    textureGroups[textureId].triangleCount++
  }

  // Create primitives for each texture group
  const primitives = []
  let accessorIndex = 3 // Start after POSITION(0), NORMAL(1), TEXCOORD_0(2)

  uniqueTextures.forEach((textureId, materialIndex) => {
    const group = textureGroups[textureId]
    if (group.indices.length > 0) {
      primitives.push({
        attributes: {
          POSITION: 0,
          NORMAL: 1,
          TEXCOORD_0: 2
        },
        indices: accessorIndex,
        mode: PRIMITIVE_MODE.TRIANGLES,
        material: materialIndex
      })
      accessorIndex++
    }
  })

  return {
    asset: {
      version: '2.0',
      generator: 'kujata-world-extractor'
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{
      name: `WorldBlock_${blockIndex}`,
      mesh: 0
    }],
    meshes: [{
      name: `WorldBlockMesh_${blockIndex}`,
      primitives
    }],
    materials: [], // Will be populated by addTextureReferencesToGltf
    textures: [],
    images: [],
    samplers: [{
      magFilter: FILTER.LINEAR,
      minFilter: FILTER.LINEAR,
      wrapS: WRAPPING_MODE.REPEAT,
      wrapT: WRAPPING_MODE.REPEAT
    }],
    accessors: [
      // Accessor 0: Vertex positions
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: COMPONENT_TYPE.FLOAT,
        count: meshData.vertexCount,
        type: 'VEC3'
      },
      // Accessor 1: Normals
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: COMPONENT_TYPE.FLOAT,
        count: meshData.vertexCount,
        type: 'VEC3'
      },
      // Accessor 2: Texture coordinates
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: COMPONENT_TYPE.FLOAT,
        count: meshData.vertexCount,
        type: 'VEC2'
      }
      // Additional accessors for indices will be added dynamically
    ],
    bufferViews: [
      // BufferView 0: Vertex positions
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: meshData.vertices.length * 4,
        target: ARRAY_BUFFER
      },
      // BufferView 1: Normals
      {
        buffer: 0,
        byteOffset: meshData.vertices.length * 4,
        byteLength: meshData.normals.length * 4,
        target: ARRAY_BUFFER
      },
      // BufferView 2: Texture coordinates
      {
        buffer: 0,
        byteOffset: meshData.vertices.length * 4 + meshData.normals.length * 4,
        byteLength: meshData.textureCoords.length * 4,
        target: ARRAY_BUFFER
      }
      // Additional buffer views for indices will be added dynamically
    ],
    buffers: [{}], // Will be filled in updateGltfBufferReferences
    textureGroups // Store for use in buffer creation
  }
}

const createGltfBinaryDataWithTextures = (meshData, gltf) => {
  // Create buffers for vertex data
  const vertexBuffer = Buffer.alloc(meshData.vertices.length * 4)
  const normalBuffer = Buffer.alloc(meshData.normals.length * 4)
  const texCoordBuffer = Buffer.alloc(meshData.textureCoords.length * 4)

  // Write vertex data
  for (let i = 0; i < meshData.vertices.length; i++) {
    vertexBuffer.writeFloatLE(meshData.vertices[i], i * 4)
  }

  // Write normal data
  for (let i = 0; i < meshData.normals.length; i++) {
    normalBuffer.writeFloatLE(meshData.normals[i], i * 4)
  }

  // Write texture coordinate data
  for (let i = 0; i < meshData.textureCoords.length; i++) {
    texCoordBuffer.writeFloatLE(meshData.textureCoords[i], i * 4)
  }

  // Create separate index buffers for each texture group
  const indexBuffers = []
  const textureGroups = gltf.textureGroups
  // IMPORTANT: Use the same order as primitive creation, not Object.keys()
  const uniqueTextures = [...new Set(meshData.materials.map(m => m.texture))]

  uniqueTextures.forEach((textureId, index) => {
    const group = textureGroups[textureId]
    if (group && group.indices.length > 0) {
      const indexBuffer = Buffer.alloc(group.indices.length * 2)
      for (let i = 0; i < group.indices.length; i++) {
        indexBuffer.writeUInt16LE(group.indices[i], i * 2)
      }
      indexBuffers.push(indexBuffer)
    }
  })

  // Combine all buffers
  const combinedBuffer = Buffer.concat([vertexBuffer, normalBuffer, texCoordBuffer, ...indexBuffers])

  return {
    vertexBuffer,
    normalBuffer,
    texCoordBuffer,
    indexBuffers,
    combinedBuffer,
    textureGroups,
    uniqueTextures // Pass this along for consistent ordering
  }
}

const addTextureReferencesToGltf = (gltf, meshData, config, worldMapName = 'wm0') => {
  // Get unique textures used in this block
  const uniqueTextures = [...new Set(meshData.materials.map(m => m.texture))]

  // Get texture mapping
  const textureIdToName = getTextureIdToNameMapping(worldMapName)

  // Clear existing arrays (they should be empty from createGltfStructureWithTextures)
  gltf.textures = []
  gltf.images = []
  gltf.materials = []

  // Create textures, images, and materials for each unique texture
  uniqueTextures.forEach((textureId, index) => {
    const textureInfo = textureIdToName[textureId]
    const textureName = textureInfo ? textureInfo.name : `unknown_${textureId}`
    const textureUri = `textures/${textureName}_1.png`

    // Add image
    gltf.images.push({
      uri: textureUri,
      name: textureName
    })

    // Add texture
    gltf.textures.push({
      source: index,
      sampler: 0,
      name: `${textureName}_texture`
    })

    // Add material
    gltf.materials.push({
      name: `WorldBlockMaterial_${textureName}`,
      pbrMetallicRoughness: {
        baseColorFactor: [1.0, 1.0, 1.0, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.8,
        baseColorTexture: {
          index,
          texCoord: 0
        }
      },
      // Add transparency support for black pixels (like ff7-landscaper)
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
      doubleSided: true
    })
  })
}

const getTextureIdToNameMapping = (worldMapName = 'wm0') => {
  // Load the texture mapping from the metadata file
  const mapData = require('../metadata-src/world-map/map-data.js')

  // Select the appropriate texture array based on world map type
  let textureArray
  switch (worldMapName) {
    case 'wm0':
      textureArray = mapData.WORLD_MAP_OVERWORLD_TEXTURES
      break
    case 'wm2':
      textureArray = mapData.WORLD_MAP_UNDERWATER_TEXTURES
      break
    case 'wm3':
      textureArray = mapData.WORLD_MAP_GLACIER_TEXTURES
      break
    default:
      textureArray = mapData.WORLD_MAP_OVERWORLD_TEXTURES
  }

  // Convert array to ID-indexed object for lookup
  const textureData = {}
  textureArray.forEach(texture => {
    textureData[texture.id] = {
      name: texture.name,
      width: texture.width,
      height: texture.height,
      uOffset: texture.uOffset,
      vOffset: texture.vOffset
    }
  })

  return textureData
}

const updateGltfBufferReferences = (gltf, binaryData, binFilename) => {
  const { COMPONENT_TYPE, ELEMENT_ARRAY_BUFFER } = require('../ff7-gltf/gltf-2.0-util.js')

  // Update buffer reference
  gltf.buffers[0] = {
    byteLength: binaryData.combinedBuffer.length,
    uri: binFilename
  }

  // Calculate and set min/max bounds for position accessor
  const vertices = []
  for (let i = 0; i < binaryData.vertexBuffer.length; i += 12) { // 3 floats * 4 bytes
    vertices.push([
      binaryData.vertexBuffer.readFloatLE(i),
      binaryData.vertexBuffer.readFloatLE(i + 4),
      binaryData.vertexBuffer.readFloatLE(i + 8)
    ])
  }

  if (vertices.length > 0) {
    const min = [
      Math.min(...vertices.map(v => v[0])),
      Math.min(...vertices.map(v => v[1])),
      Math.min(...vertices.map(v => v[2]))
    ]
    const max = [
      Math.max(...vertices.map(v => v[0])),
      Math.max(...vertices.map(v => v[1])),
      Math.max(...vertices.map(v => v[2]))
    ]

    gltf.accessors[0].min = min
    gltf.accessors[0].max = max
  }

  // Add accessors and buffer views for each texture group's indices
  const textureGroups = binaryData.textureGroups
  // Use the same order as was used in index buffer creation
  const uniqueTextures = binaryData.uniqueTextures
  let currentByteOffset = binaryData.vertexBuffer.length + binaryData.normalBuffer.length + binaryData.texCoordBuffer.length

  uniqueTextures.forEach((textureId, index) => {
    const group = textureGroups[textureId]
    if (group && group.indices.length > 0) {
      const indexBuffer = binaryData.indexBuffers[index]

      // Add buffer view for this texture's indices
      gltf.bufferViews.push({
        buffer: 0,
        byteOffset: currentByteOffset,
        byteLength: indexBuffer.length,
        target: ELEMENT_ARRAY_BUFFER
      })

      // Add accessor for this texture's indices
      gltf.accessors.push({
        bufferView: gltf.bufferViews.length - 1,
        byteOffset: 0,
        componentType: COMPONENT_TYPE.UNSIGNED_SHORT,
        count: group.indices.length,
        type: 'SCALAR'
      })

      currentByteOffset += indexBuffer.length
    }
  })

  // Clean up temporary data
  delete gltf.textureGroups
}

const generateWorldMapMetadata = (config, worldMapData, worldMapName = 'wm0') => {
  // Grid configuration for each world map
  const gridConfig = {
    wm0: { cols: 9, rows: 7 }, // 9x7 = 63 blocks
    wm2: { cols: 3, rows: 4 }, // 3x4 = 12 blocks
    wm3: { cols: 2, rows: 2 } // 2x2 = 4 blocks
  }

  const currentGrid = gridConfig[worldMapName]
  if (!currentGrid) {
    console.error(`Unknown world map: ${worldMapName}`)
    return
  }

  const GRID_COLS = currentGrid.cols
  const GRID_ROWS = currentGrid.rows

  const COORD_MULTIPLIER = 8192 * 4

  // Create block coordinate mapping
  const blockCoordinates = {}
  const blockInfo = {}

  // Calculate the number of regular blocks (excluding story replacements for wm0)
  const totalBlocks = worldMapData.metadata.blockCount
  const regularBlocks = worldMapName === 'wm0' ? 63 : totalBlocks // wm0 has 63 regular + 6 story blocks

  // Map regular blocks in grid arrangement
  for (let blockId = 0; blockId < regularBlocks; blockId++) {
    const row = Math.floor(blockId / GRID_COLS)
    const col = blockId % GRID_COLS

    blockCoordinates[blockId] = {
      x: col * COORD_MULTIPLIER,
      y: row * COORD_MULTIPLIER,
      gridPosition: { row, col },
      isDefault: true,
      isStoryReplacement: false
    }

    blockInfo[blockId] = {
      blockId,
      filename: `${worldMapName}-block_${blockId}`,
      description: `World map block at grid position (${row}, ${col})`,
      meshCount: worldMapData.blocks[blockId]?.meshCount || 0,
      isProcessed: blockId < worldMapData.blocks.length
    }
  }

  // Story replacement blocks (only for wm0)
  let storyReplacements = []
  if (worldMapName === 'wm0') {
    storyReplacements = [
      { replacementId: 63, originalId: 50, storyEvent: 'Huge Materia - North Corel' },
      { replacementId: 64, originalId: 41, storyEvent: 'Huge Materia - Fort Condor' },
      { replacementId: 65, originalId: 42, storyEvent: 'Huge Materia - Underwater Reactor' },
      { replacementId: 66, originalId: 60, storyEvent: 'Meteor Impact - Midgar Area' },
      { replacementId: 67, originalId: 47, storyEvent: 'Diamond Weapon - Midgar Approach' },
      { replacementId: 68, originalId: 48, storyEvent: 'Ultimate Weapon - Crater Formation' }
    ]

    // Add story replacement blocks
    storyReplacements.forEach(replacement => {
      const originalBlock = blockCoordinates[replacement.originalId]

      blockCoordinates[replacement.replacementId] = {
        x: originalBlock.x,
        y: originalBlock.y,
        gridPosition: originalBlock.gridPosition,
        isDefault: false,
        isStoryReplacement: true,
        replacesBlockId: replacement.originalId,
        storyEvent: replacement.storyEvent
      }

      blockInfo[replacement.replacementId] = {
        blockId: replacement.replacementId,
        filename: `world_block_${replacement.replacementId}`,
        description: `Story replacement block: ${replacement.storyEvent}`,
        replacesBlock: replacement.originalId,
        meshCount: worldMapData.blocks[replacement.replacementId]?.meshCount || 0,
        isProcessed: replacement.replacementId < worldMapData.blocks.length,
        storyContext: {
          event: replacement.storyEvent,
          gamePhase: getGamePhaseForStoryEvent(replacement.storyEvent),
          notes: `This block replaces block ${replacement.originalId} during specific story events`
        }
      }

      // Update original block info to indicate it has a story replacement
      if (blockInfo[replacement.originalId]) {
        blockInfo[replacement.originalId].hasStoryReplacement = true
        blockInfo[replacement.originalId].replacedByBlockId = replacement.replacementId
        blockInfo[replacement.originalId].storyEvent = replacement.storyEvent
      }
    })
  }

  // Create comprehensive metadata
  const metadata = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    description: 'Final Fantasy VII World Map Block Metadata',

    worldMapLayout: {
      gridSize: {
        rows: GRID_ROWS,
        cols: GRID_COLS,
        totalBlocks: GRID_ROWS * GRID_COLS
      },
      coordinateSystem: {
        multiplier: COORD_MULTIPLIER,
        description: 'Block coordinates are multiplied by 8192 for world positioning',
        origin: 'Top-left corner (0,0) represents the northwest corner of the world map'
      }
    },

    blockTypes: {
      default: {
        range: `0-${regularBlocks - 1}`,
        count: regularBlocks,
        description: `Standard ${worldMapName} world map blocks always present`
      },
      ...(worldMapName === 'wm0'
        ? {
            storyReplacements: {
              range: '63-68',
              count: 6,
              description: 'Story-dependent blocks that replace default blocks during specific game events'
            }
          }
        : {})
    },

    storyReplacements: storyReplacements.reduce((acc, replacement) => {
      acc[replacement.replacementId] = {
        replacementBlockId: replacement.replacementId,
        originalBlockId: replacement.originalId,
        storyEvent: replacement.storyEvent,
        gamePhase: getGamePhaseForStoryEvent(replacement.storyEvent),
        coordinates: blockCoordinates[replacement.replacementId],
        usage: 'TODO: Add specific usage conditions and triggers'
      }
      return acc
    }, {}),

    blockCoordinates,
    blockInfo,

    processingInfo: {
      totalBlocksInFile: worldMapData.metadata.blockCount,
      blocksProcessed: worldMapData.blocks.length,
      fileSize: worldMapData.metadata.fileSize,
      blockSize: worldMapData.metadata.blockSize
    }
  }

  // Save metadata file
  const metadataPath = path.join(
    config.kujataDataDirectory,
    'metadata',
    'world',
    `${worldMapName}-map.json`
  )

  fs.ensureDirSync(path.dirname(metadataPath))
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}

const getGamePhaseForStoryEvent = (storyEvent) => {
  const phaseMap = {
    'Huge Materia - North Corel': 'Disc 2 - Huge Materia Quest',
    'Huge Materia - Fort Condor': 'Disc 2 - Huge Materia Quest',
    'Huge Materia - Underwater Reactor': 'Disc 2 - Huge Materia Quest',
    'Meteor Impact - Midgar Area': 'Disc 3 - Post Meteor Summon',
    'Diamond Weapon - Midgar Approach': 'Disc 3 - Weapon Attacks',
    'Ultimate Weapon - Crater Formation': 'Disc 3 - Northern Cave Events'
  }

  return phaseMap[storyEvent] || 'Unknown Phase'
}

const extractWorldMapTextures = async (config) => {
  const { TexFile } = require('./tex-file.js')

  const sourceDir = path.join(config.unlgpDirectory, 'world_us.lgp')
  const outputDir = path.join(config.kujataDataDirectory, 'data', 'world', 'world_us.lgp', 'textures')

  // Ensure output directory exists
  fs.ensureDirSync(outputDir)

  // Read all .tex files from the source directory
  const texFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.tex'))

  for (const texFile of texFiles) {
    const textureName = texFile.replace('.tex', '')
    const texFilePath = path.join(sourceDir, texFile)
    const outputPath = path.join(outputDir, `${textureName}.png`)

    // Skip if PNG already exists (optional - remove this check to always regenerate)
    if (fs.existsSync(outputPath)) {
      continue
    }

    try {
      const texFileLoader = new TexFile()
      texFileLoader.loadTexFileFromPath(texFilePath)
      await texFileLoader.saveAllPalettesAsPngs(outputPath)
    } catch (error) {
      console.error(`  Error extracting ${texFile}:`, error.message)
    }
  }
}

module.exports = {
  generateWorldMapTransitionData,
  generateWorldMaps,
  getTextureIdToNameMapping
}
