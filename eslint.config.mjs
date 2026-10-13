import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
export default defineConfig([
 globalIgnores(['.next/**','.data/**','backups/**','test-results/**','playwright-report/**','artmaster-machete/**']),
 { ...js.configs.recommended, files: ['**/*.{js,mjs,ts,tsx}'], languageOptions: {globals: {...globals.node,...globals.browser}} },
 ...ts.configs.recommended,
 { ...hooks.configs.flat['recommended-latest'], files: ['src/**/*.{ts,tsx}'] },
 { ...a11y.flatConfigs.recommended, files: ['src/**/*.tsx'], settings:{'jsx-a11y':{components:{Link:'a',Image:'img'},attributes:{href:['href'],htmlFor:['htmlFor']}}} },
]);
