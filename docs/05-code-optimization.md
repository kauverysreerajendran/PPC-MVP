# Code Optimization Standard

## 1. Operating rule

Measure before changing. An optimization without a baseline number and a post change number is a guess. Every performance ticket records the metric, the measurement method, the value before, and the value after.

Optimize in this order: correct algorithm and query, then caching, then micro level code changes. Reversing this order produces complex code with no measurable gain.

## 2. Performance budgets

| Metric | Target | Hard limit |
|---|---|---|
| API response, simple read | Under 200 ms | 500 ms |
| API response, complex report | Under 1 s | 3 s, otherwise move to async |
| Database queries per request | Under 10 | 25 |
| Initial JS bundle, first route | Under 250 KB gzipped | 400 KB |
| Largest Contentful Paint | Under 2.5 s | 4 s |
| Time to Interactive | Under 3.5 s | 5 s |
| Background job duration | Under 5 min | 15 min, otherwise split |

Anything exceeding a hard limit is a defect, not a future improvement.

## 3. Backend optimization

| # | Rule |
|---|---|
| 3.1 | Eliminate N+1 queries with `select_related`, `prefetch_related`, or explicit joins. Assert query counts in tests for list endpoints |
| 3.2 | Select only required columns using `only()`, `values()`, or an explicit column list. Avoid `SELECT *` on wide tables |
| 3.3 | Aggregate in the database, not in Python. `COUNT`, `SUM`, and `GROUP BY` belong in SQL |
| 3.4 | Use bulk operations. `bulk_create`, `bulk_update`, and a single `UPDATE` statement replace row by row loops |
| 3.5 | Stream or paginate large exports. Never build a full list in memory |
| 3.6 | Use async endpoints only for IO bound work. Async with a blocking ORM call is slower than sync |
| 3.7 | Configure database connection pooling and persistent connections |
| 3.8 | Move report generation, PDF creation, email, and third party sync to background workers |
| 3.9 | Profile with `django-silk`, `py-spy`, or FastAPI middleware timing before optimizing |

## 4. Frontend optimization

| # | Rule |
|---|---|
| 4.1 | Lazy load routes and heavy components such as charts, editors, and PDF viewers |
| 4.2 | Virtualize lists above 200 rows |
| 4.3 | Debounce search inputs at 300 ms and cancel in flight requests |
| 4.4 | Deduplicate and cache server requests through the data fetching library. Two components requesting the same data should produce one network call |
| 4.5 | Serve images in modern formats with explicit dimensions and lazy loading |
| 4.6 | Avoid state updates in a parent that re render an entire tree. Move state down or split the component |
| 4.7 | Apply `React.memo`, `useMemo`, and `useCallback` only after profiling shows a re render cost |
| 4.8 | Remove unused dependencies. Check bundle composition with a bundle analyzer before each release |
| 4.9 | Import specific modules rather than whole libraries, for example date functions and icon sets |
| 4.10 | Avoid sequential dependent API calls on page load. Request in parallel or provide an aggregated endpoint |

## 5. Code quality rules that affect performance and maintenance

1. A function does one thing. A function above roughly 50 lines is reviewed for extraction.
2. Nesting deeper than three levels is refactored with early returns or guard clauses.
3. Duplicated logic appearing a third time is extracted. Two occurrences may stay.
4. Dead code, commented out blocks, and unused imports are deleted, not left for reference. Version control is the reference.
5. Magic numbers and repeated string literals become named constants.
6. Loops that call the database or an API inside the body are treated as defects.

## 6. Review checklist

| # | Question |
|---|---|
| 1 | Does any new list endpoint have pagination and a bounded query count |
| 2 | Does any loop contain a query, an API call, or a file operation |
| 3 | Are new indexes required for the filters introduced in this change |
| 4 | Does the change increase the initial bundle size, and by how much |
| 5 | Is any synchronous work above two seconds introduced into the request cycle |
| 6 | Are large responses paginated or streamed |
| 7 | Was the performance claim in this PR measured or assumed |
