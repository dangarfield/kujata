const fs = require('fs')
const path = require('path')
const { FF7GltfTranslator, ModelType } = require('../ff7-gltf/ff7-to-gltf.js')
const chalk = require('chalk')
const cliProgress = require('cli-progress')
const FF7FieldAnimationTranslator = require('../ff7-gltf/ff7-field-animation-translator.js')
const { KUJATA_ROOT } = require('../ff7-asset-loader/helper.js')

const getAllModelsList = (config, modelType) => {
  switch (modelType) {
    case ModelType.BATTLE:
      return fs
        .readdirSync(path.join(config.unlgpDirectory, 'battle.lgp'))
        .filter(f => f.toLowerCase().endsWith('aa'))
    case ModelType.WORLD:
      return fs
        .readdirSync(path.join(config.unlgpDirectory, 'world_us.lgp'))
        .filter(f => f.toLowerCase().endsWith('.hrc'))
        .map(f => f.toLowerCase().replace('.hrc', ''))
    case ModelType.FIELD:
    default:
      return fs
        .readdirSync(path.join(config.unlgpDirectory, 'char.lgp'))
        .filter(f => f.toLowerCase().endsWith('.hrc'))
        .map(f => f.toLowerCase().replace('.hrc', ''))
  }
}

const findMissingFromArray = (sourceArray, targetArray) => {
  const targetSet = new Set(targetArray)
  return sourceArray.filter(item => !targetSet.has(item))
}
const names = {
  field: JSON.parse(
    fs.readFileSync(
      path.join(KUJATA_ROOT, 'metadata', 'skeleton-names-field.json')
    )
  ),
  battle: JSON.parse(
    fs.readFileSync(
      path.join(KUJATA_ROOT, 'metadata', 'skeleton-names-battle.json')
    )
  ),
  world: {} // World models don't have friendly names yet
}

const getName = (model, modelType) => {
  switch (modelType) {
    case ModelType.BATTLE:
      return names.battle[model]
    case ModelType.WORLD:
      return names.world[model] || model // Fallback to model ID if no friendly name
    case ModelType.FIELD:
    default:
      return names.field[model]
  }
}
const extractModels = async (config, models, all, modelType) => {
  const modelsToProcess = all ? getAllModelsList(config, modelType) : models

  // console.log('\n\n allModels', getAllModelsList(config, modelType))
  if (!all) {
    const invalidModels = findMissingFromArray(
      models,
      getAllModelsList(config, modelType)
    )
    if (invalidModels.length > 0) {
      console.log(
        chalk.red(
          `⚠️   Invalid model file - ${invalidModels
            .map(l => chalk.inverse(l))
            .join(', ')}`
        )
      )
      return
    }
  }

  // console.log('extractModels modelsToProcess', modelsToProcess)

  const progressBar = new cliProgress.SingleBar({
    format:
      chalk.cyan('🛠️   Model extraction progress: ') +
      chalk.cyan('{bar}') +
      ' {percentage}% || {value}/{total} Models || Current: ' +
      chalk.cyan('{current}'),
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  })
  progressBar.start(modelsToProcess.length, 0)

  const errors = []
  const success = []
  const gltfTranslator = new FF7GltfTranslator()
  const fieldAnimationTranslator = new FF7FieldAnimationTranslator()

  for (const [i, modelName] of modelsToProcess.entries()) {
    try {
      progressBar.update(i, {
        current: `${modelName} (${getName(modelName, modelType)})`
      })
      await gltfTranslator.translateFF7FieldHrcToGltf(
        config,
        modelName,
        null,
        modelType === ModelType.WORLD ? [] : null, // For world models, use empty array to load all animations
        true,
        modelType
      )

      fieldAnimationTranslator.translateFF7FieldAnimationToGLTF(config, 'gmea')
      // if (i % 2 === 0) throw new Exception()
      success.push(modelName)
    } catch (error) {
      console.error('\n\n', error)
      errors.push(modelName)
    }
    progressBar.increment()
  }
  progressBar.stop()

  if (success.length > 0) {
    console.log(
      chalk.green(
        '🚀  Successfully extracted:',
        success
          .map(
            l =>
              `${chalk.underline(path.basename(l))} (${getName(
                l,
                modelType
              )})`
          )
          .join(', ')
      )
    )
  }
  if (errors.length > 0) {
    console.log(
      chalk.red(
        '⚠️   Error extracting models:',
        errors
          .map(
            l =>
              `${chalk.underline(path.basename(l))} (${getName(
                l,
                modelType
              )})`
          )
          .join(', ')
      )
    )
  }
}

// Legacy function names for backward compatibility
const extractFieldBattleModels = async (config, models, all, isBattleModel) => {
  const modelType = isBattleModel ? ModelType.BATTLE : ModelType.FIELD
  return extractModels(config, models, all, modelType)
}

module.exports = {
  extractModels,
  extractFieldBattleModels // Keep for backward compatibility
}
