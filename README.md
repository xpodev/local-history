# Local History

An extension for VS Code for maintaining versions of your files easily without saving all the files content.


Every time a file is saved, Local History will compare the old version to the new version and save the differences.
All differences are saved inside a folder called `.lh`

`.lh` folder is structured like the root folder for easy navigation.

Ignored files are stored in `.lh/.lhignore` as Regular Expressions. 


Local History uses [jsdiff](https://github.com/kpdecker/jsdiff) by Kevin Decker

## Features

- Saving differences between files without copying the whole content.
- Comparing versions side by side with highlighting the changes.
- Graphical User Interface for managing, editing and restoring old versions.
- Adding commits to organize your changes.

### Overview

Every time a file is saved, a diff is saved inside a folder called `.lh`.
You can maintain your versions in the Local History bar.

![Overview](https://github.com/xpodev/local-history/blob/main/media/overview.gif)

### Create Commit

Create commit if you're happy with the current code.
Don't worry, older commits are also saved if you want to go back or compare.

![Create Commit](https://github.com/xpodev/local-history/blob/main/media/create-commit.gif)


## Extension Settings

```
"local-history.enable": Determine if the extension will be active and track file changes. Can be changed in all scopes (User, Workspace  and Folder).
"local-history.browser.descending": Change the diffs order in the Diff View. 
"local-history.commits.clearPatchesOnNewCommit": If true, all old patched will be deleted when new commit is being created. This configuration helps save some disk space. 
"local-history.commits.patchDelay": The time to wait between saving new diffs. Each file have his own time stamp.
"local-history.date.dateFormat": The format for date representation (see below). 
"local-history.date.dateRepresentation": After the time passed the browser will show the date (formatted as date.dateFormat) instead of how much time passed (e.g. 5 minutes ago)
```

## Known Issues

- Currently diff view supports only `File://` schema.

## Release Notes


### 1.3.0
- Added support for symbolic links.

### 1.0.6
- Added command to open the diff for the active file.

### 1.0.4
- Added Commit All command.
- Fixed some single root workspace issue.

### 1.0.2
- Changed default extension enablement to false.
- Added enable prompt.
- Added icon :)

### 1.0.0
- Initial release of Local History

Full changelog can be found [here](https://github.com/xpodev/local-history/blob/main/CHANGELOG.md)
