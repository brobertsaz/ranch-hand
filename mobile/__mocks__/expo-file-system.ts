// expo-file-system for Jest: files are names in a set, and the two network calls are jest.fn()s a test can steer.

const files = new Set<string>();

export const Paths = { document: '/documents' };

export const UploadType = { BINARY_CONTENT: 0, MULTIPART: 1 };

export class Directory {
  uri: string;

  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }

  get exists(): boolean {
    return true;
  }

  create(): void {}

  delete(): void {
    for (const path of [...files]) if (path.startsWith(`${this.uri}/`)) files.delete(path);
  }
}

type Upload = (url: string, options: unknown, file: File) => Promise<{ status: number; body: string }>;
type Download = (url: string, destination: File, options: unknown) => Promise<void>;

export class File {
  uri: string;

  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  create(): void {
    files.add(this.uri);
  }

  delete(): void {
    files.delete(this.uri);
  }

  async move(destination: File): Promise<void> {
    files.delete(this.uri);
    files.add(destination.uri);
  }

  upload(url: string, options: unknown): Promise<{ status: number; body: string }> {
    return __fs.upload(url, options, this);
  }

  static downloadFileAsync(url: string, destination: File, options: unknown): Promise<void> {
    return __fs.download(url, destination, options);
  }
}

// What a test reaches for: the files that exist, and what the server does with an upload or download
export const __fs = {
  files,
  upload: jest.fn<ReturnType<Upload>, Parameters<Upload>>(async () => ({ status: 204, body: '' })),
  download: jest.fn<ReturnType<Download>, Parameters<Download>>(async (_url, destination) => destination.create()),
};
