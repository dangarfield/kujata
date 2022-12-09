const fs = require('fs-extra')
const path = require('path')
const config = require('../../config.json')

const init = async () => {
  const sceneBin = fs.readJsonSync(path.join(config.outputBattleSceneDirectory, 'scene.bin.json'))
  const exeData = fs.readJsonSync(path.join(config.outputExeDirectory, 'ff7.exe.json'))
  let data = fs.readdirSync(config.inputBattleBattleDirectory).filter(f => f.toLowerCase().endsWith(('aa'))).map(f => {
    const enemyId = (f.toLowerCase().substring(0, 1).charCodeAt(0) - 97) * 26 + (f.toLowerCase().substring(1, 2).charCodeAt(0) - 97) // TODO - Should improve, guess at this point

    // TODO - Need to include other sources (playable characters, weapons etc)

    let name = 'Unknown'
    for (let i = 0; i < sceneBin.length; i++) {
      const sceneBinEntry = sceneBin[i]
      if (enemyId === sceneBinEntry.enemyId1) { name = sceneBinEntry.enemyData1.name; break }
      if (enemyId === sceneBinEntry.enemyId2) { name = sceneBinEntry.enemyData2.name; break }
      if (enemyId === sceneBinEntry.enemyId3) { name = sceneBinEntry.enemyData3.name; break }
    }
    for (let i = 0; i < exeData.battleCharacterModels.length; i++) {
      const battleCharacterModel = exeData.battleCharacterModels[i]
      if (enemyId === battleCharacterModel.enemyId) { name = battleCharacterModel.name }
    }
    return {id: f.toLowerCase(), enemyId, name}
  })
  const outputFile = `${config.metadataDirectory}/ff7-battle-database.json`
  console.log('outputFile', outputFile)
  fs.writeJsonSync(outputFile, data, {spaces: '\t'})
}
init()