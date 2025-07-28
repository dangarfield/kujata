const stringUtil = require('./string-util.js')
const sharp = require('sharp')
const fs = require('fs')
const { timeEnd } = require('console')

/*
A layer is split out for every unique combination of:
- Layer ID
- Z index (eg distance from camera for occlusion culling)
- Param (eg moveable effect group)
- State (eg moveable effect layer)
- transType (eg blending mode)

This is not the required format for palmer etc, but it does provide ALL possible layers
with depths and configurations for graphic artists and developers etc

Problems still to resolve:
- Layer 0 - COMPLETE
- Layer 1 - COMPLETE apart from typeTrans=2 doesn't seem to display perfectly
- Layer 2 - COMPLETE, eg woa_3
- Layer 3 - COMPLETE, eg anfrst_1

- Extra blank spaces - elevtr1, eleout
*/

const COEFF_COLOR = 255 / 31 // eg translate 5 bit color to 8 bit
const getColorForPalette = bytes => {
  // abbbbbgggggrrrrr
  const color = {
    r: Math.round((bytes & 31) * COEFF_COLOR),
    g: Math.round(((bytes >> 5) & 31) * COEFF_COLOR),
    b: Math.round(((bytes >> 10) & 31) * COEFF_COLOR),
    isZero: bytes === 0,
    m: ((bytes >> 15) & 1) === 1 ? 0 : 255
  }
  color.a = 255 // color.r === 0 && color.g === 0 && color.b === 0 ? 0 : 255
  color.hex = `${stringUtil.toHex2(color.r)}${stringUtil.toHex2(
    color.g
  )}${stringUtil.toHex2(color.b)}`
  // console.log('color', bytes, color)
  return color
}
const getColorForDirect = bytes => {
  // rrrrrgggggabbbbb
  const color = {
    r: Math.round(((bytes >> 11) & 31) * COEFF_COLOR),
    b: Math.round((bytes & 31) * COEFF_COLOR),
    g: Math.round(((bytes >> 6) & 31) * COEFF_COLOR),
    a: 255
  }
  color.hex = `${stringUtil.toHex2(color.r)}${stringUtil.toHex2(
    color.g
  )}${stringUtil.toHex2(color.b)}`
  // console.log('color', bytes, color)
  return color
}

const allTiles = flevel => {
  let tiles = []
  const layerNames = Object.keys(flevel.background.tiles)
  for (let i = 0; i < layerNames.length; i++) {
    const layerName = layerNames[i]
    tiles = tiles.concat(flevel.background.tiles[layerName].tiles)
  }
  return tiles
}

const sortBy = (p, a) => a.sort((i, j) => p.map(v => i[v] - j[v]).find(r => r))

const getSizeMetaData = tiles => {
  let minX = 0
  let maxX = 0
  let minY = 0
  let maxY = 0
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    // console.log(
    //   'tile',
    //   tile.id,
    //   tile.destinationX,
    //   tile.destinationY,
    //   '-',
    //   tile.sourceX,
    //   tile.sourceX2,
    //   ',',
    //   tile.sourceY,
    //   tile.sourceY2
    // )
    if (tile.destinationX < minX) {
      minX = tile.destinationX
    }
    // TODO: There is a strange tile.destinationX=10000 on layer0 tiles 640 & 641 in blinst_2. Need to investigate
    if (tile.destinationX > maxX && tile.destinationX < 10000) {
      maxX = tile.destinationX
    }
    if (tile.destinationY < minY) {
      minY = tile.destinationY
    }
    if (tile.destinationY > maxY) {
      maxY = tile.destinationY
    }
  }
  let tileSize = 16
  const tile = tiles[0]
  if (tile.layerID >= 2) {
    // Layer 2 & 3 can have 32 pixel tiles
    if (tile.width !== 16 && tile.height !== 16) {
      tileSize = 32
    }
  }
  const height = maxY - minY + tileSize
  const width = maxX - minX + tileSize
  // console.log('SIZE',
  //     'x', minX, maxX, '->', width,
  //     'y', minY, maxY, '->', height)

  const channels = 4
  return { minX, maxX, minY, maxY, height, width, channels }
}

