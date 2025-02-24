#!/usr/bin/env node

const os = require('os')
const fs = require('fs')
const path = require('path')
const commander = require('commander')
const chalk = require('chalk')
const { extractUnlgp } = require('./data-extractors/extractor-unlgp')
const { extractFlevel } = require('./data-extractors/extractor-flevel')
const { extractCDData } = require('./data-extractors/extractor-cd')
const { extractBattleData } = require('./data-extractors/extractor-battle-data')
const { extractExe } = require('./data-extractors/extractor-exe')
const { extractKernel } = require('./data-extractors/extractor-kernel')
const { extractMenu } = require('./data-extractors/extractor-menu')
const {
  generateCacheAndCreateFileList
} = require('./data-extractors/cache-generator')
const { extractMedias } = require('./data-extractors/extractor-media')
const { input, confirm } = require('@inquirer/prompts')
const {
  extractFieldBattleModels
} = require('./data-extractors/extractor-field-battle-models')
const {
  extractFieldAnimations
} = require('./data-extractors/extractor-field-animations')
const { extractMetadata } = require('./data-extractors/extractor-metadata')
const { extractWorld } = require('./data-extractors/extractor-world')

const program = new commander.Command()

/*
PROGRESS:
  - config - DONE
  - unlgp - DONE
  - flevel - DONE
  - cd - DONE
  - battle-data - DONE
  - field-models - DONE
  - battle-models - DONE
  - field-animations - DONE
  - metadata - DONE
  - world - tbc
  - exe - DONE
  - kernel - DONE
  - menu - DONE
  - media - TBC
  - bundle - DONE
*/

/*
OTHERS to process:
    - battle/create-battle-skeleton-metadata.js - Need for ??? - Tweaked into just names
- coemann8/parse-codemann8-data.js - Need for ???
    - data-extractors/scene-graph-generator.js - Need for ???
    - standing-animations/create-standing-animation.js - Need for ???
- data-extractors/parse-wm-field-menu-names.js - Need for ???
    - data-extractors/generate-field-id-to-world-map-coords.js - Need for ???
- data-extractors/generate-world-map-transition-data.js - Need for fenrir world map <-> field transitions
    - data-extractors/generate-op-codes-usages.js - Need for kujata-webapp op code usage
    - data-extractors/create-sound-list.js - Need for kujata-webapp sounds
*/

/*
kujata webapp requires:

fields
  /data/field/flevel.lgp/maplist.json
  /metadata/scene-graph.json
  /metadata/chapters.json
  /metadata/makou-reactor/backgrounds/md1stin.png etc

field detail
  /data/field/flevel.lgp/md1stin.json etc

field-op-codes
  /metadata/op-categories.json
  /metadata/op-metadata.json

field-op-codes detail
  /metadata/op-code-usages/98.json etc

field-models
  /metadata/ifalna.json - Don't need
  /metadata/ff7-database.json // Replaced with friendly names

field-models detail
  /metadata/field-model-metadata.json
  /metadata/skeleton-names-field.json

battle-models
  /metadata/ff7-battle-database.json // Replaced with friendly names

sounds
  /metadata/sound-list.json

*/

/*
fenrir requires:

  /data/exe/ff7.exe.json
  /data/kernel/kernel.bin.json
  /data/battle/mark.dat.json
  /data/battle/scene.bin/scene.bin.json
  /data/battle/battle.lgp/${modelCode.toLowerCase()}.hrc.gltf
  /data/wm/world_us.lgp/field.tbl.json
  /data/field/char.lgp/${modelLoader.hrcId.toLowerCase()}.gltf
  /data/field/char.lgp/${animId}.a.gltf
  /data/field/flevel.lgp/${fieldName}.json
  /data/field/flevel.lgp/textures/${blinkTextures[textureCount]}.tex.png
  /data/field/flevel.lgp/maplist.json

  /media/sounds/sounds-metadata.json
  /media/music/music-metadata.json
  /media/movies/movies-metadata.json
  /media/movies/moviecam-metadata.json
  /media/movies/${name}.cam.json

  /metadata/scene-graph.json
  /metadata/chapters.json
  /metadata/field-id-to-world-map-coords.json

  /metadata/credits-assets/credits.json
  /metadata/field-assets/flevel.metadata.json
  /metadata/menu-assets/menu_us.metadata.json
  /metadata/credits-assets/credits-font.metadata.json
  /metadata/disc-assets/disc.metadata.json
  /metadata/window-assets/window.bin.metadata.json
  /metadata/${textureGroupName}-assets/${assetType}/${asset.description}.png`

  /metadata/background-layers/${fieldName}/${fieldName}.json
  /metadata/background-layers/${fieldName}/${fileName}
  /metadata/background-layers/${fieldName}/pixels/${fileName}
  /metadata/background-layers/${fieldName}/palettes/${fieldName}-${paletteIndex}.png

  /metadata/makou-reactor/backgrounds/${fieldName}.png -> https://makou-reactor-bg-images.netlify.app/md1stin.png

*/
const configPath = path.join(os.homedir(), '.kujata', 'config.json')

