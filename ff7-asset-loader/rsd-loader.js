const fs = require('fs')

module.exports = {
  FIRST_LINE: '@RSD',
  PLY_LINE_PREFIX: 'PLY=',
  MAT_LINE_PREFIX: 'MAT=',
  GRP_LINE_PREFIX: 'GRP=',
  NTEX_LINE_PREFIX: 'NTEX=',

  removeFilenameExtension: function (filenameWithExtension) {
    const periodPosition = filenameWithExtension.indexOf('.')
    return filenameWithExtension.substring(0, periodPosition)
  },

  loadRsd: function (inputFieldCharDirectory, rsdBaseFilename) {
    const fileContents = fs.readFileSync(
      inputFieldCharDirectory + '/' + rsdBaseFilename + '.RSD',
      'utf-8'
    )
    const lines = fileContents
      .split(/\r?\n/g)
      .filter(line => !line.startsWith('#'))
    if (!lines[0].startsWith(this.FIRST_LINE)) {
      throw new Error('Expected: ' + this.FIRST_LINE)
    }
    if (!lines[1].startsWith(this.PLY_LINE_PREFIX)) {
      throw new Error('Expected: ' + this.PLY_LINE_PREFIX)
    }
    if (!lines[2].startsWith(this.MAT_LINE_PREFIX)) {
      throw new Error('Expected: ' + this.MAT_LINE_PREFIX)
    }
    if (!lines[3].startsWith(this.GRP_LINE_PREFIX)) {
      throw new Error('Expected: ' + this.GRP_LINE_PREFIX)
    }
    if (!lines[4].startsWith(this.NTEX_LINE_PREFIX)) {
      throw new Error('Expected: ' + this.NTEX_LINE_PREFIX)
    }
    const plyFile = this.removeFilenameExtension(
      lines[1].substring(this.PLY_LINE_PREFIX.length)
    )
    const matFile = this.removeFilenameExtension(
      lines[2].substring(this.MAT_LINE_PREFIX.length)
    )
    const grpFile = this.removeFilenameExtension(
      lines[3].substring(this.GRP_LINE_PREFIX.length)
    )
    if (matFile !== plyFile) {
      throw new Error('Expected MAT file to be same as PLY file')
    }
    if (grpFile !== plyFile) {
      throw new Error('Expected GRP file to be same as PLY file')
    }
    const resource = {
      polygonFilename: plyFile,
      textureBaseFilenames: []
    }
    const numTextures = parseInt(lines[4].substring(this.NTEX_LINE_PREFIX.length))
    for (let i = 0; i < numTextures; i++) {
      const expectedPrefix = 'TEX[' + i + ']='
      const line = lines[i + 5]
      if (!line.startsWith(expectedPrefix)) {
        throw new Error('Expected line to start with: ' + expectedPrefix)
      }
      const nthTextureFilename = this.removeFilenameExtension(
        line.substring(expectedPrefix.length)
      )
      resource.textureBaseFilenames.push(nthTextureFilename)
    }
    // console.log('rsd', resource)
    return resource
  }
}
