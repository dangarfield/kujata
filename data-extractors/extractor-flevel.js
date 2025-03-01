const fs = require('fs-extra')
const LzsDecompressor = require('../tools/lzs/lzs-decompressor.js')
const FLevelLoader = require('../ff7-asset-loader/flevel-loader.js')
const path = require('path')
const {
  ensureMapListExists
} = require('../ff7-asset-loader/map-list-loader.js')
const chalk = require('chalk')
const cliProgress = require('cli-progress')
const { sleep } = require('../ff7-asset-loader/helper.js')

const lzsDecompressor = new LzsDecompressor()

const replacer = function (k, v) {
  /// /if (k == "entitySections") { return undefined; }
  return v
}

const decodeOneMap = (
  flevelLoader,
  config,
  fieldName,
  renderBackgroundLayers
) => {
  const flevel = flevelLoader.loadFLevel(
    config,
    fieldName,
    renderBackgroundLayers
  )
  // console.log('flevel', flevel)
  const outputFilename = path.join(
    config.kujataDataDirectory,
    'data',
    'field',
    'flevel.lgp',
    `${fieldName}.json`
  )
  fs.writeFileSync(outputFilename, JSON.stringify(flevel, replacer, 2))
  // console.log('Wrote: ' + outputFilename)
  return fieldName
}
const PROGRESS_FILE_NAME = 'test-flevel-loader-progress.json'
const getCompletionProgress = () => {
  if (!fs.existsSync(PROGRESS_FILE_NAME)) { fs.writeJsonSync(PROGRESS_FILE_NAME, []) }
  return fs.readJsonSync(PROGRESS_FILE_NAME)
}
const updateCompletionProgress = file => {
  const progress = getCompletionProgress()
  progress.push(file)
  fs.writeJsonSync(PROGRESS_FILE_NAME, progress)
}
const decodeAllMaps = async maps => {
  await flevelLoader.ensureTexturesExist(config)
  const errors = []
  const progress = getCompletionProgress()
  for (let i = 0; i < maps.length; i++) {
    const fieldName = maps[i]

    const inputFile = config.inputFieldFLevelDirectory + '/' + fieldName
    const exists = fs.existsSync(inputFile)
    const complete = progress.includes(fieldName)
    console.log(
      `Map ${i + 1} of ${maps.length} -> ${fieldName}`,
      exists,
      complete
    )
    if (exists && fieldName !== '' && !complete) {
      try {
        decodeOneMap(fieldName)
        updateCompletionProgress(fieldName)
      } catch (error) {
        console.log('error', error)
        errors.push(fieldName)
      }
    }
  }
  return errors
}

const problemMaps = [
  'blin67_4',
  'nivgate2',
  'nivgate3',
  'nivl_e3',
  'fr_e',
  'junair',
  'gldst',
  'gldinfo',
  'cosmo',
  'cosmo2',
  'rckt3',
  'kuro_11',
  'hyoumap',
  'gaiin_6',
  'gaiin_7',
  'trnad_52',
  'md_e1',
  'lastmap',
  'junone22',
  'rckt32',
  'jtemplc'
]

const init = async () => {
  // flevelLoader.ensureTexturesExist(config)

  console.log('Decode all Maps -> All', await decodeAllMaps(mapList)) // Note: a test-flevel-loader-progress.json is created, delete if required
  // console.log('Decode all Maps -> Errors All', decodeAllMaps(problemMaps))
  // console.log('Decode one', decodeOneMap('nmkin_1'))
  // console.log('Decode one', decodeOneMap('md1stin'))

  // console.log('Decode one', decodeOneMap('md1_1'))
  // console.log('Decode one', decodeOneMap('md1_2'))
  // console.log('Decode one', decodeOneMap('jail1'))
  // console.log('Decode one', decodeOneMap('yougan2'))
  // console.log('Decode one', decodeOneMap('mds7st2'))
  // console.log('Decode one', decodeOneMap('nrthmk'))
  // console.log('Decode one', decodeOneMap('ancnt3'))
  // console.log('Decode one', decodeOneMap('ujunon1'))
  // console.log('Decode one', decodeOneMap('ujunon2'))
  // console.log('Decode one', decodeOneMap('hill'))
  // console.log('Decode one', decodeOneMap('mds6_22'))

  // generateOpCodeUsages(config)
}
// init()
const findMissingFromArray = (sourceArray, targetArray) => {
  const targetSet = new Set(targetArray)
  return sourceArray.filter(item => !targetSet.has(item))
}

const extractFlevel = async (
  config,
  fields,
  all,
  renderBackgroundLayers,
  resumeRender
) => {
  // console.log('extractFlevel: ', config, fields, all, renderBackgroundLayers)
  const mapList = ensureMapListExists(config)
  const availableFields = fs
    .readdirSync(path.join(config.unlgpDirectory, 'flevel.lgp'))
    .filter(f => !f.includes('.'))
    .filter(f => f !== 'maplist')
  // console.log('availableFields', availableFields)
  if (!all) {
    const invalidFields = findMissingFromArray(fields, mapList)
    if (invalidFields.length > 0) {
      console.log(
        chalk.red(
          `⚠️   Invalid field file - ${invalidFields
            .map(l => chalk.inverse(l))
            .join(', ')}`
        )
      )
      return
    }
    const unavailableFields = findMissingFromArray(fields, availableFields)
    if (unavailableFields.length > 0) {
      console.log(
        chalk.red(
          `⚠️   Unavailable field file - ${unavailableFields
            .map(l => chalk.inverse(l))
            .join(', ')}`
        )
      )
      return
    }
  }
  const fieldsToProcess = all ? availableFields : fields

  const progressBar = new cliProgress.SingleBar({
    format:
      chalk.cyan('🛠️   Field extraction progress: ') +
      chalk.cyan('{bar}') +
      ' {percentage}% || {value}/{total} Fields || Current: ' +
      chalk.cyan('{current}'),
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  })
  progressBar.start(fieldsToProcess.length, 0)

  const flevelLoader = new FLevelLoader(lzsDecompressor, mapList)

  await flevelLoader.ensureTexturesExist(config)

  const success = []
  const errors = []
  for (const [i, fieldName] of fieldsToProcess.entries()) {
    // const lgp = path.basename(lgpPath)
    progressBar.update(i, { current: fieldName })
    await sleep(200) // The update above can be slow to display
    try {
      const fieldBackgroundFolderExists = fs.existsSync(
        path.join(
          config.kujataDataDirectory,
          'metadata',
          'background-layers',
          fieldName
        )
      )
      // console.log('\n\n', resumeRender, fieldBackgroundFolderExists)
      if (resumeRender && fieldBackgroundFolderExists) {
        continue
      }
      const shallRender = renderBackgroundLayers || resumeRender
      // console.log('shallRender', shallRender)
      decodeOneMap(flevelLoader, config, fieldName, shallRender)
      success.push(fieldName)
    } catch (error) {
      // console.error('\n\n', error)
      errors.push(fieldName)
    }

    progressBar.increment()
  }
  progressBar.stop()

  if (success.length > 0) {
    console.log(
      chalk.green(
        '🚀  Successfully extracted: ',
        success.map(l => chalk.underline(path.basename(l))).join(', ')
      )
    )
  }
  if (errors.length > 0) {
    console.log(
      chalk.red(
        '⚠️  Error extracting: ',
        errors.map(l => chalk.underline(path.basename(l))).join(', ')
      )
    )
  }
}
module.exports = { extractFlevel }