const configDefault = {
  ff7InstallDirectory:
    'C:/Program Files (x86)/Steam/steamapps/common/FINAL FANTASY VII',
  unlgpDirectory: '../unlgp',
  kujataDataDirectory: '../kujata-data'
}
const validateSystem = () => {
  if (process.platform !== 'win32') {
    program.error(
      chalk.red(
        '⚠️   The',
        chalk.inverse('kujata media'),
        'function is only available on windows at the moment. Sorry'
      )
    )
  }
}
const getConfig = () => {
  return JSON.parse(fs.readFileSync(configPath))
}
const editConfig = async config => {
  config.ff7InstallDirectory = await input({
    message: `1/3 | ${chalk.cyan(
      '🖊️   Add Final Fantasy VII Install directory:'
    )}`,
    default: config.ff7InstallDirectory,
    validate: f =>
      fs.existsSync(path.resolve(f)) &&
      fs.existsSync(path.resolve(path.join(f, 'ff7_en.exe')))
        ? true
        : chalk.red("⚠️   I can't find a ff7_en.exe in this folder")
  })

  config.unlgpDirectory = await input({
    message: `2/3 | ${chalk.cyan(
      "🖊️   FF7 has a sort of '.zip' format. Please select an intermediary directory for storing the un-zipped archives. Eg, un-lgp data:"
    )}`,
    default: config.unlgpDirectory,
    validate: f =>
      fs.existsSync(path.resolve(f))
        ? true
        : chalk.red(
          "⚠️   This doesn't look like a folder that exists, please create it first then try again"
        )
  })

  config.kujataDataDirectory = await input({
    message: `2/3 | ${chalk.cyan(
      '🖊️   Add a directory for where you want the output files to go, eg kujata data:'
    )}`,
    default: config.kujataDataDirectory,
    validate: f =>
      fs.existsSync(path.resolve(f))
        ? true
        : chalk.red(
          "⚠️   This doesn't look like a folder that exists, please create it first then try again"
        )
  })

  fs.writeFileSync(configPath, JSON.stringify(config, null, 3))
  return config
}
const validateConfig = async shallEditConfig => {
  if (!fs.existsSync(path.dirname(configPath))) {
    fs.mkdirSync(path.dirname(configPath))
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(configDefault, null, 3))
    console.log(
      chalk.green(
        '🚀  Running kujata for the first time! Set the config directories'
      )
    )
    shallEditConfig = true
  }
  const config = getConfig()
  if (shallEditConfig) await editConfig(config)
  // console.log('config', config, path.resolve(config.unlgpDirectory))

  const errors = []
  if (
    !config.ff7InstallDirectory ||
    !fs.existsSync(path.join(config.ff7InstallDirectory, 'ff7_en.exe'))
  ) {
    errors.push(
      chalk.red(
        "⚠️   Can't find your",
        chalk.underline('ff7 install directory.'),
        'Run',
        chalk.inverse('kujata config'),
        "and ensure it's set correctly"
      )
    )
  }
  if (
    !config.unlgpDirectory ||
    !fs.existsSync(path.join(config.unlgpDirectory))
  ) {
    errors.push(
      chalk.red(
        "⚠️   Can't find your",
        chalk.underline('unlgp directory.'),
        'Run',
        chalk.inverse('kujata config'),
        "and ensure it's set correctly"
      )
    )
  }
  if (
    !config.kujataDataDirectory ||
    !fs.existsSync(path.join(config.kujataDataDirectory))
  ) {
    errors.push(
      chalk.red(
        "⚠️   Can't find your",
        chalk.underline('kujata data output directory.'),
        'Run',
        chalk.inverse('kujata config'),
        "and ensure it's set correctly"
      )
    )
  }

  if (errors.length > 0) {
    // console.log(chalk.blue('⚠️  Hello world!'))
    program.error(chalk.red(errors.join('\n')))
  }
  return config
}
const validateUnlgp = async (config, ...expectedFolders) => {
  const errors = []
  for (const expectedFolder of expectedFolders) {
    const expectedFolderPath = path.join(config.unlgpDirectory, expectedFolder)

    const exists = fs.existsSync(expectedFolderPath)
    // console.log('validateUnlgp', expectedFolder, exists)
    if (!exists || fs.readdirSync(expectedFolderPath).length === 0) {
      errors.push(expectedFolder)
    }
  }
  // console.log('errors', errors)
  if (errors.length > 0) {
    console.log(
      chalk.cyan(
        '⚠️   First, we need to unlgp the assets. Run',
        chalk.inverse(`kujata unlgp ${errors.map(e => e).join(' ')}`),
        'to ensure that it exists'
      )
    )
    const answer = await confirm({
      message: `${chalk.cyan('🖊️   Shall I run this command for you now:')}`
    })

    if (answer) {
      await extractUnlgp(config, errors, false)
    } else {
      program.error(
        chalk.red(
          '⚠️   First, we need to unlgp the assets. Run',
          chalk.inverse(`kujata unlgp ${errors.map(e => e).join(' ')}`),
          'to ensure that it exists'
        )
      )
    }
  }
}
const validateFieldsExport = config => {
  const fieldFolder = path.join(
    config.kujataDataDirectory,
    'data',
    'field',
    'flevel.lgp'
  )
  if (!fs.existsSync(fieldFolder) || fs.readdirSync(fieldFolder).length < 700) {
    program.error(
      chalk.red(
        '⚠️   First, we need to extract the field data. Run',
        chalk.inverse('kujata flevel --all'),
        'to ensure that it exists'
      )
    )
  }
}
program
  .command('config')
  .description(
    'Set config. ' +
      chalk.green('FF7 install path. Un-lgp storage. Kujata data output folder')
  )
  .action(async () => await validateConfig(true))
