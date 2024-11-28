// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {registerCommands} from './commands';

export type ExtensionApi = {
  // ExtensionContext passed to the activation function.
  // Available only when the extension is activated for testing.
  context?: vscode.ExtensionContext;
};

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  registerCommands(context);
  return {
    context:
      context.extensionMode === vscode.ExtensionMode.Test ? context : undefined,
  };
}
