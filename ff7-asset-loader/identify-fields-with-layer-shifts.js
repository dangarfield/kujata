const fs = require('fs')
const path = require('path')

// Path to the kujata-data metadata directory
const metadataPath = path.join(__dirname, '../kujata-data/metadata/backgrnd-layers')

function checkLayerShifts () {
  try {
    // Read all directories in the backgrnd-layers folder
    const directories = fs.readdirSync(metadataPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort() // Sort for consistent output

    console.log('Fields with layer shifts:')
    console.log('========================')

    let fieldsWithShifts = 0
    let totalFields = 0

    for (const dirName of directories) {
      const jsonFilePath = path.join(metadataPath, dirName, `${dirName}.json`)

      // Check if the JSON file exists
      if (!fs.existsSync(jsonFilePath)) {
        console.log(`Warning: ${dirName}.json not found in ${dirName} directory`)
        continue
      }

      totalFields++

      try {
        // Read and parse the JSON file
        const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))

        // Check if layerShifts exists and has non-zero values
        if (jsonData.layerShifts && Array.isArray(jsonData.layerShifts)) {
          const hasNonZeroShifts = jsonData.layerShifts.some(shift =>
            shift.x !== 0 || shift.y !== 0
          )

          if (hasNonZeroShifts) {
            fieldsWithShifts++
            const shiftStrings = jsonData.layerShifts.map(shift =>
                            `${shift.x},${shift.y}`
            )
            console.log(`${dirName} -> ${shiftStrings.join(' - ')}`)
          }
        }
      } catch (parseError) {
        console.log(`Error parsing ${dirName}.json: ${parseError.message}`)
      }
    }

    console.log('========================')
    console.log(`Summary: ${fieldsWithShifts} out of ${totalFields} fields have layer shifts`)
  } catch (error) {
    console.error('Error reading metadata directory:', error.message)
    console.error('Make sure the kujata-data/metadata/backgrnd-layers directory exists')
    console.error('Current working directory:', process.cwd())
    console.error('Looking for:', metadataPath)
  }
}

// Run the check
checkLayerShifts()