// const blendColors = (baseCol, topColor, typeTrans) => {
//     switch (typeTrans) {
//         case 1:
//             return {
//                 r: Math.min(255, baseCol.r + topColor.r),
//                 g: Math.min(255, baseCol.g + topColor.g),
//                 b: Math.min(255, baseCol.b + topColor.b),
//                 a: 255
//             }
//         case 2:
//             return {
//                 r: Math.max(0, baseCol.r - topColor.r),
//                 g: Math.max(0, baseCol.g - topColor.g),
//                 b: Math.max(0, baseCol.b - topColor.b),
//                 a: 255
//             }
//         case 3:
//             return {
//                 r: Math.min(255, baseCol.r + (0.25 * topColor.r)),
//                 g: Math.min(255, baseCol.g + (0.25 * topColor.g)),
//                 b: Math.min(255, baseCol.b + (0.25 * topColor.b)),
//                 a: 255
//             }
//         default:
//             return {
//                 r: (baseCol.r + topColor.r) / 2,
//                 g: (baseCol.g + topColor.g) / 2,
//                 b: (baseCol.b + topColor.b) / 2,
//                 a: 255
//             }
//     }
// }

const computeShift = (tile, tileSize) => {
  if (tileSize !== tile.height || tileSize !== tile.width) return

  const layerKey = (tile.layerID === 0 || tile.layerID === 1) ? 1 : tile.layerID
  const shift = shiftData[layerKey]

  const computeAxis = (axis) => {
    const dest = tile[`destination${axis}`]
    if (shift[`${axis.toLowerCase()}Computed`] || dest === 0) return

    let value = dest < 0 ? tileSize - (-dest % tileSize) : dest % tileSize
    if (value === tileSize) value = 0

    shift[axis.toLowerCase()] = value
    shift[`${axis.toLowerCase()}Computed`] = true
  }
  computeAxis('X')
  computeAxis('Y')
}
const shiftData = {
  1: { x: 0, y: 0, xComputed: false, yComputed: false },
  2: { x: 0, y: 0, xComputed: false, yComputed: false },
  3: { x: 0, y: 0, xComputed: false, yComputed: false }
}

