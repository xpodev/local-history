import * as vscode from 'vscode';
import { DiffType, DiffExt } from './diff-ext';

const tempFileProvider = new (class implements vscode.TextDocumentContentProvider {
	onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	onDidChange = this.onDidChangeEmitter.event;

	private filePath!: vscode.Uri;
	async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {
		this.filePath = uri;
		const tempFile = vscode.Uri.parse(uri.path);
		const pathParts = tempFile.path.split("/");
		// Last part is for the diff to know what type of file is the virtual document.
		pathParts.pop();
		const index = parseInt(pathParts[pathParts.length - 1]);
		const diffType = pathParts[pathParts.length - 2];
		const filePath = vscode.Uri.parse(`file:${pathParts.slice(0, -2).join("/")}`);
		const fileDiff = await DiffExt.load(filePath);
		if (fileDiff) {
			switch (diffType) {
				case DiffType.Commit:
					return fileDiff.getCommit(index);
				case DiffType.Patch:
					return fileDiff.getPatched(index);
				default:
					return undefined;
			}
		}
		else {
			return undefined;
		}
	}

	refresh() {
		this.onDidChangeEmitter.fire(this.filePath);
	}

})();

export default tempFileProvider;