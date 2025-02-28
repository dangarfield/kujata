# kujata

> A cli-tool that translates Final Fantasy 7 assets to web-friendly formats like JSON and glTF

![Logo](KUJATA.png)

# Installation and usage

- Install nodejs
- Run `npm i -g kujata`
- Run any kujata command, eg:
  - `kujata config` - Set ff7 directory and output folder
  - `kujata flevel mdstin1 md1_1` - Extract the backgrounds, palettes, walkmesh & field scripts for the first few fields
  - `kujata battle-models rtaa ruaa` - Extract the cloud and tifa's battle model and animations in glTF format  
- View your outputted files
- Use them to create something cool like:
  - https://dangarfield.github.io/kujata-webapp - Viewer for kujata data and assets
  - https://ff7-fenrir.netlify.app - Full FF7 reimplementation engine running natively in the browser 

# All commands
| Command | Description |
| --- | --- |
| `kujata config` | Set config. FF7 install path. Un-lgp storage. Kujata data output folder |
| `kujata flevel --all -r` | Extract all field data. Includes backgrounds, palettes, walkmesh, field scripts etc |
| `kujata flevel md1stin md1_1` | Extract one or more field |
| `kujata field-models --all` | Extract field models to glTF. Includes models and textures |
| `kujata field-models aaaa aagb` | Extract one or more models |
| `kujata field-animations` | Extract field model animations to glTF. Includes all animations for all models |
| `kujata metadata` | Extract general information. Includes field jumps, operations, chapter lists, friendly names etc |
| `kujata battle-models --all` | Extract battle models to glTF. Includes models, textures, weapons, backgrounds and animations |
| `kujata battle-models rtaa ruaa` | Extract one or more models |
| `kujata battle-data` | Extract battle data. Includes enemies, scene.bin, mark.dat, camera & action scripts, effect sprites |
| `kujata world` | Extract world data. Very incomplete. Includes field transition positions only |
| `kujata exe` | Extract exe data. Includes shops, initial data, limit data |
| `kujata kernel` | Extract kernel data. Includes command and attacks, initial data, and window.bin data |
| `kujata menu` | Extract menu assets. Includes images, text, icons, most images for the game |
| `kujata cd` | Extract cd data. Includes credits and change disk data |
| `kujata media` | Convert media assets to web friendly formats. Sounds, music, movies, movie cam data |
| `kujata bundle` | Bundle image assets. Add filelist.txt and zip images common images, For fenrir game engine |
| `kujata unlgp battle.lgp` | Extract the files from the lgp archives |


## Thanks goes to...
- picklejar76, for his work on creating the initial kujata 
- qhimm community
- Aali, for patching FF7, graphics work, lgp/unlgp utility, etc.
- Borde, for authoring Kimera and TexTool_0.10
- DLPB, for authoring too many tools to list here
- ficedula, for authoring multiple tools, including lzs decompressor and Ifalna model viewer
- Kaldarasha, for model editing experience and design advice, etc.
- halkun, for evangelizing glTF, FF7 file spreadsheet, etc.
- Sega Chief, for field model friendly names, etc.
- quantumpencil, for sister-ray
- Jusete, for finding a good kujata logo
- others TBD; please let me know if I left out any person or acknowledgement!