const saveTileGroupImage = (
  flevel,
  folder,
  name,
  tiles,
  sizeMeta,
  setBlackBackground
) => {
  // console.log('sizeMeta', name, JSON.stringify(sizeMeta))
  const n = sizeMeta.height * sizeMeta.width * sizeMeta.channels
  const data = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    data[i] = 0x00 // Fill with either black or transparent
    if (setBlackBackground && (i + 1) % sizeMeta.channels === 0) {
      data[i] = 0xff
    }
  }
  const pixelData = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    pixelData[i] = 0x00
  }

  for (let i = 0; i < tiles.length; i++) {
    // Loop through each tile
    const tile = tiles[i]
    const tileOverlayX = tile.destinationX - sizeMeta.minX // Get normalised coords for destination of top left of tile
    const tileOverlayY = tile.destinationY - sizeMeta.minY
    // if (
    //   !(
    //     (
    //       tile.destinationX === -2 * 16 &&
    //       tile.destinationY === 4 * 16 &&
    //       tile.param === 2 &&
    //       tile.state === 3
    //     )
    //     // (tile.destinationX === 4 * 16 || tile.destinationX === 5 * 16) &&
    //     // (tile.destinationY === 11 * 16 || tile.destinationY === 12 * 16) &&
    //     // !(tile.destinationX === 5 * 16 && tile.destinationY === 12 * 16) // &&
    //     //tile.state === 4
    //   )
    // )
    //   continue
    // if (tile.sourceXBig === 0) continue
    // if (
    //   tile.param === 16 &&
    //   tile.id === 0 &&
    //   tile.destinationX === 64 &&
    //   tile.destinationY === 11 * 16 &&
    //   (tile.state === 4 || tile.state === 5)
    // ) {
    //   console.log(
    //     name,
    //     'tile',
    //     tile.id,
    //     tile.layerID,
    //     tile.destinationX,
    //     tile.destinationY,
    //     '-',
    //     tile.state,
    //     tile
    //   )
    // }
    if (tile.destinationX < sizeMeta.minX) continue // Fix for elevtr1
    if (tile.destinationY < sizeMeta.minY) continue // Fix for elevtr1
    if (tile.destinationX > sizeMeta.maxX) continue // Fix for elevtr1
    if (tile.destinationY > sizeMeta.maxY) continue // Fix for elevtr1

    let texture = flevel.background.textures[`texture${tile.textureId}`]

    let sourceX = tile.sourceX
    let sourceY = tile.sourceY
    let textureId = tile.textureId

    let useTexture2 = false
    // if blending > 0, textureID2 is used instead of textureID except for layer 0
    if (tile.blending > 0) {
      sourceX = tile.sourceX2
      sourceY = tile.sourceY2
      textureId = tile.textureId2
      texture = flevel.background.textures[`texture${tile.textureId2}`]
      useTexture2 = true
    }
    if (texture === undefined) continue // Temp - I think to do with no palette images eg bugin1a

    const textureBytes = texture.data // Get all bytes for texture

    let tileSize = 16
    if (tile.layerID >= 1) {
      // Layer 2 & 3 can have 32 pixel tiles
      if (tile.width !== 16 && tile.height !== 16) {
        tileSize = 32
      }
    }
    computeShift(tile, tileSize)

    // const DEBUG_NAME = 'mds5_1-0-3-1-0-0.png'
    // if (name === DEBUG_NAME && tile.destinationX === sizeMeta.maxX && tile.destinationY === -48) {
    //     console.log('name:', name,
    //         'size:', tileSize,
    //         'sourceX:', sourceX,
    //         'sourceY:', sourceY,
    //         'destinationX:', tile.destinationX, tileOverlayX,
    //         'destinationY:', tile.destinationY, tileOverlayY)
    // }
    for (let j = 0; j < tileSize * tileSize; j++) {
      // Loop througheach tile's pixels, eg 16x16
      const adjustY = Math.floor(j / tileSize)
      const adjustX = j - adjustY * tileSize // Get normalised offset position, eg each new
      const posX = tileOverlayX + adjustX
      const posY = tileOverlayY + adjustY

      const textureBytesOffset = (sourceY + adjustY) * 256 + (sourceX + adjustX) // Calculate offset based on pixel coords, eg, we have to skip to the next row every 16

      const textureByte = textureBytes[textureBytesOffset] // Get the byte for this pixel from the source image

      const shallPrintDebug = (x, y, setBlackBackground) => {
        return false // disable debug logging
        if (setBlackBackground) {
          return false
        }
        const debugPixels = [[0, 0]]
        for (let i = 0; i < debugPixels.length; i++) {
          if (debugPixels[i][0] === x && debugPixels[i][1] === y) {
            return true
          }
        }
        return false
      }

      const isBlack = paletteItem => {
        // return paletteItem.r === 0 && paletteItem.g === 0 && paletteItem.b === 0
        const colorBlack =
          paletteItem.r === 0 && paletteItem.g === 0 && paletteItem.b === 0
        if (!colorBlack) {
          return false
        }
        if (paletteItem.m === 0) {
          return false
        } else {
          return true
        }
      }

      const usePalette =
        flevel.palette.pages.length > 0 &&
        flevel.palette.pages.length > tile.paletteId &&
        tile.depth !== 2
      const ignoreFirstPixel =
        flevel.background.palette.ignoreFirstPixel[tile.paletteId] === 1 &&
        textureByte === 0

      let paletteItem

      // if (j === 7) {
      //   const pc = Object.assign(
      //     {},
      //     flevel.palette.pages[tile.paletteId][textureByte]
      //   )
      //   pc.isBlack = isBlack(pc)
      //   console.log(
      //     'j',
      //     tile.layerID,
      //     tile.state,
      //     tile.depth,
      //     '-',
      //     textureByte,
      //     usePalette,
      //     tile.paletteId,
      //     useTexture2,
      //     pc
      //   )
      // }
      if (usePalette) {
        const paletteColor = Object.assign(
          {},
          flevel.palette.pages[tile.paletteId][textureByte]
        )
        paletteColor.isBlack = isBlack(paletteColor)
        paletteColor.type = 'palette'
        paletteItem = paletteColor
      } else {
        const directColor = getColorForDirect(textureByte)
        directColor.isBlack = isBlack(directColor)
        directColor.type = 'direct'
        paletteItem = directColor
      }

      if (
        paletteItem.isBlack &&
        flevel.palette.pages[tile.paletteId] &&
        flevel.palette.pages[tile.paletteId][0]
      ) {
        const paletteFirstColor = Object.assign(
          {},
          flevel.palette.pages[tile.paletteId][0]
        )
        paletteFirstColor.isBlack = isBlack(paletteFirstColor)
        paletteFirstColor.type = 'first'
        paletteItem = paletteFirstColor
      }
      if (ignoreFirstPixel) {
        if (shallPrintDebug(posX, posY, setBlackBackground)) {
          console.log('ignoreFirstPixel', paletteItem)
        }
        paletteItem.noRender = 1 // eg, don't render show
      }

      if (!usePalette && paletteItem.isBlack) {
        // paletteItem.noRender = 1
      }

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder)
      }

      if (shallPrintDebug(posX, posY, setBlackBackground)) {
        // Just for logging
        console.log(
          'Tile',
          i,
          tile,
          'x',
          tile.destinationX,
          '->',
          tileOverlayX,
          'y',
          tile.destinationY,
          '->',
          tileOverlayY,
          'depth',
          tile.depth,
          'z',
          tile.id,
          'palette',
          tile.paletteId,
          'texture',
          tile.sourceX,
          tile.sourceY,
          textureBytes.length,
          'layer',
          tile.layerID,
          'z',
          tile.z,
          'id',
          tile.id,
          tile.idBig,
          'param',
          tile.param,
          tile.state,
          'blend',
          tile.blending,
          tile.typeTrans,
          'textureByte',
          textureByte
        )

        console.log(
          ' - ',
          'x',
          sourceX,
          adjustX,
          '->',
          adjustX,
          'y',
          sourceY,
          adjustY,
          '->',
          adjustY,
          '\n',
          'pos',
          posX,
          posY,
          '\n',
          'palette',
          tile.paletteId,
          flevel.background.palette.ignoreFirstPixel[tile.paletteId],
          '\n',
          'bytes',
          textureByte,
          textureByte === 0,
          '\n',
          'selection',
          usePalette,
          ignoreFirstPixel,
          paletteItem.isBlack === true,
          '\n',
          // 'potential\n',
          // JSON.stringify(directColor), '\n',
          // JSON.stringify(paletteColor), '\n',
          // JSON.stringify(paletteFirstColor), '\n',
          'chosen',
          JSON.stringify(paletteItem)
        )
      }
      const byteOffset =
        (tileOverlayY + adjustY) * sizeMeta.width * sizeMeta.channels +
        (tileOverlayX + adjustX) * sizeMeta.channels // Write this into an array so we can print the image (note, each channel, eg RGBA)

      if (tile.blending) {
        // Most blending should happen with webgl in browser
        if (tile.typeTrans === 3) {
          // Blending 3 is 25%, set colours to 25%
          paletteItem.r = Math.round(0.25 * paletteItem.r)
          paletteItem.g = Math.round(0.25 * paletteItem.g)
          paletteItem.b = Math.round(0.25 * paletteItem.b)
        }
      }

      if (!paletteItem.noRender) {
        data[byteOffset + 0] = data[byteOffset + 0] + 0x00 + paletteItem.r
        data[byteOffset + 1] = data[byteOffset + 1] + 0x00 + paletteItem.g
        data[byteOffset + 2] = data[byteOffset + 2] + 0x00 + paletteItem.b
        data[byteOffset + 3] = data[byteOffset + 3] + 0x00 + paletteItem.a

        if (usePalette) {
          pixelData[byteOffset + 0] = textureByte
          pixelData[byteOffset + 1] = 0x00
          pixelData[byteOffset + 2] = 0x00
          pixelData[byteOffset + 3] = 0xff
        } else {
          pixelData[byteOffset + 0] = 0x00 + paletteItem.r
          pixelData[byteOffset + 1] = 0x00 + paletteItem.g
          pixelData[byteOffset + 2] = 0x00 + paletteItem.b
          pixelData[byteOffset + 3] = 0x00 + paletteItem.a
        }

        if (shallPrintDebug(posX, posY, setBlackBackground)) {
          console.log(
            'rendering',
            JSON.stringify(paletteItem),
            '-',
            data[byteOffset + 0],
            data[byteOffset + 1],
            data[byteOffset + 2],
            data[byteOffset + 3],
            '-',
            byteOffset,
            '\n'
          )
        }
      }
    }
  }

  const filePath = folder + '/' + name
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder)
  }
  sharp(Buffer.from(data.buffer), {
    raw: {
      width: sizeMeta.width,
      height: sizeMeta.height,
      channels: sizeMeta.channels
    }
  })
    // .resize({ width: sizeMeta.width * 4, height: sizeMeta.height * 4, kernel: sharp.kernel.nearest })
    .toFile(filePath)

  const pixelFilePath = folder + '/pixels/' + name
  if (!fs.existsSync(folder + '/pixels')) {
    fs.mkdirSync(folder + '/pixels')
  }
  sharp(Buffer.from(pixelData.buffer), {
    raw: {
      width: sizeMeta.width,
      height: sizeMeta.height,
      channels: sizeMeta.channels
    }
  })
    // .resize({ width: sizeMeta.width * 4, height: sizeMeta.height * 4, kernel: sharp.kernel.nearest })
    .toFile(pixelFilePath)
  return data
}

