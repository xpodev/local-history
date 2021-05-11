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
- Adding commits for organizing your changes.

# Example

Every time a file is saved, a diff is saved inside a folder called `.lh`.
You can maintain your versions in the Local History bar.
![Overview](https://help.xpo.dev/local-history/gif/overview)

Create commit if you're happy with the current code.
Don't worry, older commits are also saved if you want to go back or compare.
![Create Commit](https://help.xpo.dev/local-history/gif/create-commit)


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

*None*

## Release Notes

### 1.0.0

Initial release of Local History
