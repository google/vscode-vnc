// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {VncSession} from './session';

async function commandConnect(context: vscode.ExtensionContext): Promise<void> {
  const hostnameInput = await vscode.window.showInputBox({
    prompt: 'Enter VNC host name',
    placeHolder: 'localhost',
  });
  if (hostnameInput === undefined) {
    return;
  }
  const hostname = hostnameInput || 'localhost';

  const portInput = await vscode.window.showInputBox({
    prompt: 'Enter VNC port',
    placeHolder: '5900',
  });
  if (portInput === undefined) {
    return;
  }
  const port = Number(portInput || '5900');
  if (isNaN(port)) {
    void vscode.window.showErrorMessage('Invalid port number');
    return;
  }

  const session = new VncSession(hostname, port, context);
  await session.start();
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vnc.connect', () =>
      commandConnect(context)
    )
  );
}