const getExistingArrangedLayer = (tile, arrangedLayers) => {
  for (let i = 0; i < arrangedLayers.length; i++) {
    const arrangedLayer = arrangedLayers[i]
    if (
      tile.layerID === arrangedLayer.layerID &&
      tile.z === arrangedLayer.z &&
      tile.param === arrangedLayer.param &&
      tile.state === arrangedLayer.state &&
      tile.typeTrans === arrangedLayer.typeTrans &&
      tile.paletteId === arrangedLayer.paletteId
    ) {
      return arrangedLayer
    }
  }
  return null
}
const arrangeLayers = tiles => {
  const arrangedLayers = []

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    // get existing arranged layer if exists
    let arrangedLayer = getExistingArrangedLayer(tile, arrangedLayers)

    // if doesn't exist, create it
    if (arrangedLayer === null) {
      arrangedLayer = {
        layerID: tile.layerID,
        z: tile.z,
        param: tile.param,
        state: tile.state,
        typeTrans: tile.typeTrans,
        paletteId: tile.paletteId,
        isDirect: tile.depth >= 2,
        tiles: [],
        tileCount: 0
      }
      arrangedLayers.push(arrangedLayer)
    }
    // add tile to layer
    arrangedLayer.tiles.push(tile)
    arrangedLayer.tileCount = arrangedLayer.tiles.length
  }
  return arrangedLayers
}
const renderBackgroundLayers = (flevel, folder, baseFilename) => {
  const tiles = allTiles(flevel)

  const sizeMeta = getSizeMetaData(tiles)
  if (baseFilename === 'elevtr1') {
    // Hack for elevtr1
    sizeMeta.minX = -192
    sizeMeta.maxX = 176
    sizeMeta.minY = -128
    sizeMeta.maxY = 128
  }
  // console.log('sizeMeta', JSON.stringify(sizeMeta), tiles.length)

  sortBy(['layerID', 'z', 'param', 'state', 'typeTrans'], tiles)

  // Group by
  const arrangedLayers = arrangeLayers(tiles)

  // console.log('arrangedLayers', arrangedLayers)
  // console.log('arrangedLayer', arrangedLayers[0])

  // Save all palettes
  const paletteData = savePalettes(flevel, folder, baseFilename)

  // Get offsets
  const tilesX = []
  const tilesY = []
  const threshold = 3500 // set a threshold value

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    if (Math.abs(tile.destinationX) < threshold) {
      tilesX.push(tile.destinationX)
    }
    if (Math.abs(tile.destinationY) < threshold) {
      tilesY.push(tile.destinationY)
    }
  }

  const minX = Math.min(...tilesX)
  let maxX = Math.max(...tilesX)
  const minY = Math.min(...tilesY)
  let maxY = Math.max(...tilesY)

  maxX += 16
  maxY += 16

  const offsetX = -((minX + maxX) / 2)
  const offsetY = -((minY + maxY) / 2)

  // Draw all bg layers
  saveTileGroupImage(
    flevel,
    folder,
    `${baseFilename}.png`,
    tiles,
    sizeMeta,
    true
  )

  shiftData[1].xComputed = false; shiftData[1].yComputed = false
  shiftData[2].xComputed = false; shiftData[2].yComputed = false
  shiftData[3].xComputed = false; shiftData[3].yComputed = false

  // Draw each grouped tile layer
  for (let i = 0; i < arrangedLayers.length; i++) {
    const arrangedLayer = arrangedLayers[i]
    // Note: This works, BUT it will only toggle between states. If you wanted to have multiple states of one param active, this wouldn't work.
    // In that case, we'd have to render every combination of states for each param, maybe all params
    const name = `${baseFilename}-${arrangedLayer.z}-${arrangedLayer.layerID}-${arrangedLayer.typeTrans}-${arrangedLayer.param}-${arrangedLayer.state}-${arrangedLayer.paletteId}.png`
    // console.log('name', arrangedLayer.typeTrans, name)
    let layerSizeMeta = sizeMeta
    if (arrangedLayer.layerID && arrangedLayer.layerID === 2) {
      layerSizeMeta = getSizeMetaData(arrangedLayer.tiles)
    }

    // const logLayer = { ...arrangedLayer }
    // logLayer.palettes = logLayer.tiles.map(t => t.paletteId)
    // delete logLayer.tiles
    // console.log('arrangedLayer', logLayer, arrangedLayers.length)
    saveTileGroupImage(
      flevel,
      folder,
      name,
      arrangedLayer.tiles,
      layerSizeMeta,
      false,
      arrangedLayer.layerID
    )
    arrangedLayer.fileName = name
    if (arrangedLayer.layerID === 2) {
      arrangedLayer.parallaxDirection =
        Math.abs(sizeMeta.height - layerSizeMeta.height) <= 16
          ? 'horizontal'
          : 'vertical'
      if (arrangedLayer.parallaxDirection === 'horizontal') {
        arrangedLayer.parallaxRatio = layerSizeMeta.width / sizeMeta.width
        arrangedLayer.parallaxMax = sizeMeta.width
      } else {
        arrangedLayer.parallaxRatio = layerSizeMeta.height / sizeMeta.height
        arrangedLayer.parallaxMax = sizeMeta.height
      }
    }
    if (arrangedLayer.tiles[0].useBlack !== 0) arrangedLayer.useBlack = true
    delete arrangedLayer.tiles
  }

  const jsonData = {
    paletteCount: paletteData,
    layerShifts: [
      { x: shiftData[1].x, y: shiftData[1].y },
      { x: shiftData[2].x, y: shiftData[2].y },
      { x: shiftData[3].x, y: shiftData[3].y }
    ],
    offsetX,
    offsetY,
    layers: arrangedLayers
  }
  // Write layer metadata to json filea
  fs.writeFileSync(
    `${folder}/${baseFilename}.json`,
    JSON.stringify(jsonData, null, 2)
  )
}
const savePalettes = (flevel, folder, baseFilename) => {
  // console.log('palette', flevel.palette)

  // Handle no palette images
  if (flevel.palette.pages.length === 0 || flevel.palette.header.colorsPerPage === 0) {
    return flevel.palette.pages.length
  }

  if (!fs.existsSync(folder + '/palettes')) {
    fs.mkdirSync(folder + '/palettes')
  }

  const dataAll = new Uint8ClampedArray(
    flevel.palette.header.colorsPerPage * 4 * flevel.palette.pages.length
  )

  for (let i = 0; i < flevel.palette.pages.length; i++) {
    const palette = flevel.palette.pages[i]

    const paletteFilePath =
      folder + '/palettes/' + baseFilename + '-' + i + '.png'

    // NOTE: Doubled palette width to ensure that pixelData is read more consistently
    // Which seems to work
    const data = new Uint8ClampedArray(
      flevel.palette.header.colorsPerPage * 4 * 2
    )
    for (let j = 0; j < palette.length; j++) {
      const color = palette[j]
      data[j * 8 + 0] = color.r
      data[j * 8 + 1] = color.g
      data[j * 8 + 2] = color.b
      data[j * 8 + 3] = color.a
      data[j * 8 + 4] = color.r
      data[j * 8 + 5] = color.g
      data[j * 8 + 6] = color.b
      data[j * 8 + 7] = color.a

      dataAll[i * 256 * 4 + j * 4 + 0] = color.r
      dataAll[i * 256 * 4 + j * 4 + 1] = color.g
      dataAll[i * 256 * 4 + j * 4 + 2] = color.b
      dataAll[i * 256 * 4 + j * 4 + 3] = color.a
    }

    // console.log('paletteFilePath', paletteFilePath, palette.length)
    sharp(Buffer.from(data.buffer), {
      raw: {
        width: flevel.palette.header.colorsPerPage * 2,
        height: 1,
        channels: 4
      }
    }).toFile(paletteFilePath)
  }
  sharp(Buffer.from(dataAll.buffer), {
    raw: {
      width: flevel.palette.header.colorsPerPage,
      height: flevel.palette.pages.length,
      channels: 4
    }
  }).toFile(folder + '/palettes/' + baseFilename + '-all-palettes.png')
  return flevel.palette.pages.length
}
const getAllLayersSizeMeta = flevel => {
  const tiles = allTiles(flevel)
  const sizeMeta = getSizeMetaData(tiles)
  return sizeMeta
}
const getLayerSizeMeta = tiles => {
  const sizeMeta = getSizeMetaData(tiles)
  return sizeMeta
}
module.exports = {
  renderBackgroundLayers,
  getColorForPalette,
  getAllLayersSizeMeta,
  getLayerSizeMeta
}
