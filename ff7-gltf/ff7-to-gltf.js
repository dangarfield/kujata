const {
  COMPONENT_TYPE,
  ARRAY_BUFFER,
  ELEMENT_ARRAY_BUFFER,
  FILTER,
  WRAPPING_MODE
} = require('./gltf-2.0-util.js')
const { toRadians, rotationToQuaternion } = require('./ff7-gltf-common.js')
const HrcLoader = require('../ff7-asset-loader/hrc-loader.js')
const RsdLoader = require('../ff7-asset-loader/rsd-loader.js')
const PLoader = require('../ff7-asset-loader/p-loader.js')
const ALoader = require('../ff7-asset-loader/a-loader.js')
const BattleModelLoader = require('../ff7-asset-loader/battle-model-loader.js')
const BattleAnimationLoader = require('../ff7-asset-loader/battle-animation-loader.js')
const fs = require('fs')

// Model type enumeration
// Model type enumeration
const ModelType = {
  FIELD: 'field',
  BATTLE: 'battle',
  WORLD: 'world'
}
const path = require('path')
const { TexFile } = require('../ff7-asset-loader/tex-file.js')
const mkdirp = require('mkdirp')
const { KUJATA_ROOT } = require('../ff7-asset-loader/helper.js')

const allFieldModelAnimsList = {}
const generateAllFieldModelAnimsList = () => {
  const all = JSON.parse(
    fs.readFileSync(
      path.join(KUJATA_ROOT, 'metadata', 'field-model-metadata.json')
    )
  )

  for (const hrcId of Object.keys(all)) {
    allFieldModelAnimsList[hrcId] = []
    for (const animType of Object.keys(all[hrcId].animationStats)) {
      for (const anim of Object.keys(all[hrcId].animationStats[animType])) {
        allFieldModelAnimsList[hrcId].push(anim)
      }
    }
    // console.log('hrcId', hrcId, allFieldModelAnimsList)
  }
}

// Cache for world animation files
let allWorldAnimationsList = null

// Generate list of all .a animation files available for world models
function generateAllWorldAnimationsList(inputWorldDirectory) {
  if (allWorldAnimationsList !== null) {
    return allWorldAnimationsList
  }
  
  allWorldAnimationsList = []
  
  try {
    const files = fs.readdirSync(inputWorldDirectory)
    for (const file of files) {
      if (file.toLowerCase().endsWith('.a')) {
        const animId = file.toLowerCase().replace('.a', '')
        allWorldAnimationsList.push(animId)
      }
    }
  } catch (error) {
    console.warn('Could not read world animation files:', error.message)
    allWorldAnimationsList = []
  }
  
  return allWorldAnimationsList
}
class FF7GltfTranslator {
  // Translate a FF7 FIELD.LGP's *.HRC file to glTF 2.0 format
  // hrcFileId = which skeleton to translate, e.g. "AAAA" for AAAA.HRC (Cloud)
  // baseAnimFileId = which animation to use for base structure, e.g. "AAFE" for AAFE.A (Cloud standing)
  //   null            = use field-model-standing-animations.json to decide
  // animFileIds = which animation(s) to include in the output gltf
  //   null            = don't include any animations
  //   []              = include all animations from field usage
  //   ["AAFE, "AAGA"] = include only specific animations
  // includeTextures = whether to include textures in the translation (set to false to disable)

