# V2 Dashboard Export Report

## Implemented baseline

The Dashboard now offers **Exportar PDF** and **Exportar paquete ZIP** only when a generated plan and current goal are available. The browser builds a read-only `dashboard-plan-export-v1` snapshot from the existing plan/session object, active goal, persisted hydration sibling, and any already-supplied micronutrient observability object.

`lib/export/plan-export-snapshot.mjs` is the sole export source boundary. It does not import the Standard calculator, menu engine, Foods, dishes, shadow micronutrient aggregator, or shopping-list generator. Invalid `NaN`, `Infinity`, undefined, or nonserializable source values fail export rather than becoming fabricated output.

## PDF and ZIP

- PDF uses local pinned `pdf-lib@1.17.1`, renders target/profile context, optional reference-only hydration, days/meals/ingredients/macros, preparation, and shopping list. It supports multiple days and does not require images.
- The ZIP uses local pinned `fflate@0.8.2` and contains exactly `report.pdf`, `plan.json`, and `shopping-list.json`; no filler files.
- Partial micronutrient observability is labeled as partial and is never rendered as an adequacy percentage or exact complete total.
- File names are deterministic from the stable goal identifier. ZIP metadata clamps only impossible pre-1980 ZIP timestamps; exported snapshot timestamps stay unchanged.

## Safety and ownership

Export is client-side, initiated explicitly by the signed-in user, and makes no new API call, persistence write, calculation, food/dish mutation, plan mutation, or longitudinal observation. It uses no image/Gemini asset and does not add a server-side export data store.

## Tests

`tests/v2-dashboard-export.test.js` covers multi-day snapshot/PDF parsing, hydration present/absent, partial micro payload, exact useful ZIP members, non-finite rejection, deterministic file names, local vendor delivery, source-only imports, and no mutation of plan or goal objects.
