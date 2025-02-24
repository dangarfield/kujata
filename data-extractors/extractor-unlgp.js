const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const cliProgress = require('cli-progress')

const findLGPs = rootDir => {
  const results = []
  function searchDirectory (directory) {
    // Read all files and subdirectories in the current directory
    const files = fs.readdirSync(directory)

    for (const file of files) {
      const fullPath = path.join(directory, file)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        // If it's a directory, recurse into the directory
        searchDirectory(fullPath)
      } else if (file.endsWith('.lgp')) {
        // If it's a file and matches the target name, add to the results
        results.push(fullPath)
      }
    }
  }

  searchDirectory(rootDir)
  return results
}
const deleteDirectorySync = dirPath => {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
    //   console.log(`Directory ${dirPath} and its contents were deleted successfully.`);
  } catch (err) {
    console.error(`Error deleting directory ${dirPath}:`, err)
  }
}

const extractArchive = (archivePath, outputRootPath) => {
  let success = false
  try {
    const lgpName = path.basename(archivePath)
    const outputPath = path.resolve(outputRootPath, lgpName)
    if (fs.existsSync(outputPath)) {
      deleteDirectorySync(outputPath)
    }
    fs.mkdirSync(outputPath)

    const readBinaryFile = (filename) => {
      return fs.readFileSync(filename)
    }
    const buffer = readBinaryFile(archivePath)
    let offset = 0
    const readBytes = (size) => {
      const data = buffer.slice(offset, offset + size)
      offset += size
      return data
    }
    const readUInt32 = () => {
      const value = buffer.readUInt32LE(offset)
      offset += 4
      return value
    }
    const readUInt16 = () => {
      const value = buffer.readUInt16LE(offset)
      offset += 2
      return value
    }
    const readUInt8 = () => {
      const value = buffer.readUInt8(offset)
      offset += 1
      return value
    }
    const readString = (size) => {
      return readBytes(size).toString('utf8').replace(/\0/g, '')
    }

    // Skip header (12 bytes: creator signature)
    const signature = readString(12) // eslint-disable-line no-unused-vars
    // Read number of files
    const numFiles = readUInt32()
    // Read Table of Contents (TOC)
    const toc = []
    for (let i = 0; i < numFiles; i++) {
      toc.push({
        name: readString(20),
        offset: readUInt32(),
        attribute: readUInt8(), // File attribute or check code
        conflictIndex: readUInt16() // Conflict ID (if duplicate filenames exist)
      })
    }

    // Find where the first file starts to calculate CRC section size
    const firstFileOffset = Math.min(...toc.map(f => f.offset))
    const crcSize = firstFileOffset - offset
    offset += crcSize
    // Extract files
    fs.mkdirSync(outputPath, { recursive: true })

    toc.forEach(file => {
      // console.log(`Extracting ${file.name}...`);
      offset = file.offset // Jump to file data
      const extractedName = path.join(outputPath, file.name)
      const fileHeaderName = readString(20) // eslint-disable-line no-unused-vars
      const fileSize = readUInt32() // File length
      const data = readBytes(fileSize)
      // console.log(`Saving ${file.name} (${fileSize} bytes)`);
      fs.mkdirSync(path.dirname(extractedName), { recursive: true })
      fs.writeFileSync(extractedName, data)
    })

    // console.log("Extraction complete!");
    success = true
  } catch (error) {
    console.error('error', error)
  }
  return success
}
const extractUnlgp = async (config, lgpFiles, all) => {
  // console.log('extractUnlgp', config, lgpFiles, all)
  let lgpFilesToProcess = findLGPs(config.ff7InstallDirectory)
  if (!all) {
    lgpFilesToProcess = lgpFilesToProcess.filter(lgp =>
      lgpFiles.some(suffix => lgp.endsWith(suffix))
    )
  }
  // console.log('lgpFilesToProcess', lgpFilesToProcess)
  if (lgpFilesToProcess.length === 0) {
    console.log(
      chalk.red(
        `⚠️   No lgp files found - ${lgpFiles
          .map(l => chalk.inverse(l))
          .join(', ')}`
      )
    )
    return
  }

  const progressBar = new cliProgress.SingleBar({
    format:
      chalk.cyan('🛠️   Unlgp progress: ') +
      chalk.cyan('{bar}') +
      ' {percentage}% || {value}/{total} Files || Current: ' +
      chalk.cyan('{current}'),
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  })
  progressBar.start(lgpFilesToProcess.length, 0)

  const errors = []
  for (const [i, lgpPath] of lgpFilesToProcess.entries()) {
    const lgp = path.basename(lgpPath)
    progressBar.update(i, { current: lgp })
    // await sleep(100) // The update above can be slow to display
    const result = extractArchive(lgpPath, config.unlgpDirectory)
    if (!result) {
      errors.push(chalk.red('⚠️   Error unlgp-ing', chalk.inverse(lgp)))
    }
    progressBar.increment()
  }
  progressBar.stop()

  if (errors.length > 0) {
    console.log(errors.join('\n'))
  } else {
    console.log(
      chalk.green(
        '🚀  Successfully unlgp-ed: ',
        lgpFilesToProcess.map(l => chalk.underline(path.basename(l))).join(', ')
      )
    )
  }
}
module.exports = { extractUnlgp }