  async translateFF7FieldHrcToGltf (
    config,
    hrcFileId,
    baseAnimFileId,
    animFileIds,
    includeTextures,
    modelType
  ) {
    const inputBattleBattleDirectory = path.join(
      config.unlgpDirectory,
      'battle.lgp'
    )
    const inputFieldCharDirectory = path.join(config.unlgpDirectory, 'char.lgp')
    const inputWorldCharDirectory = path.join(config.unlgpDirectory, 'world_us.lgp')

    const metadataDirectory = path.join(config.kujataDataDirectory, 'metadata')
    const outputBattleBattleDirectory = path.join(
      config.kujataDataDirectory,
      'data',
      'battle',
      'battle.lgp'
    )
    const outputFieldCharDirectory = path.join(
      config.kujataDataDirectory,
      'data',
      'field',
      'char.lgp'
    )
    const outputWorldCharDirectory = path.join(
      config.kujataDataDirectory,
      'data',
      'world',
      'world_us.lgp'
    )

    const standingAnimations = JSON.parse(
      // Note: This is precalculated. But running `kujata metadata` will regenerate this file
      fs.readFileSync(
        path.join(
          KUJATA_ROOT,
          'metadata',
          'field-model-standing-animation.json'
        ),
        'utf-8'
      )
    )

    let outputDirectory, inputDirectory
    switch (modelType) {
      case ModelType.BATTLE:
        outputDirectory = outputBattleBattleDirectory
        inputDirectory = inputBattleBattleDirectory
        break
      case ModelType.WORLD:
        outputDirectory = outputWorldCharDirectory
        inputDirectory = inputWorldCharDirectory
        break
      case ModelType.FIELD:
      default:
        outputDirectory = outputFieldCharDirectory
        inputDirectory = inputFieldCharDirectory
        break
    }

    if (!fs.existsSync(outputDirectory)) {
      // console.log('Creating output directory: ' + outputDirectory)
      mkdirp.sync(outputDirectory)
    }
    const texturesDirectory = `${outputDirectory}/textures`
    if (!fs.existsSync(texturesDirectory)) {
      // console.log('Creating texturesDirectory directory: ' + texturesDirectory)
      mkdirp.sync(texturesDirectory)
    }
    const ROOT_X_ROTATION_DEGREES = 180.0
    let FRAMES_PER_SECOND = null
    if (modelType === ModelType.BATTLE) {
      FRAMES_PER_SECOND = 15.0
    } else {
      FRAMES_PER_SECOND = 30.0 // Field and World models use 30 FPS
    }

    const hrcId = hrcFileId.toLowerCase()
    // console.log(`Translating: ${hrcId}`)
    let skeleton = {}

    if (modelType === ModelType.BATTLE) {
      const battleModelLoader = new BattleModelLoader()
      skeleton = battleModelLoader.loadBattleModel(
        inputBattleBattleDirectory,
        hrcId,
        true
      )
    } else {
      // Field and World models use the same HRC loader
      skeleton = HrcLoader.loadHrc(inputDirectory, hrcFileId)
    }
    // console.log('\n\nskeleton', skeleton)

    const numBones = skeleton.bones.length

    // create list of animation files to translate (field and world only)
    if (modelType === ModelType.BATTLE) {
      // Battle models handle animations differently
    } else if (modelType === ModelType.WORLD) {
      // World models use all available .a files in the world directory
      // NOTE: This is a temporary implementation that assigns all compatible animations to all world models.
      // In the future, this will be programmatically populated when processing world map scripts
      // to assign specific animations to specific models based on their usage in the game.
      if (animFileIds === null) {
        // console.log('Will not translate any world animations.')
        animFileIds = []
      } else {
        if (animFileIds.length === 0) {
          animFileIds = generateAllWorldAnimationsList(inputDirectory)
        }
      }
    } else {
      // Field models use the same animation system
      if (animFileIds === null) {
        // console.log('Will not translate any field animations.')
        animFileIds = []
      } else {
        if (animFileIds.length === 0) {
          console.log('Will translate all field animations from field usage.')
          if (allFieldModelAnimsList[hrcFileId] === undefined) {
            generateAllFieldModelAnimsList()
          }
          animFileIds = allFieldModelAnimsList[hrcFileId]
        }
      }
    }

    let animationDataList = []
    let weaponAnimationDataList = []
    let battleAnimationPack = null
    let baseAnimationData = null
    if (modelType === ModelType.BATTLE) {
      const battleAnimationFilename = hrcId.substring(0, 2) + 'da'
      // console.log('Will translate and include animations from pack: ' + battleAnimationFilename)
      const battleAnimationLoader = new BattleAnimationLoader()
      const battleModel = skeleton
      battleAnimationPack = battleAnimationLoader.loadBattleAnimationPack(
        inputBattleBattleDirectory,
        battleAnimationFilename,
        battleModel.numBones,
        battleModel.numBodyAnimations,
        battleModel.numWeaponAnimations
      )
      animationDataList = battleAnimationPack.bodyAnimations
      weaponAnimationDataList = battleAnimationPack.weaponAnimations

      baseAnimationData = battleAnimationPack.bodyAnimations[0]
    } else {
      // console.log(
      //   '\n\nWill translate the following field animFileIds: ',
      //   JSON.stringify(animFileIds, null, 0)
      // )
      for (const animFileId of animFileIds) {
        try {
          const animationData = ALoader.loadA(inputDirectory, animFileId)
          
          // For world models, only include animations with matching bone count
          if (modelType === ModelType.WORLD) {
            if (animationData.numBones === numBones) {
              animationDataList.push(animationData)
            }
            // Skip incompatible animations silently for world models
          } else {
            animationDataList.push(animationData)
          }
        } catch (error) {
          console.log(`Skipping animation '${animFileId}': ${error.message}`)
        }
      }
    }
    // console.log('battleAnimationPack', battleAnimationPack)

    let baseWeaponAnimationData = null
    // NEW
    // let battleAnimationCombo = []
    if (modelType === ModelType.BATTLE) {
      /* for (let ai = 0; ai < battleAnimationPack.numBodyAnimations; ai++)
      {
        if (battleAnimationPack.bodyAnimations[ai].numFrames2 > 0)
        {
          battleAnimationCombo.push(ai);
        }
      } */
      baseAnimationData = battleAnimationPack.bodyAnimations[0]
      baseWeaponAnimationData = battleAnimationPack.weaponAnimations[0]

      // ENDNEW
      // let animIndex = 0
      // let weaponIndex = 0
    } else {
      if (baseAnimFileId) {
        baseAnimationData = ALoader.loadA(
          inputDirectory,
          baseAnimFileId
        )
      } else if (modelType === ModelType.WORLD) {
        // For world models, use the first compatible animation as base animation
        if (animFileIds && animFileIds.length > 0) {
          let foundCompatibleAnimation = false
          for (const animFileId of animFileIds) {
            try {
              const testAnimationData = ALoader.loadA(inputDirectory, animFileId)
              if (testAnimationData.numBones === numBones) {
                baseAnimationData = testAnimationData
                foundCompatibleAnimation = true
                break
              }
            } catch (error) {
              // Skip animations that can't be loaded
            }
          }
          
          if (!foundCompatibleAnimation) {
            const defaultBoneRotations = []
            for (let i = 0; i < numBones; i++) {
              defaultBoneRotations.push({
                x: (30 * Math.PI) / 180,
                y: (30 * Math.PI) / 180,
                z: (30 * Math.PI) / 180
              })
            }
            baseAnimationData = {
              numFrames: 1,
              numBones,
              rotationOrder: 'YXZ',
              animationFrames: [
                {
                  rootRotation: { x: 0, y: 0, z: 0 },
                  rootTranslation: { x: 0, y: 0, z: 0 },
                  boneRotations: defaultBoneRotations
                }
              ]
            }
          }
        } else {
          // No animations available, use default rotations
          const defaultBoneRotations = []
          for (let i = 0; i < numBones; i++) {
            defaultBoneRotations.push({
              x: (30 * Math.PI) / 180,
              y: (30 * Math.PI) / 180,
              z: (30 * Math.PI) / 180
            })
          }
          baseAnimationData = {
            numFrames: 1,
            numBones,
            rotationOrder: 'YXZ',
            animationFrames: [
              {
                rootRotation: { x: 0, y: 0, z: 0 },
                rootTranslation: { x: 0, y: 0, z: 0 },
                boneRotations: defaultBoneRotations
              }
            ]
          }
        }
      } else {
        const baseAnimFileId = standingAnimations[hrcFileId.toLowerCase()]
        if (baseAnimFileId && modelType !== ModelType.BATTLE) {
          baseAnimationData = ALoader.loadA(
            inputDirectory,
            baseAnimFileId
          )
        } else {
          // console.log('Warning: Not using base animation; model may look funny without bone rotations.')
          const defaultBoneRotations = []
          for (let i = 0; i < numBones; i++) {
            defaultBoneRotations.push({
              x: (30 * Math.PI) / 180,
              y: (30 * Math.PI) / 180,
              z: (30 * Math.PI) / 180
            })
          }
          baseAnimationData = {
            numFrames: 1,
            numBones,
            rotationOrder1: 1,
            rotationOrder2: 0,
            rotationOrder3: 2,
            animationFrames: [
              {
                rootTranslation: { x: 0, y: 0, z: 0 },
                rootRotation: { x: 0, y: 0, z: 0 },
                boneRotations: defaultBoneRotations
              }
            ]
          }
        }
      }
    }

    let rotationOrder = null // TODO: use animation data rotationOrder instead
    if (modelType === ModelType.BATTLE) {
      // TODO: determine if original data specifies rotation order
      // if so, determine whether the ff7 game actually uses the rotation order specified in the battle model/anim file
      // if so, use it here
      rotationOrder = 'YXZ'
    } else {
      // TODO: determine whether the ff7 game actually uses the rotation order specified in the field/world model/anim file
      // if so, use it here
      rotationOrder = 'YXZ' // TODO: use animation data rotationOrder instead
    }

    if (baseAnimFileId) {
      if (baseAnimationData.numBones !== skeleton.bones.length) {
        throw new Error(
          'number of bones do not match between hrcId=' +
            hrcId +
            ' and baseAnimId='
        ) // + baseAnimId)
      }
    }
    // for (let animationData of animationDataList) {

    for (let i = 0; i < animationDataList.length; i++) {
      const animationData = animationDataList[i]
      if (!animationData.numBones) {
        // console.log('WARN: animation #' + i + ' is blank.')
      } else {
        const bonesToCompare =
          modelType === ModelType.BATTLE && skeleton.hasWeapon
            ? skeleton.bones.length - 1
            : skeleton.bones.length // battle model with weapon has + 1 bone (body + weapon), so we need to substract that bone
        if (animationData.numBones !== bonesToCompare) {
          throw new Error(
            'number of bones do not match between hrcId=' +
              hrcId +
              ' and animationData=' +
              animationData
          )
        }
        // while (animationData.numBones < bonesToCompare) {
        //   animationData.animationFrames.push(animationData.animationFrames[animationData.animationFrames.length - 1])
        //   animationData.numBones = animationData.animationFrames.length - 3
        // }
      }
    }

    let firstFrame = null
    if (
      baseAnimationData &&
      baseAnimationData.animationFrames &&
      baseAnimationData.animationFrames.length > 0
    ) {
      firstFrame = baseAnimationData.animationFrames[0]
    } else {
      firstFrame = {
        rootRotation: { x: 0, y: 0, z: 0 },
        rootTranslation: { x: 0, y: 0, z: 0 }
      }
    }
    let firstWeaponFrame = null
    if (skeleton.hasWeapon) {
      // later for not char battle model
      firstWeaponFrame = baseWeaponAnimationData.animationFrames[0]
    }

    const gltfFilename = hrcId + '.hrc.gltf'
    const binFilename = hrcId + '.hrc.bin'

    const gltf = {}
    gltf.asset = {
      version: '2.0',
      generator: 'kujata'
    }
    gltf.accessors = []
    gltf.buffers = []
    gltf.bufferViews = []
    // Don't initialize images - will be added only if needed
    gltf.materials = []
    gltf.meshes = []
    gltf.nodes = []
    gltf.samplers = []
    gltf.scene = 0
    gltf.scenes = []
    // Don't initialize textures, images, or extensionsUsed as empty arrays - will be added only if needed

    // Don't add default sampler - will be added only when textures are used

    gltf.scenes.push({ nodes: [0] })
    let quat = rotationToQuaternion(0, 0, 0, rotationOrder)
    gltf.nodes.push({
      name: 'RootContainer',
      children: [1],
      translation: [0, 0, 0],
      rotation: [quat.x, quat.y, quat.z, quat.w],
      scale: [1, 1, 1]
      // no mesh
    })

    quat = rotationToQuaternion(
      toRadians(firstFrame.rootRotation.x + ROOT_X_ROTATION_DEGREES),
      toRadians(-firstFrame.rootRotation.y),
      toRadians(firstFrame.rootRotation.z),
      rotationOrder
    )

    gltf.nodes.push({
      name: hrcId + 'BoneRoot',
      children: [], // will populate below
      translation: [
        firstFrame.rootTranslation.x,
        firstFrame.rootTranslation.y,
        firstFrame.rootTranslation.z
      ],
      rotation: [quat.x, quat.y, quat.z, quat.w],
      scale: [1, 1, 1]
      // no mesh
    })

    // vertexColoredMaterial is used by polygonGroups that use vertex colors and not textures
    const vertexMaterial = {
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.5
      },
      name: 'vertexColoredMaterial'
    }
    // console.log('modelType', modelType)
    if (modelType === ModelType.BATTLE) {
      vertexMaterial.extensions = {
        // Uncomment to ensure gltf model does not respond to lights
        KHR_materials_unlit: {}
      }
      if (!gltf.extensionsUsed) {
        gltf.extensionsUsed = []
      }
      if (!gltf.extensionsUsed.includes('KHR_materials_unlit')) {
        // Uncomment to ensure gltf model does not respond to lights
        gltf.extensionsUsed.push('KHR_materials_unlit')
        // console.log('Add KHR_materials_unlit')
      }
    }
    gltf.materials.push(vertexMaterial)