const flevelCommand = program
  .command('flevel')
  .description(
    'Extract all field data. ' +
      chalk.cyan('Includes backgrounds, palettes, walkmesh, field scripts etc')
  )
  .argument(
    '[field ids...]',
    `add field ids or '--all', eg: \n${chalk.bgGreen(
      'kujata flevel md1stin'
    )}                 One field \n${chalk.bgGreen(
      'kujata flevel md1_1 md1_2 -r'
    )}          Multiple fields with background images \n${chalk.bgGreen(
      'kujata flevel --all -r'
    )}                All fields with background images\n${chalk.bgGreen(
      'kujata flevel --all --resume-render'
    )}   Only renders backgrounds that haven't been rendered already\n\nRendering of background layers, pixels and palettes is disabled by default`
  )
  .option(
    '-r, --render',
    'Turn on rendering of background layers, pixels and palettes'
  )
  .option(
    '--resume-render',
    'Render if not already rendered. Eg, resume progress of rendering'
  )
  .option('-a, --all', 'Process all fields')
  .action(async (fields, options) => {
    const config = await validateConfig()
    await validateUnlgp(config, 'flevel.lgp')
    if (fields.length === 0 && !options.all) {
      flevelCommand.help()
    }
    // console.log('options', options)
    await extractFlevel(
      config,
      fields,
      options.all,
      options.render,
      options.resumeRender
    )
  })
  .showHelpAfterError()

const fieldModelCommand = program
  .command('field-models')
  .description(
    'Extract field models to glTF. ' +
      chalk.cyan('Includes models and textures')
  )
  .argument(
    '[model ids...]',
    `add model ids or '--all', eg: \n${chalk.bgGreen(
      'kujata field-models aaaa'
    )} \n${chalk.bgGreen('kujata field-models aaaa aagb')} \n${chalk.bgGreen(
      'kujata field-models --all'
    )}`
  )
  .option('-a, --all', 'Process all models')
  .action(async (models, options) => {
    const config = await validateConfig()
    await validateUnlgp(config, 'char.lgp')
    if (models.length === 0 && !options.all) {
      fieldModelCommand.help()
    }
    await extractFieldBattleModels(config, models, options.all, false)
  })
  .showHelpAfterError()

program
  .command('field-animations')
  .description(
    'Extract field model animations to glTF. ' +
      chalk.cyan('Includes all animations for all models')
  )
  .action(async () => {
    const config = await validateConfig()
    await validateUnlgp(config, 'char.lgp')
    await extractFieldAnimations(config)
  })
  .showHelpAfterError()

