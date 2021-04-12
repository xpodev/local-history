# Local History

An extension for VS Code for maintaining versions of your files easily without saving all the files content.


Every time a file is saved, Local History will compare the old version to the new version and save the differences.
All differences are saved inside a folder called `.lh`

`.lh` folder is structured like the root folder for easy navigation.

Ignored files are stored in `.lh/.lhignore` as Regular Expressions. 


Local History uses [jsdiff](https://github.com/kpdecker/jsdiff)  by Kevin Decker

## Features

- Saving differences between files without copying the whole content.
- Comparing versions side by side with highlighting the changes.
- Graphical User Interface for managing, editing and restoring old versions.
- Adding commits for organizing your changes.

## Extension Settings

*Not yet written*

## Known Issues

*None*

## Release Notes

### 1.0.0

Initial release of Local History
