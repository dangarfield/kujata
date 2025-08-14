const fs = require('fs-extra')
const path = require('path')
const cliProgress = require('cli-progress')
const chalk = require('chalk')
const {
  processOpForSound,
  writeSoundList
} = require('../ff7-asset-loader/sound-list')
const {
  writeOpCodeUsages,
  processOpCodeUsages
} = require('../ff7-asset-loader/op-codes-usages')
const {
  processOpForSceneGraph,
  createInitialSceneGraphNodes,
  writeSceneGraph,
  processGatewaysForSceneGraph
} = require('../ff7-asset-loader/scene-graph')
const { sleep, KUJATA_ROOT } = require('../ff7-asset-loader/helper')
const {
  generateModelUsage,
  processModelUsage,
  writeModelUsage
} = require('../ff7-asset-loader/model-usage')
const {
  generateBattleCameraUsageMetadata
} = require('../ff7-asset-loader/battle-camera-usage')

/*
 Move metadata files:
    chapters.json
    skeleton-names-battle.json
    skeleton-names-field.json
    movie-list.json
    music-names.json
    op-categories.json
    op-metadata.json

Generate:
    scene-graph.js
    op-code-usages/98.json etc
    sound-list.json
    field-model-metadata.json
    field-animations-metadata.json
    field-model-standing-animation.json

 field-id-to-world-map-coords.json ?? Could just put this in wm module?
 /data/wm/world_us.lgp/field.tbl.json ?? Can't remember what this is

Not sure yet:
    ifalna.json - Don't need anymore
 ff7-database.json
 ff7-battle-database.json
*/

const copyFiles = (config, progress) => {
  const filesToCopy = [
    'chapters.json',
    'skeleton-names-battle.json',
    'skeleton-names-field.json',
    'skeleton-names-world.json',
    'movie-list.json',
    'music-names.json',
    'op-categories.json',
    'op-metadata.json',
    'battle-camera-op-metadata.json',
    'action-sequence-metadata-player.json',
    'action-sequence-metadata-op.json'
  ]
  progress.start(filesToCopy.length, 0, {
    title: 'Copying files     ',
    current: filesToCopy[0]
  })
  const targetDir = path.join(config.kujataDataDirectory, 'metadata')
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir)
  }

  for (const [i, fileToCopy] of filesToCopy.entries()) {
    const source = path.join(KUJATA_ROOT, 'metadata', fileToCopy)
    const target = path.join(config.kujataDataDirectory, 'metadata', fileToCopy)
    fs.copyFileSync(source, target)
    progress.increment({
      current: filesToCopy.length < i + 1 ? ' ' : filesToCopy[i + 1]
    })
  }
}
const generateFieldData = async (config, progress) => {
  const fieldFiles = fs
    .readdirSync(
      path.join(config.kujataDataDirectory, 'data', 'field', 'flevel.lgp')
    )
    .filter(f => f.endsWith('.json') && f !== 'maplist.json')
  progress.start(fieldFiles.length, 0, {
    title: 'Aggregating data  ',
    current: fieldFiles[0]
  })
  //   console.log('generateFieldData', fieldFiles)
  const opCodeUsages = {}
  const soundList = []
  const sceneGraph = createInitialSceneGraphNodes(config)
  const modelUsage = generateModelUsage()

  await sleep(100) // Allow progress to show
  for (const [i, fieldFile] of fieldFiles.entries()) {
    const field = fs.readJSONSync(
      path.join(
        config.kujataDataDirectory,
        'data',
        'field',
        'flevel.lgp',
        fieldFile
      )
    )
    const fieldName = fieldFile.replace('.json', '')
    // console.log('field', parseInt(fieldIndex) + 1, 'of', fieldFiles.length, '-', field.script ? field.script.header.name : '????? unknown')
    if (field.script) {
      for (const entity of field.script.entities) {
        for (const script of entity.scripts) {
          for (let i = 0; i < script.ops.length; i++) {
            const op = script.ops[i]
            if (op && op.raw) {
              processOpCodeUsages(opCodeUsages, op, field, entity, script, i)
              processOpForSound(field, entity, script, i, op, soundList)
              processOpForSceneGraph(
                sceneGraph,
                fieldName,
                op,
                field.script.dialogStrings
              )
              // TODO - Standing animations and other field model meta?
            }
          }
        }
      }
      processGatewaysForSceneGraph(
        sceneGraph,
        fieldName,
        field.triggers.gateways
      )
    }
    if (field.model && field.model.modelLoaders) {
      processModelUsage(modelUsage, fieldName, field.model.modelLoaders)
    }
    progress.increment({
      current: fieldFile.length < i + 1 ? ' ' : fieldFiles[i + 1]
    })
  }
  writeOpCodeUsages(config, opCodeUsages)
  writeSoundList(config, soundList)
  writeSceneGraph(config, sceneGraph)
  writeModelUsage(config, modelUsage)
}
const extractMetadata = async config => {
  //   console.log('extractMetadata: START')

  const multibar = new cliProgress.MultiBar(
    {
      format:
        chalk.cyan('🛠️   {title}: ') +
        chalk.cyan('{bar}') +
        ' {percentage}% || {value}/{total} ' +
        chalk.cyan('{current}'),
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    },
    cliProgress.Presets.shades_grey
  )

  const progressCopy = multibar.create(1, 0, {
    title: 'Copying files     ',
    current: ''
  })

  const progressFieldData = multibar.create(1, 0, {
    title: 'Aggregating data  ',
    current: ''
  })

  copyFiles(config, progressCopy)
  await generateFieldData(config, progressFieldData)
  generateBattleCameraUsageMetadata(config)
  multibar.stop()
  console.log(chalk.green('🚀  Successfully extracted metadata'))
}
module.exports = { extractMetadata }