    // create map of bone name to bone metadata
    const boneMap = {}
    for (const bone of skeleton.bones) {
      boneMap[bone.name] = bone
    }

    const allBuffers = [] // array of all individual Buffers, which will be combined at the end
    let numBuffersCreated = 0

    let numMeshesCreated = 0
    let gltfTextureIndexOffset = 0 // starting point for textures within a bone

    let pFileCount = 0
    // for (let bone of skeleton.bones) {
    for (let skbi = 0; skbi < skeleton.bones.length; skbi++) {
      const bone = skeleton.bones[skbi]
      const parentBone = boneMap[bone.parent]
      let meshIndex // do not populate node.mesh if this bone does not have one

      const currentPFileCount = []
      // console.log('bone', skeleton, bone)
      // console.log('bone.polygonFilename INITIAL', bone.polygonFilename, bone.rsdBaseFilenames.length, bone.hasModel)
      if (
        bone.rsdBaseFilenames.length > 0 ||
        (modelType === ModelType.BATTLE && bone.hasModel)
      ) {
        // this bone has a mesh
        const boneMetadatas = []
        // console.log('bone.polygonFilename', bone.polygonFilename)
        if (modelType === ModelType.BATTLE) {
          const boneMetadata = {
            polygonFilename: bone.polygonFilename,
            // textureBaseFilenames: []
            textureBaseFilenames: skeleton.textureFilenames // TODO: add support for battle textures
          }
          boneMetadatas.push(boneMetadata)
        } else {
          // Support added HRC files that have multiple meshes
          // For now, we just use the first mesh only.
          // let rsdFileId = bone.rsdBaseFilenames[0] // aaaf.rsd = cloud's head, aaha.rsd = tifa's head
          for (let rsdi = 0; rsdi < bone.rsdBaseFilenames.length; rsdi++) {
            const rsdFileId = bone.rsdBaseFilenames[rsdi]

            // let rsdId = rsdFileId.toLowerCase()
            // console.log('rsd', bone.rsdBaseFilenames, rsdFileId)
            const boneMetadata = RsdLoader.loadRsd(
              inputDirectory,
              rsdFileId
            )
            boneMetadatas.push(boneMetadata)
          }
        }

        const mesh = {
          primitives: [], // will add 1 primitive per polygonGroup
          name:
            boneMetadatas.map(b => b.polygonFilename.toLowerCase()).join('') +
            'Mesh'
        }
        gltf.meshes.push(mesh)
        numMeshesCreated++
        meshIndex = numMeshesCreated - 1

        for (let bmi = 0; bmi < boneMetadatas.length; bmi++) {
          const boneMetadata = boneMetadatas[bmi]
          // console.log('boneMetadata', boneMetadata, gltf.materials.length)
          const pFileId = boneMetadata.polygonFilename // aaba.p = cloud's head model
          // let pId = pFileId.toLowerCase()
          // console.log('boneMetadata', boneMetadata)
          const model = PLoader.loadP(
            modelType === ModelType.BATTLE ? inputBattleBattleDirectory : inputBattleBattleDirectory,
            inputDirectory,
            pFileId,
            modelType === ModelType.BATTLE
          )
          // console.log('p model', pFileId, skbi, bmi, pFileCount)
          currentPFileCount.push(pFileCount)
          pFileCount++ // Bone(?) count is used for KAWAI SBOBJ
          /* else
        {
          let model = skeleton.weaponModels[0];
        } */

          if (includeTextures) {
            const textureIds = boneMetadata.textureBaseFilenames
            if (textureIds && textureIds.length > 0) {
              for (let i = 0; i < textureIds.length; i++) {
                const textureId = textureIds[i].toLowerCase()

                const texSrcDir = modelType === ModelType.BATTLE
                  ? inputBattleBattleDirectory
                  : inputDirectory
                const texSrcFile = modelType === ModelType.BATTLE
                  ? textureIds[i]
                  : `${textureIds[i]}.tex`
                const texturePath = modelType === ModelType.BATTLE
                  ? `textures/${textureId}.png`
                  : `textures/${textureId}.tex.png`
                const textureFlip = modelType === ModelType.BATTLE
                const hasTransparentPixels = await this.ensureTextureExists(
                  outputDirectory,
                  texSrcDir,
                  texSrcFile,
                  texturePath,
                  textureFlip
                )
                // console.log(pFileId, 'texture - ', texturePath)
                
                // Initialize textures and samplers arrays if this is the first texture
                if (!gltf.images) {
                  gltf.images = []
                }
                if (!gltf.textures) {
                  gltf.textures = []
                }
                if (gltf.samplers.length === 0) {
                  gltf.samplers.push({
                    magFilter: FILTER.LINEAR,
                    minFilter: FILTER.NEAREST_MIPMAP_LINEAR,
                    wrapS: WRAPPING_MODE.REPEAT,
                    wrapT: WRAPPING_MODE.REPEAT
                  })
                }
                
                gltf.images.push({ uri: texturePath })
                // gltf.images.push({'textures' + '/' + textureId + ".tex.png"});

                const textureIndex = gltf.textures.length
                gltf.textures.push({
                  source: textureIndex, // index to gltf.images[]
                  sampler: 0, // index to gltf.samplers[]
                  name: textureId + 'Texture'
                })

                const mat = {
                  pbrMetallicRoughness: {
                    baseColorFactor: [1, 1, 1, 1],
                    baseColorTexture: {
                      index: textureIndex // index to gltf.textures[]
                    },
                    metallicFactor: 1.0,
                    roughnessFactor: 1.0
                  },
                  alphaMode: hasTransparentPixels ? 'BLEND' : 'OPAQUE', // Has to be blend so that textures colors can both apply
                  name: textureId + 'Material'
                }
                if (hasTransparentPixels || modelType === ModelType.BATTLE) {
                  if (!gltf.extensionsUsed) {
                    gltf.extensionsUsed = []
                  }
                  if (!gltf.extensionsUsed.includes('KHR_materials_unlit')) {
                    gltf.extensionsUsed.push('KHR_materials_unlit')
                  }
                  mat.extensions = { KHR_materials_unlit: {} }
                }
                // console.log('textureId', textureId, textureId === 'oqac')
                // if (textureId === 'opac') {
                //   console.log('opac', mat)
                // }
                gltf.materials.push(mat)
                // gltfTextureIndexOffset++
                // console.log('gltfTextureIndexOffset + i', textureIndex)
                // gltfTextureIndexOffset++
              }
            }
          }

          const numGroups = model.polygonGroups.length

          for (let g = 0; g < numGroups; g++) {
            const polygonGroup = model.polygonGroups[g]
            const numPolysInGroup = polygonGroup.numPolysInGroup
            const numVerticesInGroup = polygonGroup.numVerticesInGroup
            const offsetPolyIndex = polygonGroup.offsetPolyIndex
            const offsetVertexIndex = polygonGroup.offsetVertexIndex
            const offsetTextureCoordinateIndex =
              polygonGroup.offsetTextureCoordinateIndex

            // flatten the normal data so that each vertex index maps to 1 vertex normal as well
            const flattenedNormals = []
            if (model.numNormals > 0) {
              // Note: it appears that field models have vertex normals, but battle models don't
              flattenedNormals.length = numVerticesInGroup
              for (let i = 0; i < numPolysInGroup; i++) {
                const polygon = model.polygons[offsetPolyIndex + i]
                const normal3 = model.normals[polygon.normalIndex3]
                const normal2 = model.normals[polygon.normalIndex2]
                const normal1 = model.normals[polygon.normalIndex1]
                flattenedNormals[polygon.vertexIndex3] = normal3
                flattenedNormals[polygon.vertexIndex2] = normal2
                flattenedNormals[polygon.vertexIndex1] = normal1
              }
            }

            // 1. create "polygon vertex index" js Buffer + gltf bufferView + gltf accessor
            const polygonVertexIndexBuffer = Buffer.alloc(
              numPolysInGroup * 3 * 2
            ) // 3 vertexIndex per triangle, 2 bytes for vertexIndex(short)
            for (let i = 0; i < numPolysInGroup; i++) {
              const polygon = model.polygons[offsetPolyIndex + i]
              polygonVertexIndexBuffer.writeUInt16LE(
                polygon.vertexIndex3,
                i * 6
              )
              polygonVertexIndexBuffer.writeUInt16LE(
                polygon.vertexIndex2,
                i * 6 + 2
              )
              polygonVertexIndexBuffer.writeUInt16LE(
                polygon.vertexIndex1,
                i * 6 + 4
              )
            }
            allBuffers.push(polygonVertexIndexBuffer)
            numBuffersCreated++
            const polygonVertexIndexAccessorIndex = numBuffersCreated - 1
            gltf.accessors.push({
              bufferView: polygonVertexIndexAccessorIndex,
              byteOffset: 0,
              type: 'SCALAR',
              componentType: COMPONENT_TYPE.UNSIGNED_SHORT,
              count: numPolysInGroup * 3
            })
            gltf.bufferViews.push({
              buffer: 0,
              byteLength: polygonVertexIndexBuffer.length,
              // byteStride should be omitted for ELEMENT_ARRAY_BUFFER
              target: ELEMENT_ARRAY_BUFFER
            })

            // 2. create "vertex" js Buffer + gltf bufferView + gltf accessor
            const vertexBuffer = Buffer.alloc(numVerticesInGroup * 3 * 4) // 3 floats per vertex, 4 bytes per float
            const minMax = {
              min: {
                x: model.vertices[offsetVertexIndex].x,
                y: model.vertices[offsetVertexIndex].y,
                z: model.vertices[offsetVertexIndex].z
              },
              max: {
                x: model.vertices[offsetVertexIndex].x,
                y: model.vertices[offsetVertexIndex].y,
                z: model.vertices[offsetVertexIndex].z
              }
            }
            for (let i = 0; i < numVerticesInGroup; i++) {
              const vertex = model.vertices[offsetVertexIndex + i]
              if (vertex.x < minMax.min.x) minMax.min.x = vertex.x
              if (vertex.y < minMax.min.y) minMax.min.y = vertex.y
              if (vertex.z < minMax.min.z) minMax.min.z = vertex.z
              if (vertex.x > minMax.max.x) minMax.max.x = vertex.x
              if (vertex.y > minMax.max.y) minMax.max.y = vertex.y
              if (vertex.z > minMax.max.z) minMax.max.z = vertex.z
              vertexBuffer.writeFloatLE(vertex.x, i * 12)
              vertexBuffer.writeFloatLE(vertex.y, i * 12 + 4)
              vertexBuffer.writeFloatLE(vertex.z, i * 12 + 8)
            }
            allBuffers.push(vertexBuffer)
            numBuffersCreated++
            const vertexAccessorIndex = numBuffersCreated - 1
            gltf.accessors.push({
              bufferView: vertexAccessorIndex,
              byteOffset: 0,
              type: 'VEC3',
              componentType: COMPONENT_TYPE.FLOAT,
              count: numVerticesInGroup,
              min: [minMax.min.x, minMax.min.y, minMax.min.z],
              max: [minMax.max.x, minMax.max.y, minMax.max.z]
            })
            // console.log('min max here', vertexAccessorIndex, minMax)
            gltf.bufferViews.push({
              buffer: 0,
              byteLength: vertexBuffer.length,
              byteStride: 12, // 12 bytes per vertex
              target: ARRAY_BUFFER
            })

            // 3. create "normal" js Buffer + gltf bufferView + gltf accessor
            let normalAccessorIndex = -1
            if (model.numNormals > 0) {
              const numNormals = flattenedNormals.length
              const normalBuffer = Buffer.alloc(numNormals * 3 * 4) // 3 floats per normal, 4 bytes per float
              for (let i = 0; i < numNormals; i++) {
                const normal = flattenedNormals[i]
                normalBuffer.writeFloatLE(normal.x, i * 12)
                normalBuffer.writeFloatLE(normal.y, i * 12 + 4)
                normalBuffer.writeFloatLE(normal.z, i * 12 + 8)
              }
              allBuffers.push(normalBuffer)
              numBuffersCreated++
              normalAccessorIndex = numBuffersCreated - 1
              gltf.accessors.push({
                bufferView: normalAccessorIndex,
                byteOffset: 0,
                type: 'VEC3',
                componentType: COMPONENT_TYPE.FLOAT,
                count: numNormals
              })
              gltf.bufferViews.push({
                buffer: 0,
                byteLength: normalBuffer.length,
                byteStride: 12, // 12 bytes per normal
                target: ARRAY_BUFFER
              })
            }
            function SRGBToLinear (c) {
              return c < 0.04045
                ? c * 0.0773993808
                : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
            }

            function LinearToSRGB (c) {
              return c < 0.0031308
                ? c * 12.92
                : 1.055 * Math.pow(c, 0.41666) - 0.055
            }
            // 4. create "vertex color" js Buffer + gltf bufferView + gltf accessor
            const numVertexColors = numVerticesInGroup
            const vertexColorBuffer = Buffer.alloc(numVertexColors * 4 * 4) // 4 floats per vertex, 4 bytes per float
            for (let i = 0; i < numVertexColors; i++) {
              const vertexColor = model.vertexColors[i]
              // TODO: Consider change the color space here to the colors are more as expected
              vertexColor.r = SRGBToLinear(vertexColor.r / 255.0)
              vertexColor.g = SRGBToLinear(vertexColor.g / 255.0)
              vertexColor.b = SRGBToLinear(vertexColor.b / 255.0)
              vertexColor.a = vertexColor.a / 255.0
              // vertexColor.r = 0
              // vertexColor.g = 0
              // vertexColor.b = 0
              // vertexColor.a = 255
              vertexColorBuffer.writeFloatLE(vertexColor.r, i * 16)
              vertexColorBuffer.writeFloatLE(vertexColor.g, i * 16 + 4)
              vertexColorBuffer.writeFloatLE(vertexColor.b, i * 16 + 8)
              vertexColorBuffer.writeFloatLE(vertexColor.a, i * 16 + 12)
              // console.log('vertexColor', vertexColor)
            }

            allBuffers.push(vertexColorBuffer)
            numBuffersCreated++
            const vertexColorAccessorIndex = numBuffersCreated - 1
            gltf.accessors.push({
              bufferView: vertexColorAccessorIndex,
              byteOffset: 0,
              type: 'VEC4',
              componentType: COMPONENT_TYPE.FLOAT,
              count: numVertexColors
            })
            gltf.bufferViews.push({
              buffer: 0,
              byteLength: vertexColorBuffer.length,
              byteStride: 16, // 16 bytes per vertexColor
              target: ARRAY_BUFFER
            })

            // 5. create "texture coord" js Buffer + gltf bufferView + gltf accessor
            let materialIndex = 0 // will change to texture-based material index below if needed
            let textureCoordAccessorIndex = 0 // will be populated in the loop below
            if (includeTextures) {
              if (polygonGroup.isTextureUsed) {
                const numTextureCoords = numVerticesInGroup
                const textureCoordBuffer = Buffer.alloc(
                  numTextureCoords * 2 * 4
                ) // 2 floats per texture coord, 4 bytes per float
                for (let i = 0; i < numTextureCoords; i++) {
                  const textureCoord =
                    model.textureCoordinates[offsetTextureCoordinateIndex + i]

                  let u = textureCoord.x
                  let v = modelType === ModelType.BATTLE ? -textureCoord.y : textureCoord.y // battle model textures are upside down

                  if (u >= 0.999) {
                    u = u - Math.floor(u)
                  }
                  if (v >= 0.999) {
                    v = v - Math.floor(v)
                  }
                  textureCoordBuffer.writeFloatLE(u, i * 8)
                  textureCoordBuffer.writeFloatLE(v, i * 8 + 4)
                }
                allBuffers.push(textureCoordBuffer)
                numBuffersCreated++
                textureCoordAccessorIndex = numBuffersCreated - 1
                gltf.accessors.push({
                  bufferView: textureCoordAccessorIndex,
                  byteOffset: 0,
                  type: 'VEC2',
                  componentType: COMPONENT_TYPE.FLOAT,
                  count: numTextureCoords
                })
                gltf.bufferViews.push({
                  buffer: 0,
                  byteLength: textureCoordBuffer.length,
                  byteStride: 8, // 8 bytes per textureCoord
                  target: ARRAY_BUFFER
                })
                const textureIndex =
                  gltfTextureIndexOffset + polygonGroup.textureIndex

                // console.log('gltfTextureIndexOffset + polygonGroup.textureIndex', gltfTextureIndexOffset, polygonGroup.textureIndex, textureIndex)
                // material[0] = non-textured, material[1] = textured[0], material[2] = textured[1], ...
                materialIndex = textureIndex + 1
              }
            }

            // finally, add the mesh primitive for this polygonGroup
            const primitive = {
              attributes: {
                POSITION: vertexAccessorIndex,
                // "NORMAL" will be set later below if appropriate
                COLOR_0: vertexColorAccessorIndex
                // "TEXCOORD_0" will be set later below if appropriate
              },
              indices: polygonVertexIndexAccessorIndex,
              mode: 4, // triangles
              material: materialIndex
              // 'extras': {pFileCount} // Unfortunately, the current GLTF loader doesn't add extras -> userData in primitives, add in parent instead
            }
            if (model.numNormals > 0) {
              primitive.attributes.NORMAL =
                model.numNormals > 0 ? normalAccessorIndex : undefined
            }
            if (includeTextures) {
              primitive.attributes.TEXCOORD_0 = polygonGroup.isTextureUsed
                ? textureCoordAccessorIndex
                : undefined
            }
            if (includeTextures && polygonGroup.isTextureUsed) {
              delete primitive.attributes.COLOR_0
            }

            mesh.primitives.push(primitive)
          } // end looping through polygonGroups for this bone

          // model.hundreds.length <= mesh.primitives.length IS ALWAYS TRUE
          // TODO: Assumption that hundreds[i] correlates to mesh.primitives[i].material
          // Still a lot to do here, look at fiba -> https://youtu.be/1U39x6jNKoI?t=66
          // It might not be additive etc, it might just be an opacity level, also, the meshes don't match perfectly
          // Will look at another day
          for (let hi = 0; hi < model.hundreds.length; hi++) {
            const hundred = model.hundreds[hi]
            const mat = gltf.materials[mesh.primitives[hi].material]
            if (hundred.blendMode === 0) {
              if (!mat.extras) {
                mat.extras = {}
              }
              // mat.extras.BlendType = 'MultiplyBlending'
              // console.log(hrcId, 'Blend - 0 - MultiplyBlending ?', hundred.srcBlend, hundred.dstBlend)
            } else if (hundred.blendMode === 1) {
              if (!mat.extras) {
                mat.extras = {}
              }
              // mat.extras.BlendType = 'MultiplyBlending'
              // console.log(hrcId, 'Blend - 1 - MultiplyBlending ?', hundred.srcBlend, hundred.dstBlend)
            } else if (hundred.blendMode === 3) {
              if (!mat.extras) {
                mat.extras = {}
              }
              // mat.extras.BlendType = 'AdditiveBlending'
              // console.log(hrcId, 'Blend - 3 - AdditiveBlending ✓', hundred.srcBlend, hundred.dstBlend)
            } else if (hundred.blendMode === 4) {
              // console.log('Blend - 4 - NormalBlending')
            } else {
              // console.log(hrcId, `Blend - ${hundred.blendMode} - ????`)
            }
          }

          gltfTextureIndexOffset = gltf.textures ? gltf.textures.length : 0
        }
      } // end if bone.rsdBaseFilename (if bone has a mesh)

      let boneTranslation = [0, 0, 0]
      if (bone.parent !== 'root' && bone.name !== 'LOCATION') {
        // console.log('parentBone', parentBone)
        boneTranslation = [0, 0, -parentBone.length] // translate in negZ direction (away from parent)
      }
      if (bone.name === 'WEAPON') {
        // boneTranslation = [ 0, 0, -76];
        boneTranslation = [0, 0, 0]
        // boneTranslation = [ firstWeaponFrame.rootTranslation.x , firstWeaponFrame.rootTranslation.y, firstWeaponFrame.rootTranslation.z ];
      }
      let boneRotation = null
      if (bone.name === 'WEAPON') {
        boneRotation = firstWeaponFrame.boneRotations[0]
      }
      if (bone.name === 'LOCATION') {
        // Do nothing
      } else if (firstFrame.boneRotations) {
        boneRotation = firstFrame.boneRotations[bone.boneIndex]
      }
      // models with "zero" bones won't have any bone rotations, but they are effectively a single bone with no rotation
      if (!boneRotation) {
        boneRotation = { x: 0, y: 0, z: 0 }
      }

      /* if (bone.name === "WEAPON")
      {
        boneRotation = {x:0, y:0, z:0};
      } */
      const quat = rotationToQuaternion(
        toRadians(boneRotation.x),
        toRadians(boneRotation.y),
        toRadians(boneRotation.z),
        rotationOrder
      )
      // 1 node per bone
      const node = {
        name: hrcId + 'Bone' + bone.boneIndex + '_' + bone.name,
        children: [], // populate later, after all nodes have been created
        translation: boneTranslation,
        rotation: [quat.x, quat.y, quat.z, quat.w],
        scale: [1, 1, 1],
        mesh: meshIndex
      }
      if (currentPFileCount.length > 0) {
        // For KAWAI SBOBJ - Unfortunately, the current GLTF loader doesn't add extras -> userData in primitives, add in parent instead
        node.extras = { childBoneRefs: currentPFileCount }
      }
      gltf.nodes.push(node)
    } // end looping through skeleton.bones

