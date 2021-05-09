import * as vscode from 'vscode';
import * as Diff from 'diff';
import { encode, FileSystemUtils } from './utilities';

const NULL_PATCH = Diff.createPatch('', '', '');
const TEMP_SCHEME = "temp";

export enum DiffType {
    Commit = "commit",
    Patch = "patch"
}

class Commit {
    constructor(data: commit);
    constructor(content: string, name: string);
    constructor(data: string | commit, name?: string) {
        if (typeof data == 'string') {
            this.name = name!;
            this.content = data;
        } else {
            this.name = data.name;
            this.date = data.date;
            this.content = data.content;
            this.patches = data.patches;
            this.activePatchIndex = data.activePatchIndex;
        }
    }

    public name: string;
    public content: string;
    public activePatchIndex: number = 0;
    public patches: patch[] = [];
    public readonly date: number = Date.now();

    get activePatch(): patch {
        return this.patches[this.activePatchIndex];
    }

    newPatch(content: string) {
        if (this.activePatchIndex < this.patches.length - 1) {
            // Removing the unnecessary patches.
            this.patches.splice(this.activePatchIndex + 1);
        }
        this.patches.push({
            date: Date.now(),
            content: content
        });
        this.activePatchIndex = this.patches.length - 1;
    }

    getPatched(index: number): string {
        let patched: string = this.content;
        for (let i = 0; i <= index; i++) {
            const patchString = this.patches[i].content;
            const uniDiff = Diff.parsePatch(patchString);
            patched = Diff.applyPatch(patched, uniDiff[0]);
        }
        return patched;
    }
}

export class DiffExt {
    constructor(sourceFile: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceFile);
        this.rootDir = workspaceFolder ? workspaceFolder.uri : FileSystemUtils.parentFolder(sourceFile);
        this.lhFolder = vscode.Uri.joinPath(this.rootDir, ".lh");
        this._sourceFile = vscode.workspace.asRelativePath(sourceFile, false);
        this.commits = [];
        this.activeCommitIndex = 0;
    }

    private readonly _sourceFile: string;
    private get _diffObject(): diff {
        return {
            sourceFile: this._sourceFile,
            activeCommit: this.activeCommitIndex,
            commits: this.commits
        };
    }
    public readonly rootDir: vscode.Uri;
    public readonly lhFolder: vscode.Uri;
    public commits: Commit[];
    public activeCommitIndex: number;

    get sourceFile() {
        return vscode.Uri.joinPath(this.rootDir, this._sourceFile);
    }

    get activeCommit(): Commit {
        return this.commits[this.activeCommitIndex];
    }


    get activePatches(): patch[] {
        return this.activeCommit.patches;
    }

    newCommit(data: string, name?: string) {
        name = name ?? `Commit-${this.commits.length}`;
        let createdCommit = new Commit(data, name);

        // Elazar thinks it's better like that
        createdCommit.newPatch(NULL_PATCH);
        const deletePatches = vscode.workspace.getConfiguration("local-history").get<boolean>("commits.clearPatchesOnNewCommit");
        if (deletePatches) {
            this.commits.forEach((commit) => {
                commit.patches = [];
                commit.activePatchIndex = 0;
            });
        }
        this.commits.push(createdCommit);
        this.activeCommitIndex = this.commits.length - 1;
    }

    async renameCommit(index: number, name: string) {
        this.commits[index].name = name;
        await this.save();
    }

    async deleteCommit(index: number) {
        if (index === this.activeCommitIndex) {
            vscode.window.showErrorMessage("Can't delete the active commit. Did you mean to restore the previous commit?");
            return;
        }
        if (index < this.activeCommitIndex) {
            this.activeCommitIndex--;
        }
        this.commits.splice(index, 1);
        await this.save();
    }

    getDiffPath() {
        const relativeFilePath = vscode.workspace.asRelativePath(this.sourceFile).split("/");
        relativeFilePath.shift();
        return vscode.Uri.joinPath(this.lhFolder, `${relativeFilePath.join("/")}.json`);
    }

    getPatched(index: number, commitIndex?: number): string {
        let commit;
        if (commitIndex != undefined) {
            commit = this.commits[commitIndex];
        } else {
            commit = this.activeCommit;
        }
        return commit.getPatched(index);
    }

    getCommit(index: number) {
        return this.commits[index].content;
    }

    tempURI(commitIndex: number, patchIndex: number) {
        return vscode.Uri.joinPath(
            this.sourceFile.with({ scheme: TEMP_SCHEME }),
            `${commitIndex}/${patchIndex}/${FileSystemUtils.filename(this.sourceFile)}` // The last part is there for intellisense, it is removed in the tempFileProvider
        );
    }

    async restoreCommit(index: number) {
        await FileSystemUtils.writeFile(this.sourceFile, this.getCommit(index));
        this.activeCommitIndex = index;
        await this.save();
    }

    async restorePatch(index: number, commitIndex?: number) {
        await FileSystemUtils.writeFile(this.sourceFile, this.getPatched(index, commitIndex));
        if (commitIndex != undefined) {
            this.activeCommitIndex = commitIndex;
        }
        this.activeCommit.activePatchIndex = index;
        await this.save();
    }

    async loadDiff() {
        if (await FileSystemUtils.fileExists(this.getDiffPath())) {
            const fileData = JSON.parse(await FileSystemUtils.readFile(this.getDiffPath()));
            fileData.commits.forEach((data: commit) => {
                this.commits.push(new Commit(data));
            })
            this.activeCommitIndex = fileData.activeCommit;
        }
    }

    async save() {
        await vscode.workspace.fs.writeFile(this.getDiffPath(), encode(JSON.stringify(this._diffObject, null, 4)));
    }

    static async load(uri: vscode.Uri): Promise<DiffExt> {
        const diffObj = new DiffExt(uri);
        await diffObj.loadDiff();
        return diffObj;
    }
}

type diff = {
    sourceFile: string,
    activeCommit: number,
    commits: Commit[]
}

type commit = {
    name: string,
    content: string,
    activePatchIndex: number,
    patches: patch[],
    date: number
}

type patch = {
    content: string,
    date: number
}