program
  .command('metadata')
  .description(
    'Extract general information. ' +
      chalk.cyan(
        'Includes field jumps, sound & operations usage, chapter lists, friendly names etc'
      )
  )
  .action(async () => {
    const config = await validateConfig()
    validateFieldsExport(config)
    await extractMetadata(config)
  })
  .showHelpAfterError()

const battleModelCommand = program
  .command('battle-models')
  .description(
    'Extract battle models to glTF. ' +
      chalk.cyan(
        'Includes models, textures, weapons, backgrounds and animations'
      )
  )
  .argument(
    '[model ids...]',
    `add model ids or '--all', eg: \n${chalk.bgGreen(
      'kujata battle-models rtaa'
    )} \n${chalk.bgGreen('kujata battle-models rtaa ruaa')} \n${chalk.bgGreen(
      'kujata battle-models --all'
    )}`
  )
  .option('-a, --all', 'Process all models')
  .action(async (models, options) => {
    const config = await validateConfig()
    await validateUnlgp(config, 'battle.lgp')
    if (models.length === 0 && !options.all) {
      battleModelCommand.help()
    }
    await extractFieldBattleModels(config, models, options.all, true)
  })
  .showHelpAfterError()

program
  .command('battle-data')
  .description(
    'Extract battle data. ' +
      chalk.cyan(
        'Includes enemies, scene.bin, mark.dat, camera & action scripts, effect sprites'
      )
  )
  .action(async () => {
    const config = await validateConfig()
    await validateUnlgp(config, 'battle.lgp')
    await extractBattleData(config)
  })
  .showHelpAfterError()

program
  .command('world')
  .description(
    'Extract world data. ' +
      chalk.cyan('Very incomplete. Includes field transition positions only')
  )
  .action(async () => {
    const config = await validateConfig()
    await validateUnlgp(config, 'world_us.lgp')
    await extractWorld(config)
  })
  .showHelpAfterError()

program
  .command('exe')
  .description(
    'Extract exe data. ' +
      chalk.cyan('Includes shops, initial data, limit data')
  )
  .action(async () => {
    const config = await validateConfig()
    await extractExe(config)
  })
  .showHelpAfterError()

program
  .command('kernel')
  .description(
    'Extract kernel data. ' +
      chalk.cyan(
        'Includes command and attacks, initial data, and window.bin data'
      )
  )
  .action(async () => {
    const config = await validateConfig()
    await extractKernel(config)
  })
  .showHelpAfterError()

program
  .command('menu')
  .description(
    'Extract menu assets. ' +
      chalk.cyan('Includes images, text, icons, most images for the game')
  )
  .action(async () => {
    const config = await validateConfig()
    await validateUnlgp(config, 'menu_us.lgp')
    await extractMenu(config)
  })
  .showHelpAfterError()
program
  .command('cd')
  .description(
    'Extract cd data. ' + chalk.cyan('Includes credits and change disk data')
  )
  .action(async () => {
    const config = await validateConfig()
    await validateUnlgp(config, 'cr_us.lgp', 'disc_us.lgp')
    await extractCDData(config)
  })
  .showHelpAfterError()
program
  .command('media')
  .description(
    'Convert media assets to web friendly formats. ' +
      chalk.cyan('Sounds, music, movies, movie cam data')
  )
  .action(async () => {
    const config = await validateConfig()
    validateSystem()
    await validateUnlgp(config, 'moviecam.lgp')
    await extractMedias(config)
  })
  .showHelpAfterError()

program
  .command('bundle')
  .description(
    'Bundle image assets. ' +
      chalk.green(
        'Add filelist.txt and zip images common images, For fenrir game engine'
      )
  )
  .action(async () => {
    const config = await validateConfig()
    await generateCacheAndCreateFileList(config)
  })
  .showHelpAfterError()

const unlgpCommand = program
  .command('unlgp')
  .description('Extract the files from the lgp archives')
  .argument(
    '[archives...]',
    `add archives or '--all', eg: \n${chalk.bgGreen(
      'kujata unlgp flevel.lgp'
    )} \n${chalk.bgGreen(
      'kujata unlgp battle.lgp magic.lgp'
    )} \n${chalk.bgGreen('kujata unlgp --all')}`
  )
  .option('-a, --all', 'Process all lgp-s')
  .action(async (lgpFiles, options) => {
    if (lgpFiles.length === 0 && !options.all) {
      unlgpCommand.help()
    }
    const config = await validateConfig()
    await extractUnlgp(config, lgpFiles, options.all)
  })
  .showHelpAfterError()
program.parse()
