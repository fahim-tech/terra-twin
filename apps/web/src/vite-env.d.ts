/// <reference types="vite/client" />
declare const CESIUM_BASE_URL: string;
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CESIUM_ION_TOKEN?: string;
}
