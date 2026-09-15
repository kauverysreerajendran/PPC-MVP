# Frontend Architecture Standard

Applies to React and Next.js applications. React Native projects follow the same layering with platform specific navigation.

## 1. Folder structure

```
src/
  app/                  Next.js routes, layouts, route handlers
  features/             One folder per business feature
    invoices/
      components/       Components used only by this feature
      hooks/            Feature hooks
      services/         API calls for this feature
      types/            TypeScript interfaces
      utils/            Feature specific helpers
  components/           Shared presentational components only
    ui/                 Buttons, inputs, modals, tables
    layout/             Header, sidebar, shell
  lib/
    apiClient.ts        Single configured HTTP client
    auth/               Token handling, session helpers
    validation/         Shared schemas
  hooks/                Cross feature hooks
  store/                Global state slices
  config/               Constants, feature flags, env access
  styles/
```

The rule behind the structure: a feature folder can be deleted without breaking anything outside it. If deleting a feature breaks unrelated screens, the boundary was crossed.

## 2. Layering rules

| Layer | Allowed to do | Not allowed to do |
|---|---|---|
| Route or page | Compose feature components, handle route params | Call the API directly, hold business rules |
| Feature component | Render, handle local UI state, call hooks | Contain fetch or axios calls, contain calculation rules |
| Hook | Data fetching, caching, side effects, derived state | Render JSX |
| Service | HTTP calls, request and response mapping | Touch React state, show alerts |
| UI component | Render from props only | Fetch data, read global state, know about business entities |

A shared UI component that imports anything from `features/` is a design error.

## 3. API access

1. All HTTP calls go through a single client in `lib/apiClient.ts` with a configured base URL, timeout, auth header injection, and a response interceptor.
2. No component calls `fetch` or `axios` directly.
3. Service functions return typed data, not raw responses.
4. Server state is handled by a data fetching library such as TanStack Query or SWR. Server data is not copied into global state.

## 4. State management decision table

| State type | Where it belongs |
|---|---|
| Form field values | Local component state or form library |
| Modal open, tab selected, toggles | Local component state |
| Server data such as lists and records | Data fetching library cache |
| Authenticated user and permissions | Global store or auth context |
| Theme, locale, feature flags | Global store or context |
| Anything derived from other state | Computed at render, never stored |

Global state is the last choice, not the first. A store holding server data creates two sources of truth and produces stale screen defects that are difficult to reproduce.

## 5. Component rules

1. A component file above roughly 250 lines is split. Extract the logic into a hook first, not into more JSX files.
2. Props are typed. No implicit `any`.
3. No inline object or arrow function props on components inside large lists.
4. Conditional rendering deeper than two levels is extracted into a separate component or an early return.
5. Every list rendered from data uses a stable domain key such as the record ID. Array index keys are not accepted for reorderable or editable lists.
6. Every screen implements four states: loading, empty, error, and populated. Shipping only the populated state is an incomplete screen.

## 6. Routing and access control

1. Route protection is enforced by a layout level guard or middleware, not by conditional rendering inside a page.
2. Hiding a menu item is presentation only. It is never treated as access control. The server decides.
3. Deep links to protected routes redirect to login and return to the original route after authentication.
4. Role based menus are driven by a permission list returned by the backend, not hardcoded in the frontend.

## 7. Performance rules

| Rule | Threshold |
|---|---|
| Route level code splitting | Every route lazy loaded by default |
| List virtualization | Required above 200 rendered rows |
| Image handling | Next.js `Image` or equivalent, explicit width and height |
| Initial JS bundle | Under 250 KB gzipped for the first route |
| Memoization | Applied only after a measured re render problem |
| API calls on mount | One aggregated call preferred over sequential dependent calls |

Premature memoization is discouraged. `useMemo` and `useCallback` on trivial values increase code noise and give no measurable benefit.

## 8. Styling

1. One styling approach per project. Mixing Tailwind, CSS modules, and styled components in the same codebase is not allowed.
2. Spacing, colour, radius, and font sizes come from design tokens. No arbitrary hex values in components.
3. Breakpoints are defined once and reused.

## 9. Environment configuration

1. Environment variables are read in `config/` only, never scattered through components.
2. Any variable exposed to the browser is assumed public. No secret is placed in a `NEXT_PUBLIC_` variable.
3. A missing required variable fails the build, not the runtime.

## 10. Accessibility baseline

Form inputs have associated labels. Interactive elements are reachable by keyboard. Focus is visible. Colour is not the only indicator of state. Images have alt text or an empty alt for decorative use.