    // build the "skeleton tree" by setting each node's children array, as required by glTF spec
    for (const bone of skeleton.bones) {
      const nodeIndex = bone.boneIndex + 2 // node0=RootContainer, node1=BoneRoot, node2=Bone0, node3=Bone1, etc.
      if (bone.parent === 'root') {
        const parentNode = gltf.nodes[1]
        parentNode.children.push(nodeIndex)
      } else {
        const parentBone = boneMap[bone.parent]
        const parentNode = gltf.nodes[parentBone.boneIndex + 2]
        parentNode.children.push(nodeIndex)
      }
    }

    // Remove empty children arrays to avoid GLTF validation errors
    for (const node of gltf.nodes) {
      if (node.children && node.children.length === 0) {
        delete node.children
      }
    }

    // Remove empty arrays to avoid GLTF validation errors
    if (gltf.samplers && gltf.samplers.length === 0) {
      delete gltf.samplers
    }
    if (gltf.images && gltf.images.length === 0) {
      delete gltf.images
    }
    if (gltf.textures && gltf.textures.length === 0) {
      delete gltf.textures
    }

    // animations - only add if there are animations to include
    if (animationDataList && animationDataList.length > 0) {
      gltf.animations = []
    }
    // console.log("body anims = " + animationDataList.length + " and weaponanims = " + weaponAnimationDataList.length);
    // for (let i=0; i<weaponAnimationDataList.length; i++) { //cycling through weapon anims for now
    // for (let i=0; i<3; i++) {
    for (let i = 0; i < animationDataList.length; i++) {
      const animationData = animationDataList[i]
      const weaponAnimationData = weaponAnimationDataList[i]

      // Remove this, as the animation counts need to match what the game expects,
      // Even if they are empty
      // if (!animationData.numBones) {
      // console.log('WARN: Skipping empty animation')
      // if (weaponAnimationData.numBones = null)
      // {
      // console.log('EMPTY WEAPON ANIM')
      // }
      // continue
      // }
      const animationName = 'body-' + i
      // Only add animations if the array exists
      if (gltf.animations) {
        gltf.animations.push({
          name: animationName,
          channels: [],
          samplers: []
        })
      }
      // console.log('DEBUG: animationName=' + animationName)
      const animationIndex = gltf.animations.length - 1

      const numFrames = animationData.numFrames | 0

      // create buffer to store start-time/end-time pair(s)
      // let numTimeMarkers = 2 * numFrames // start time and end time per frame
      const startAndEndTimeBuffer = Buffer.alloc(numFrames * 2 * 4) // 2 time markers per frame, 4 bytes per float time
      for (let f = 0; f < numFrames; f++) {
        const startTime = f / FRAMES_PER_SECOND
        const endTime = (f + 1) / FRAMES_PER_SECOND
        startAndEndTimeBuffer.writeFloatLE(startTime, f * 8)
        startAndEndTimeBuffer.writeFloatLE(endTime, f * 8 + 4)
      }
      allBuffers.push(startAndEndTimeBuffer)
      numBuffersCreated++
      const startAndEndTimeAccessorIndex = numBuffersCreated - 1 // will assign to sampler.input
      gltf.accessors.push({
        bufferView: startAndEndTimeAccessorIndex,
        byteOffset: 0,
        type: 'SCALAR',
        componentType: COMPONENT_TYPE.FLOAT,
        count: numFrames * 2 // 2 time markers per frame
      })
      gltf.bufferViews.push({
        buffer: 0,
        byteLength: startAndEndTimeBuffer.length,
        // "byteStride": 4, // 4 bytes per float time
        target: ARRAY_BUFFER
      })

      for (
        let boneIndex = 0;
        boneIndex <= animationData.numBones;
        boneIndex++
      ) {
        // create buffer for animation frame data for this bone
        const boneFrameDataBuffer = Buffer.alloc(numFrames * 2 * 4 * 4) // 2 rotations per frame (start and end), 4 floats per rotation, 4 bytes per float
        const boneTranslationFrameDataBuffer = Buffer.alloc(
          numFrames * 2 * 3 * 4
        ) // 2 translations per frame (start and end), 3 floats per translation, 4 bytes per float
        let frameData = null
        let boneRotation = null
        let boneTranslation = {} // for weapons
        let boneIsWeapon = false

        if (boneIndex === animationData.numBones && !skeleton.hasWeapon) {
          continue
        }

        const frameRootTranslationBuffer = Buffer.alloc(numFrames * 2 * 3 * 4) // 2 translation per frame (start and end), 3 floats per translation, 4 bytes per float
        const frameRootRotationBuffer = Buffer.alloc(numFrames * 2 * 4 * 4)
        const zList = []

        for (let f = 0; f < numFrames; f++) {
          if (boneIndex < animationData.numBones) {
            frameData = animationData.animationFrames[f]
            // Safety check for undefined frame data
            if (!frameData) {
              boneRotation = { x: 0, y: 0, z: 0 }
              boneTranslation = { x: 0, y: 0, z: 0 }
            } else {
              boneRotation = frameData.boneRotations[boneIndex]
              // Safety check for undefined bone rotation
              if (!boneRotation) {
                boneRotation = { x: 0, y: 0, z: 0 }
              }
              boneTranslation = {
                x: frameData.rootTranslation.x,
                y: frameData.rootTranslation.y,
                z: frameData.rootTranslation.z
              }
            }
            boneIsWeapon = false
          } else if (skeleton.hasWeapon) {
            // it's a weapon
            const weaponFrameData = weaponAnimationData.animationFrames[f]
            const rootFrameData = animationData.animationFrames[f]
            
            // Safety checks for undefined frame data
            if (!weaponFrameData || !weaponFrameData.boneRotations || !weaponFrameData.boneRotations[0]) {
              boneRotation = { x: 0, y: 0, z: 0 }
            } else {
              boneRotation = weaponFrameData.boneRotations[0]
              // Safety check for undefined weapon bone rotation
              if (!boneRotation) {
                boneRotation = { x: 0, y: 0, z: 0 }
              }
            }
            boneIsWeapon = true
            const rootTranslation = {
              x: rootFrameData.rootTranslation.x,
              y: rootFrameData.rootTranslation.y,
              z: rootFrameData.rootTranslation.z
            }
            // since we dont't move our model, we need to substract its root rotation from weapon root rotation
            // boneTranslation = { x: weaponFrameData.rootTranslation.x , y: weaponFrameData.rootTranslation.y, z: weaponFrameData.rootTranslation.z };
            boneTranslation = {
              x: weaponFrameData.rootTranslation.x - rootTranslation.x,
              y: -1 * (weaponFrameData.rootTranslation.y - rootTranslation.y),
              z: weaponFrameData.rootTranslation.z - rootTranslation.z
            }
          }

          // TODO - A lot of optimisations should happen here
          // Root translation and rotation only apply to first bone
          if (boneIndex === 0) {
            // console.log('boneIndex', boneIndex)
            // Root translation : START
            const frameDataForRoot = animationData.animationFrames[f]
            const rootTranslation = frameDataForRoot ? frameDataForRoot.rootTranslation : { x: 0, y: 0, z: 0 }
            // console.log('rootTranslation', rootTranslation)

            zList.push(rootTranslation)
            frameRootTranslationBuffer.writeFloatLE(
              rootTranslation.x,
              f * 24 + 0
            )
            frameRootTranslationBuffer.writeFloatLE(
              rootTranslation.y - 13.535284042358398,
              f * 24 + 4
            )
            frameRootTranslationBuffer.writeFloatLE(
              -rootTranslation.z - 0.07706927508115768,
              f * 24 + 8
            )

            frameRootTranslationBuffer.writeFloatLE(
              rootTranslation.x,
              f * 24 + 12
            )
            frameRootTranslationBuffer.writeFloatLE(
              rootTranslation.y - 13.535284042358398,
              f * 24 + 16
            )
            frameRootTranslationBuffer.writeFloatLE(
              -rootTranslation.z - 0.07706927508115768,
              f * 24 + 20
            )

            allBuffers.push(frameRootTranslationBuffer)
            numBuffersCreated++

            const rootTranslationFrameDataAccessorIndex = numBuffersCreated - 1 // will assign to sampler.output
            gltf.accessors.push({
              bufferView: rootTranslationFrameDataAccessorIndex,
              byteOffset: 0,
              type: 'VEC3',
              componentType: COMPONENT_TYPE.FLOAT,
              count: numFrames * 2 // 2 rotations per frame
            })
            gltf.bufferViews.push({
              buffer: 0,
              byteLength: frameRootTranslationBuffer.length,
              target: ARRAY_BUFFER
            })
            gltf.animations[animationIndex].samplers.push({
              input: startAndEndTimeAccessorIndex,
              interpolation: 'LINEAR',
              output: rootTranslationFrameDataAccessorIndex
            })
            const nodeIndex = 0 // node0=RootContainer, node1=BoneRoot, node2=Bone0, node3=Bone1, etc.
            const samplerIndexRootTranslation =
              gltf.animations[animationIndex].samplers.length - 1
            gltf.animations[animationIndex].channels.push({
              sampler: samplerIndexRootTranslation,
              target: {
                node: nodeIndex,
                path: 'translation'
              }
            })
            // Root translation : END

            // Root rotation : START
            const frameDataForRootRotation = animationData.animationFrames[f]
            const rootRotation = frameDataForRootRotation ? frameDataForRootRotation.rootRotation : { x: 0, y: 0, z: 0 }
            // console.log('rootRotation', rootRotation)
            const quatRoot = rotationToQuaternion(
              toRadians(rootRotation.x),
              toRadians(-rootRotation.y),
              toRadians(rootRotation.z),
              rotationOrder
            )
            // write rotation value for "start of frame"
            frameRootRotationBuffer.writeFloatLE(quatRoot.x, f * 32 + 0)
            frameRootRotationBuffer.writeFloatLE(quatRoot.y, f * 32 + 4)
            frameRootRotationBuffer.writeFloatLE(quatRoot.z, f * 32 + 8)
            frameRootRotationBuffer.writeFloatLE(quatRoot.w, f * 32 + 12)
            // write rotation value for "end of frame" (TODO: use "f+1" rotation for smoother animations)
            frameRootRotationBuffer.writeFloatLE(quatRoot.x, f * 32 + 16)
            frameRootRotationBuffer.writeFloatLE(quatRoot.y, f * 32 + 20)
            frameRootRotationBuffer.writeFloatLE(quatRoot.z, f * 32 + 24)
            frameRootRotationBuffer.writeFloatLE(quatRoot.w, f * 32 + 28)
            allBuffers.push(frameRootRotationBuffer)
            numBuffersCreated++

            const rootRotationFrameDataAccessorIndex = numBuffersCreated - 1 // will assign to sampler.output
            gltf.accessors.push({
              bufferView: rootRotationFrameDataAccessorIndex,
              byteOffset: 0,
              type: 'VEC4',
              componentType: COMPONENT_TYPE.FLOAT,
              count: numFrames * 2 // 2 rotations per frame
            })
            gltf.bufferViews.push({
              buffer: 0,
              byteLength: frameRootRotationBuffer.length,
              target: ARRAY_BUFFER
            })
            gltf.animations[animationIndex].samplers.push({
              input: startAndEndTimeAccessorIndex,
              interpolation: 'LINEAR',
              output: rootRotationFrameDataAccessorIndex
            })
            // nodeIndex = 0 // node0=RootContainer, node1=BoneRoot, node2=Bone0, node3=Bone1, etc.
            const samplerIndexRootRotation =
              gltf.animations[animationIndex].samplers.length - 1
            gltf.animations[animationIndex].channels.push({
              sampler: samplerIndexRootRotation,
              target: {
                node: nodeIndex,
                path: 'rotation'
              }
            })
            // Root rotation : END
          }

          const quat = rotationToQuaternion(
            toRadians(boneRotation.x),
            toRadians(boneRotation.y),
            toRadians(boneRotation.z),
            rotationOrder
          )

          // write rotation value for "start of frame"
          boneFrameDataBuffer.writeFloatLE(quat.x, f * 32 + 0)
          boneFrameDataBuffer.writeFloatLE(quat.y, f * 32 + 4)
          boneFrameDataBuffer.writeFloatLE(quat.z, f * 32 + 8)
          boneFrameDataBuffer.writeFloatLE(quat.w, f * 32 + 12)
          // write rotation value for "end of frame" (TODO: use "f+1" rotation for smoother animations)
          boneFrameDataBuffer.writeFloatLE(quat.x, f * 32 + 16)
          boneFrameDataBuffer.writeFloatLE(quat.y, f * 32 + 20)
          boneFrameDataBuffer.writeFloatLE(quat.z, f * 32 + 24)
          boneFrameDataBuffer.writeFloatLE(quat.w, f * 32 + 28)

          if (skeleton.hasWeapon) {
            // write translation value for "start of frame"
            boneTranslationFrameDataBuffer.writeFloatLE(
              boneTranslation.x,
              f * 24 + 0
            )
            boneTranslationFrameDataBuffer.writeFloatLE(
              boneTranslation.y,
              f * 24 + 4
            )
            boneTranslationFrameDataBuffer.writeFloatLE(
              boneTranslation.z,
              f * 24 + 8
            )
            // write translation value for "end of frame"
            boneTranslationFrameDataBuffer.writeFloatLE(
              boneTranslation.x,
              f * 24 + 12
            )
            boneTranslationFrameDataBuffer.writeFloatLE(
              boneTranslation.y,
              f * 24 + 16
            )
            boneTranslationFrameDataBuffer.writeFloatLE(
              boneTranslation.z,
              f * 24 + 20
            )
          }
        } // End of frame loop
        allBuffers.push(boneFrameDataBuffer)
        numBuffersCreated++
        const boneFrameDataAccessorIndex = numBuffersCreated - 1 // will assign to sampler.output
        gltf.accessors.push({
          bufferView: boneFrameDataAccessorIndex,
          byteOffset: 0,
          type: 'VEC4',
          componentType: COMPONENT_TYPE.FLOAT,
          count: numFrames * 2 // 2 rotations per frame
        })
        gltf.bufferViews.push({
          buffer: 0,
          byteLength: boneFrameDataBuffer.length,
          target: ARRAY_BUFFER
        })
        gltf.animations[animationIndex].samplers.push({
          input: startAndEndTimeAccessorIndex,
          interpolation: 'LINEAR',
          output: boneFrameDataAccessorIndex
        })
        const nodeIndex = boneIndex + 2 // node0=RootContainer, node1=BoneRoot, node2=Bone0, node3=Bone1, etc.
        let samplerIndex = gltf.animations[animationIndex].samplers.length - 1
        if (!boneIsWeapon) {
          gltf.animations[animationIndex].channels.push({
            sampler: samplerIndex,
            target: {
              node: nodeIndex,
              path: 'rotation'
            }
          })
        } else {
          // we also need to add rotation and translation animation of weapon
          gltf.animations[animationIndex].channels.push({
            sampler: samplerIndex,
            target: {
              node: nodeIndex,
              path: 'rotation'
            }
          })
          allBuffers.push(boneTranslationFrameDataBuffer)
          numBuffersCreated++
          const boneTranslationFrameDataAccessorIndex = numBuffersCreated - 1 // will assign to sampler.output
          gltf.accessors.push({
            bufferView: boneTranslationFrameDataAccessorIndex,
            byteOffset: 0,
            type: 'VEC3',
            componentType: COMPONENT_TYPE.FLOAT,
            count: numFrames * 2 // 2 translations per frame
          })
          gltf.bufferViews.push({
            buffer: 0,
            byteLength: boneTranslationFrameDataBuffer.length,
            target: ARRAY_BUFFER
          })
          gltf.animations[animationIndex].samplers.push({
            input: startAndEndTimeAccessorIndex,
            interpolation: 'LINEAR',
            output: boneTranslationFrameDataAccessorIndex
          })

          samplerIndex = gltf.animations[animationIndex].samplers.length - 1

          gltf.animations[animationIndex].channels.push({
            sampler: samplerIndex,
            target: {
              node: nodeIndex,
              path: 'translation'
            }
          })
        }
      }
    }

