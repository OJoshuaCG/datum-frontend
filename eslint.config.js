import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Permite handlers async en eventos del DOM y props (patrón estándar con React
      // Hook Form / mutaciones). Se mantiene el chequeo en condicionales.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // Co-locar un componente de formulario con sus helpers puros de transformación es
      // intencional; solo afecta a HMR, no a correcness ni a producción.
      'react-refresh/only-export-components': 'warn',
      // Este gateway también se despliega sobre HTTP plano en red interna, donde
      // `window.isSecureContext` es `false` y las APIs restringidas a contexto seguro
      // simplemente no existen. TypeScript las tipa como presentes, así que el error solo
      // aparece en producción: un `TypeError` que mata el manejador entero y deja el botón
      // «sin hacer nada», sin toast ni rastro. El linter es el único sitio donde se puede
      // atajar antes de que pase.
      'no-restricted-properties': [
        'error',
        {
          object: 'crypto',
          property: 'randomUUID',
          message:
            'crypto.randomUUID solo existe en contextos seguros (HTTPS o localhost) y este gateway también se sirve sobre HTTP plano. Usá randomUuid() de @/lib/utils.',
        },
        {
          object: 'crypto',
          property: 'subtle',
          message:
            'crypto.subtle solo existe en contextos seguros (HTTPS o localhost) y este gateway también se sirve sobre HTTP plano. El cifrado es responsabilidad del backend.',
        },
      ],
    },
  },
  // Los botones salen de los primitivos de `@/components/ui` (Button, IconButton, TabButton,
  // RowActionButton): un `<button>` crudo copia estilos que luego divergen. Los que de verdad no
  // encajan (chips con `aria-pressed`, disclosures, filas clicables, enlaces en línea) están
  // listados en el override de abajo; ver `docs/ui-conventions.md` §1.
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'No uses <button> crudo: usá Button, IconButton, TabButton o RowActionButton de @/components/ui (docs/ui-conventions.md §1). Si de verdad es un chip, disclosure o fila clicable, agregá el archivo al override de eslint.config.js con el motivo.',
        },
      ],
    },
  },
  // Excepciones a la regla anterior. Un archivo nuevo aquí necesita una razón de las de abajo:
  // - Los primitivos viven en `components/ui` y los tests simulan el DOM a mano.
  // - Chrome de layout con medidas propias (`h-9`): Topbar, ThemeToggle, Sidebar, AppShell, toast.
  // - Chips o toggles con `aria-pressed`, disclosures con `aria-expanded`, filas/resultados
  //   clicables, enlaces de texto en línea y pestañas con diseño propio: no existe un primitivo
  //   para ellos y una variante `link` sería API nueva, no una migración.
  {
    files: [
      'src/components/ui/**',
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/components/layout/{AppShell,Sidebar,ThemeToggle,Topbar}.tsx',
      'src/lib/toast/ToastProvider.tsx',
      'src/features/database-models/components/{MigrationSearchPanel,ModelMigrationForm}.tsx',
      'src/features/database-models/snapshot-wizard/steps/{ManualLayoutStep,ObjectsStep}.tsx',
      'src/features/destructive-approvals/components/DestructivePlanCard.tsx',
      'src/features/integration-tokens/components/IntegrationScopesPicker.tsx',
      'src/features/managed-databases/components/ManagedDatabaseMigrationsContent.tsx',
      'src/features/projects/components/ProjectsPanel.tsx',
      'src/features/schema-comparisons/wizard/steps/ItemsStep.tsx',
      'src/features/server-databases/components/{DatabaseGranteesPanel,ServerDatabasesPanel}.tsx',
      'src/features/servers/components/{EngineUsersPanel,ServerDatabaseCombobox,ServerReconcilePanel}.tsx',
      'src/features/sql-console/components/ResultsPanel.tsx',
      'src/features/sql-console/pages/SqlConsolePage.tsx',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // `randomUuid()` es justamente quien encapsula el respaldo: es el único sitio donde
  // `crypto.randomUUID` puede nombrarse, y lo hace detrás de un `typeof`.
  {
    files: ['src/lib/utils/uuid.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  // Test files: relax fast-refresh constraint and add test globals.
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Vite / tooling config runs in Node and is not type-checked by the app project.
  {
    files: ['*.{ts,js}', 'vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
    extends: [tseslint.configs.disableTypeChecked],
  },
])
