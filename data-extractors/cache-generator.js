const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const chalk = require('chalk')
const crypto = require('crypto')
const { promisify } = require('util')
const fastGlob = require('fast-glob')
// const pLimit = require('p-limit')

// In fenrir, a large number of assets are used
// This is a convenience method to bundle the assets already in the kujata-data directory
// Into a single zip that can be downloaded once unzipped and cached by a service worker
const NETLIFY_TOML = `[[headers]]
  for = "/*"
    [headers.values]
    Access-Control-Allow-Origin = "*"`

const generateCachedBundle = async config => {
  const rootDir = config.kujataDataDirectory
  const zipConfig = [
    { folder: '/metadata/window-assets', file: 'window.bin.metadata.json' },
    { folder: '/metadata/menu-assets', file: 'menu_us.metadata.json' },
    { folder: '/metadata/credits-assets', file: 'credits-font.metadata.json' },
    { folder: '/metadata/disc-assets', file: 'disc.metadata.json' },
    { folder: '/metadata/field-assets', file: 'flevel.metadata.json' }
  ]

  const allFilesToZip = []

  // Loop through zipConfig
  for (const config of zipConfig) {
    const configFilePath = path.join(rootDir, config.folder, config.file)

    // Read the config file (flevel.metadata.json)
    const configFile = JSON.parse(fs.readFileSync(configFilePath))

    // Loop through each folder key in the config file
    for (const folderName in configFile) {
      if (Array.isArray(configFile[folderName])) {
        // Each folder will have an array of objects with 'description' field
        const folderItems = configFile[folderName]

        for (const item of folderItems) {
          // Build the full path for each required file (e.g. description.png)
          const filePath = path.join(
            rootDir,
            config.folder,
            folderName,
            `${item.description}.png`
          )
          allFilesToZip.push(filePath)
        }
      }
    }
  }

  // console.log('allFilesToZip', allFilesToZip.length)
  // Create a ZIP file using JSZip
  const zip = new JSZip()

  // Add each file to the ZIP
  for (const file of allFilesToZip) {
    const fileNameInZip = path.relative(rootDir, file) // Keep relative path inside the ZIP
    console.log('fileNameInZip', fileNameInZip)
    const fileData = fs.readFileSync(file) // Read the file contents
    zip.file(fileNameInZip, fileData) // Add the file to the ZIP
  }

  // Generate the ZIP file
  const zipContent = await zip.generateAsync({ type: 'nodebuffer' })

  // Write the ZIP file to the specified output
  const zipPath = path.join(rootDir, 'cache.zip')
  fs.writeFileSync(zipPath, zipContent)
  return allFilesToZip.length
}
// Async function to get file stats
const stat = promisify(fs.stat)
const processWithConcurrencyLimit = async (items, limit, asyncFn) => {
  const results = []
  const executing = []

  for (const item of items) {
    const p = Promise.resolve().then(() => asyncFn(item))
    results.push(p)

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1))
      executing.push(e)
      if (executing.length >= limit) {
        await Promise.race(executing)
      }
    }
  }
  return Promise.all(results)
}

// Function to calculate MD5 checksum of a file
const calculateChecksum = async filePath => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)
    stream.on('data', data => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// Function to gather file info (name, checksum, size)
const getFileInfo = async (kujataDataDirectory, filePath) => {
  const name = filePath.replace(kujataDataDirectory, '')
  const stats = await stat(filePath)
  // const checksum = 123
  const checksum = await calculateChecksum(filePath)
  return `${name},${checksum},${stats.size}`
}
const generateFileList = async config => {
  const files = await fastGlob([`${config.kujataDataDirectory}/**/*`], {
    onlyFiles: true
  })
  const fileInfos = await processWithConcurrencyLimit(files, 50, file =>
    getFileInfo(config.kujataDataDirectory, file)
  )

  const manifest = { files: fileInfos }

  // Write manifest to a JSON file
  await fs.promises.writeFile(
    path.join(config.kujataDataDirectory, 'filelist.txt'),
    fileInfos.join('\n')
  )
  return fileInfos.length
}
const generateCacheAndCreateFileList = async config => {
  console.log(chalk.cyan('🛠️   Generating image bundle and filedata manifest'))
  const bundleTotal = await generateCachedBundle(config)
  console.log(
    chalk.green('🚀  Generated image bundle -', bundleTotal, 'images')
  )

  console.log(chalk.cyan('🛠️   Generating file list'))
  const filesTotal = await generateFileList(config)
  fs.writeFileSync(
    path.join(config.kujataDataDirectory, 'netlify.toml'),
    NETLIFY_TOML
  )
  console.log(chalk.green('🚀  Generated file list -', filesTotal, 'files'))
}
module.exports = {
  generateCacheAndCreateFileList
}