    // note: some skeletons have zero bones
    if (gltf.bufferViews.length > 0) {
      // We wait until now to set the byteOffset for all buffer views, because that's
      // the easiest way to do it, given the dynamic nature of which buffers we use.
      const numBufferViews = gltf.bufferViews.length
      gltf.bufferViews[0].byteOffset = 0
      for (let i = 1; i < numBufferViews; i++) {
        gltf.bufferViews[i].byteOffset =
          gltf.bufferViews[i - 1].byteOffset +
          gltf.bufferViews[i - 1].byteLength
      }

      // TODO: set min and max for all accessors to help engines optimize

      // Helper function to add padding for 4-byte alignment
      const addPadding = (buffer) => {
        const remainder = buffer.length % 4
        if (remainder === 0) return buffer
        const padding = Buffer.alloc(4 - remainder, 0)
        return Buffer.concat([buffer, padding])
      }

      // Ensure all buffers are 4-byte aligned before concatenating
      const alignedBuffers = allBuffers.map(addPadding)
      
      // Recalculate buffer view offsets after padding
      let currentOffset = 0
      for (let i = 0; i < gltf.bufferViews.length; i++) {
        gltf.bufferViews[i].byteOffset = currentOffset
        currentOffset += alignedBuffers[i].length
      }

      // we can finally add the buffer (containing all buffer views) to gltf because we know the total size
      const combinedBuffer = Buffer.concat(alignedBuffers)
      gltf.buffers.push({
        byteLength: combinedBuffer.length,
        uri: binFilename
      })

      // create *.bin file
      const binFilenameFull = outputDirectory + '/' + binFilename
      fs.writeFileSync(binFilenameFull, combinedBuffer)
      // console.log('Wrote: ' + binFilenameFull)
    }

    // console.log('gltf.animations', gltf.animations[0])
    // create *.gltf file
    const gltfFilenameFull = outputDirectory + '/' + gltfFilename
    fs.writeFileSync(gltfFilenameFull, JSON.stringify(gltf, null, 2))
    // console.log('Wrote: ' + gltfFilenameFull)
  } // end function translateFF7FieldHrcToGltf

  ensureTextureExists (
    outputDirectory,
    texDirectory,
    textureFile,
    texturePath,
    textureFlip
  ) {
    const texPath = `${texDirectory}/${textureFile}` // Can be .TEX of .tex, fs sorts this out anyway
    const pngPath = `${outputDirectory}/${texturePath}`

    // It looks as though battle textures need to be flipped, we can't flip them back (easily) with the current GLTFLoader
    return new TexFile()
      .loadTexFileFromPath(texPath)
      .saveAsPng(pngPath, textureFlip)
  }
}

module.exports = { FF7GltfTranslator, ModelType }
