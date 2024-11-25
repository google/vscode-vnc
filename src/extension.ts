// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {registerCommands} from './commands';

export type ExtensionApi = {};

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  registerCommands(context);
  return {};
}
