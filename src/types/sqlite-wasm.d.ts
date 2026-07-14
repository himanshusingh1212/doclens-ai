declare module "@sqlite.org/sqlite-wasm" {
  export interface Sqlite3InitOptions {
    print?: (text: string) => void;
    printErr?: (text: string) => void;
    locateFile?: (file: string, scriptDir?: string) => string;
  }

  export interface Sqlite3 {
    oo1: {
      OpfsDb: new (filename: string, mode: string) => any;
      DB: new (filename: string, mode: string) => any;
    };
    capi: {
      sqlite3_vfs_find: (name: string | null) => number;
    };
  }

  const sqlite3InitModule: (options?: Sqlite3InitOptions) => Promise<Sqlite3>;
  export default sqlite3InitModule;
}
