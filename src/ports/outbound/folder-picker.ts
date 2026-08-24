/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

export interface FolderPicker {
  pick(input: {
    readonly title: string;
    readonly defaultPath?: string;
  }): Promise<string | null>;
}
