# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0]
### Added
- Difference folder config in the extension settings.
### Fixed
- Refresh file browser command.

## [1.5.0]
### Added
- Global ignored files under `~/.lh/.lhignore`.

### Changed
- Open diff command shortcut is now CTRL+L CTRL+H (CMD on Mac).

### Fixed
- Split lines of .lhignore does not use EOL anymore so files created on `\n` system will be split correctly on `\n\r` systems.

## [1.4.0]
### Changed
- Local History is now hidden.

## [1.3.1]
### Fixed
- Support for all schemas in diff view.

## [1.3.0]
### Added
- Support for Symbolic Links.
- Don't show again option on track file prompt.

## [1.0.6]

### Added
- Command to open diff to the current file (CTRL + SHIFT + ALT + D).

### Changed
- Diff browser stays focused when selecting patch/commit.

## [1.0.5]

### Fixed
- Restore patch.

## [1.0.4]

### Added
- Commit All command.

### Fixed
- Single workspace issue.

## [1.0.3]

### Fixed
- Initialization prompt.

## [1.0.2]

### Added
- Prompt for extension enablement.
- Icon

### Changed
- Default extension enablement to false.

## [1.0.0]

- Initial release.
