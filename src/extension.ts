// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "memento" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('memento.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from memento!');
	});

	context.subscriptions.push(disposable);

	// Register the listMdFiles command
	const listMdFilesDisposable = vscode.commands.registerCommand('memento.listMdFiles', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace folder is open');
			return;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;

		try {
			const mdFiles = await findMarkdownFiles(rootPath);
			const sortedFiles = mdFiles.sort((a, b) => a.birthtime.getTime() - b.birthtime.getTime());

			if (sortedFiles.length === 0) {
				vscode.window.showInformationMessage('No markdown files found in the workspace');
				return;
			}

			// Create and show HTML panel
			const panel = vscode.window.createWebviewPanel(
				'mdFilesList',
				'Markdown Files by Creation Time',
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					localResourceRoots: []
				}
			);

			panel.webview.html = getWebviewContent(sortedFiles);

			// Handle messages from the webview
			panel.webview.onDidReceiveMessage(
				message => {
					switch (message.command) {
						case 'openFile':
							vscode.workspace.openTextDocument(message.path).then(doc => {
								vscode.window.showTextDocument(doc);
							});
							return;
					}
				},
				undefined,
				context.subscriptions
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Error listing markdown files: ${error}`);
		}
	});

	context.subscriptions.push(listMdFilesDisposable);
}

async function findMarkdownFiles(dir: string): Promise<Array<{path: string, birthtime: Date, relativePath: string}>> {
	const mdFiles: Array<{path: string, birthtime: Date, relativePath: string}> = [];

	async function scanDirectory(currentDir: string, rootDir: string) {
		const items = await fs.promises.readdir(currentDir);

		for (const item of items) {
			const itemPath = path.join(currentDir, item);
			const stats = await fs.promises.stat(itemPath);

			if (stats.isDirectory()) {
				// Skip node_modules and .git directories
				if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
					await scanDirectory(itemPath, rootDir);
				}
			} else if (stats.isFile() && path.extname(item).toLowerCase() === '.md') {
				const relativePath = path.relative(rootDir, itemPath);
				mdFiles.push({
					path: itemPath,
					birthtime: stats.birthtime,
					relativePath: relativePath
				});
			}
		}
	}

	await scanDirectory(dir, dir);
	return mdFiles;
}

function getWebviewContent(files: Array<{path: string, birthtime: Date, relativePath: string}>): string {
	const fileRows = files.map((file, index) => {
		const date = file.birthtime.toLocaleString();
		const encodedPath = encodeURIComponent(file.path);
		return `
			<tr>
				<td>${index + 1}</td>
				<td>
					<a href="#" onclick="openFile('${encodedPath}')" class="file-link">
						${file.relativePath}
					</a>
				</td>
				<td>${date}</td>
			</tr>
		`;
	}).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Markdown Files</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			margin: 20px;
		}

		h1 {
			color: var(--vscode-foreground);
			border-bottom: 1px solid var(--vscode-textSeparator-foreground);
			padding-bottom: 10px;
		}

		.summary {
			margin: 20px 0;
			padding: 15px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border-radius: 5px;
		}

		table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 20px;
		}

		th, td {
			text-align: left;
			padding: 12px;
			border-bottom: 1px solid var(--vscode-textSeparator-foreground);
		}

		th {
			background-color: var(--vscode-editor-selectionBackground);
			font-weight: bold;
		}

		tr:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.file-link {
			color: var(--vscode-textLink-foreground);
			text-decoration: none;
			cursor: pointer;
		}

		.file-link:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration: underline;
		}

		.index {
			width: 50px;
			text-align: center;
		}

		.created {
			width: 200px;
		}
	</style>
</head>
<body>
	<h1>📝 Markdown Files by Creation Time</h1>

	<div class="summary">
		<strong>Found ${files.length} markdown files</strong> in the workspace, sorted by creation time (oldest first).
	</div>

	<table>
		<thead>
			<tr>
				<th class="index">#</th>
				<th>File Path</th>
				<th class="created">Created</th>
			</tr>
		</thead>
		<tbody>
			${fileRows}
		</tbody>
	</table>

	<script>
		const vscode = acquireVsCodeApi();

		function openFile(encodedPath) {
			const filePath = decodeURIComponent(encodedPath);
			vscode.postMessage({
				command: 'openFile',
				path: filePath
			});
		}
	</script>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}
